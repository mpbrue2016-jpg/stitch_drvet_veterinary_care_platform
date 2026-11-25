import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canAccessAppointment,
  canAccessOrganizationResource,
  canReadClinicalRecord,
  canReadVaccinationRecord,
  evaluateAppointmentTransition,
  evaluateClinicalRecordWrite,
  evaluateVaccinationWrite,
  type AppointmentAccessRecord,
} from '../src/lib/clinical/server-flows';
import {
  clinicalRecordSchema,
  createBookingSchema,
  createExamOrderSchema,
  createPetSchema,
  createVaccinationSchema,
} from '../src/lib/validations';

const ORG_A = '10000000-0000-4000-8000-000000000001';
const ORG_B = '10000000-0000-4000-8000-000000000002';

const TUTOR_A = '20000000-0000-4000-8000-000000000001';
const TUTOR_B = '20000000-0000-4000-8000-000000000002';
const VET_A = '30000000-0000-4000-8000-000000000001';
const VET_B = '30000000-0000-4000-8000-000000000002';
const ADMIN_ID = '40000000-0000-4000-8000-000000000001';
const PET_A = '50000000-0000-4000-8000-000000000001';
const APPT_ID = '60000000-0000-4000-8000-000000000001';

const futureAppointment: AppointmentAccessRecord = {
  id: APPT_ID,
  organization_id: ORG_A,
  pet_id: PET_A,
  tutor_id: TUTOR_A,
  veterinarian_id: VET_A,
  status: 'pending',
  starts_at: '2026-12-01T14:00:00.000Z',
  ends_at: '2026-12-01T14:30:00.000Z',
};

const NOW_BEFORE_START = new Date('2026-12-01T12:00:00.000Z').getTime();
const NOW_DURING_APPT = new Date('2026-12-01T14:10:00.000Z').getTime();
const NOW_AFTER_END = new Date('2026-12-01T15:00:00.000Z').getTime();

test('isolamento entre organizações bloqueia acesso cruzado entre Org A e Org B', () => {
  const orgAMember = [{ organization_id: ORG_A, role: 'owner' as const }];

  assert.equal(
    canAccessOrganizationResource({
      actorRole: 'partner',
      actorMemberships: orgAMember,
      targetOrganizationId: ORG_A,
      allowedOrgRoles: ['owner', 'admin'],
    }),
    true,
  );

  assert.equal(
    canAccessOrganizationResource({
      actorRole: 'partner',
      actorMemberships: orgAMember,
      targetOrganizationId: ORG_B,
      allowedOrgRoles: ['owner', 'admin'],
    }),
    false,
  );

  assert.equal(
    canAccessOrganizationResource({
      actorRole: 'veterinarian',
      actorMemberships: [{ organization_id: ORG_A, role: 'staff' }],
      targetOrganizationId: ORG_A,
      allowedOrgRoles: ['owner', 'admin'],
    }),
    false,
  );

  assert.equal(
    canAccessOrganizationResource({
      actorRole: 'admin',
      actorMemberships: [],
      targetOrganizationId: ORG_B,
      allowedOrgRoles: ['owner'],
    }),
    true,
  );
});

test('agendamentos garantem isolamento entre tutores, veterinários de outra clínica e transições válidas', () => {
  assert.equal(
    canAccessAppointment({
      actorId: TUTOR_A,
      actorRole: 'tutor',
      actorMemberships: [],
      appointment: futureAppointment,
    }),
    true,
  );

  assert.equal(
    canAccessAppointment({
      actorId: TUTOR_B,
      actorRole: 'tutor',
      actorMemberships: [],
      appointment: futureAppointment,
    }),
    false,
  );

  // Gestor de outra clínica (ORG_B) não acessa agendamento da ORG_A
  assert.equal(
    canAccessAppointment({
      actorId: VET_B,
      actorRole: 'partner',
      actorMemberships: [{ organization_id: ORG_B, role: 'owner' }],
      appointment: futureAppointment,
    }),
    false,
  );

  // Tutor A não pode confirmar sua própria consulta
  const tutorConfirm = evaluateAppointmentTransition({
    actorId: TUTOR_A,
    actorRole: 'tutor',
    actorMemberships: [],
    isApprovedVetInOrg: false,
    appointment: futureAppointment,
    nextStatus: 'confirmed',
    nowMs: NOW_BEFORE_START,
  });
  assert.equal(tutorConfirm.allowed, false);
  if (!tutorConfirm.allowed) assert.equal(tutorConfirm.status, 403);

  // Veterinário designado aprovado confirma consulta pendente futura
  const vetConfirm = evaluateAppointmentTransition({
    actorId: VET_A,
    actorRole: 'veterinarian',
    actorMemberships: [{ organization_id: ORG_A, role: 'veterinarian' }],
    isApprovedVetInOrg: true,
    appointment: futureAppointment,
    nextStatus: 'confirmed',
    nowMs: NOW_BEFORE_START,
  });
  assert.equal(vetConfirm.allowed, true);

  // Não pode concluir antes do ends_at
  const confirmedAppt: AppointmentAccessRecord = {
    ...futureAppointment,
    status: 'confirmed',
  };
  const earlyComplete = evaluateAppointmentTransition({
    actorId: VET_A,
    actorRole: 'veterinarian',
    actorMemberships: [{ organization_id: ORG_A, role: 'veterinarian' }],
    isApprovedVetInOrg: true,
    appointment: confirmedAppt,
    nextStatus: 'completed',
    nowMs: NOW_DURING_APPT,
  });
  assert.equal(earlyComplete.allowed, false);
  if (!earlyComplete.allowed) assert.equal(earlyComplete.status, 409);

  // Após ends_at pode concluir
  const validComplete = evaluateAppointmentTransition({
    actorId: VET_A,
    actorRole: 'veterinarian',
    actorMemberships: [{ organization_id: ORG_A, role: 'veterinarian' }],
    isApprovedVetInOrg: true,
    appointment: confirmedAppt,
    nextStatus: 'completed',
    nowMs: NOW_AFTER_END,
  });
  assert.equal(validComplete.allowed, true);
});

test('prontuário clínico oculta rascunho do tutor, bloqueia alteração após finalizado e exige SOAP completo', () => {
  const confirmedAppt: AppointmentAccessRecord = {
    ...futureAppointment,
    status: 'confirmed',
  };

  // Rascunho não visível para o tutor
  assert.equal(
    canReadClinicalRecord({
      actorId: TUTOR_A,
      actorRole: 'tutor',
      actorMemberships: [],
      isApprovedVetInOrg: false,
      appointment: confirmedAppt,
      record: {
        appointment_id: APPT_ID,
        organization_id: ORG_A,
        veterinarian_id: VET_A,
        status: 'draft',
      },
    }),
    false,
  );

  // Finalizado visível para o tutor dono do pet
  assert.equal(
    canReadClinicalRecord({
      actorId: TUTOR_A,
      actorRole: 'tutor',
      actorMemberships: [],
      isApprovedVetInOrg: false,
      appointment: confirmedAppt,
      record: {
        appointment_id: APPT_ID,
        organization_id: ORG_A,
        veterinarian_id: VET_A,
        status: 'finalized',
      },
    }),
    true,
  );

  // Outro tutor nunca lê
  assert.equal(
    canReadClinicalRecord({
      actorId: TUTOR_B,
      actorRole: 'tutor',
      actorMemberships: [],
      isApprovedVetInOrg: false,
      appointment: confirmedAppt,
      record: {
        appointment_id: APPT_ID,
        organization_id: ORG_A,
        veterinarian_id: VET_A,
        status: 'finalized',
      },
    }),
    false,
  );

  // Outro veterinário não designado é bloqueado na escrita
  const wrongVetWrite = evaluateClinicalRecordWrite({
    actorId: VET_B,
    isApprovedVetInOrg: true,
    appointment: confirmedAppt,
    targetStatus: 'draft',
    sections: { subjective: 'x', objective: '', assessment: '', plan: '' },
    nowMs: NOW_DURING_APPT,
  });
  assert.equal(wrongVetWrite.allowed, false);
  if (!wrongVetWrite.allowed) assert.equal(wrongVetWrite.status, 403);

  // Finalização sem todas as seções SOAP falha com 400
  const incompleteFinalize = evaluateClinicalRecordWrite({
    actorId: VET_A,
    isApprovedVetInOrg: true,
    appointment: confirmedAppt,
    targetStatus: 'finalized',
    sections: { subjective: 'Apatia', objective: 'FC 110', assessment: '', plan: 'Repouso' },
    nowMs: NOW_DURING_APPT,
  });
  assert.equal(incompleteFinalize.allowed, false);
  if (!incompleteFinalize.allowed) assert.equal(incompleteFinalize.status, 400);

  // Registro já finalizado é imutável (409)
  const immutableCheck = evaluateClinicalRecordWrite({
    actorId: VET_A,
    isApprovedVetInOrg: true,
    appointment: confirmedAppt,
    existingStatus: 'finalized',
    targetStatus: 'finalized',
    sections: { subjective: 'S', objective: 'O', assessment: 'A', plan: 'P' },
    nowMs: NOW_AFTER_END,
  });
  assert.equal(immutableCheck.allowed, false);
  if (!immutableCheck.allowed) assert.equal(immutableCheck.status, 409);
});

test('carteira de vacinação permite leitura ao tutor e restringe registro ao veterinário após o atendimento', () => {
  const completedAppt: AppointmentAccessRecord = {
    ...futureAppointment,
    status: 'completed',
  };

  assert.equal(
    canReadVaccinationRecord({
      actorId: TUTOR_A,
      actorRole: 'tutor',
      isApprovedVetInOrg: false,
      appointment: completedAppt,
    }),
    true,
  );
  assert.equal(
    canReadVaccinationRecord({
      actorId: TUTOR_B,
      actorRole: 'tutor',
      isApprovedVetInOrg: false,
      appointment: completedAppt,
    }),
    false,
  );
  assert.equal(
    canReadVaccinationRecord({
      actorId: ADMIN_ID,
      actorRole: 'admin',
      isApprovedVetInOrg: false,
      appointment: completedAppt,
    }),
    true,
  );

  // Tutor não registra vacina
  const tutorWrite = evaluateVaccinationWrite({
    actorId: TUTOR_A,
    isApprovedVetInOrg: false,
    appointment: completedAppt,
    nowMs: NOW_AFTER_END,
  });
  assert.equal(tutorWrite.allowed, false);
  if (!tutorWrite.allowed) assert.equal(tutorWrite.status, 403);

  // Veterinário antes de ends_at é bloqueado
  const beforeEndWrite = evaluateVaccinationWrite({
    actorId: VET_A,
    isApprovedVetInOrg: true,
    appointment: completedAppt,
    nowMs: NOW_DURING_APPT,
  });
  assert.equal(beforeEndWrite.allowed, false);

  // Veterinário aprovado após ends_at é autorizado
  const validWrite = evaluateVaccinationWrite({
    actorId: VET_A,
    isApprovedVetInOrg: true,
    appointment: completedAppt,
    nowMs: NOW_AFTER_END,
  });
  assert.equal(validWrite.allowed, true);
});

test('validações Zod de cadastro de pet, agendamento, prontuário, vacinação e exames', () => {
  assert.equal(
    createPetSchema.safeParse({
      name: 'Pipoca',
      species: 'Cachorro',
      breed: 'SRD',
      birth_date: '2022-05-10',
      sex: 'female',
      notes: 'Peso aproximado: 8.5 kg',
    }).success,
    true,
  );
  assert.equal(
    createPetSchema.safeParse({ name: '', species: 'Cachorro' }).success,
    false,
  );

  assert.equal(
    createBookingSchema.safeParse({
      availability_id: APPT_ID,
      pet_id: PET_A,
      kind: 'teleconsultation',
      reason: 'Check-up anual',
    }).success,
    true,
  );

  assert.equal(
    clinicalRecordSchema.safeParse({
      appointment_id: APPT_ID,
      subjective: 'Tutor relata tosse seca',
      objective: 'Ausculta limpa',
      assessment: 'Traqueobronquite leve',
      plan: 'Hidratação e acompanhamento',
      vitals: {
        weight_kg: 10.4,
        temperature_c: 38.6,
        heart_rate_bpm: 110,
        respiratory_rate_rpm: 24,
        mucous_membranes: 'Normocoradas',
        capillary_refill_seconds: 2,
      },
      status: 'finalized',
    }).success,
    true,
  );

  // Próxima dose anterior à aplicação deve falhar
  assert.equal(
    createVaccinationSchema.safeParse({
      appointment_id: APPT_ID,
      vaccine_name: 'V10 Polivalente',
      administered_on: '2026-11-20',
      next_due_on: '2026-11-10',
    }).success,
    false,
  );

  assert.equal(
    createExamOrderSchema.safeParse({
      appointment_id: APPT_ID,
      modality: 'laboratory',
      exam_name: 'Hemograma Completo',
      clinical_indication: 'Investigação de apatia',
    }).success,
    true,
  );
});
