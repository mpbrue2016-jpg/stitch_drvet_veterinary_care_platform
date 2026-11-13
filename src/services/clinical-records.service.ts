import type {
  ClinicalRecord,
  ClinicalRecordStatus,
  ClinicalVitals,
} from '@/types/entities';
import {
  MOCK_CURRENT_USER_ID,
  MOCK_ORGANIZATION_ID,
  mockAppointments,
  mockClinicalRecords,
  mockDelay,
} from './mock-db';

export interface SaveClinicalRecordInput {
  appointment_id: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  vitals: ClinicalVitals;
  status: ClinicalRecordStatus;
}

export async function listarProntuarios(): Promise<{
  clinicalRecords: ClinicalRecord[];
}> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('clinical_records').select('*, pet:pets(id, name, species)'))
  await mockDelay();
  return {
    clinicalRecords: [...mockClinicalRecords].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    ),
  };
}

export async function buscarProntuarioPorAtendimento(appointmentId: string): Promise<{
  clinicalRecord: ClinicalRecord | null;
  canEdit: boolean;
}> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('clinical_records').select('*').eq('appointment_id', appointmentId).maybeSingle())
  await mockDelay();
  const existing =
    mockClinicalRecords.find((record) => record.appointment_id === appointmentId) ?? null;
  const appointment = mockAppointments.find((apt) => apt.id === appointmentId);
  const canEdit =
    (!existing || existing.status === 'draft') &&
    (!appointment || appointment.veterinarian_id === MOCK_CURRENT_USER_ID);
  return {
    clinicalRecord: existing,
    canEdit,
  };
}

export async function salvarProntuario(
  input: SaveClinicalRecordInput,
): Promise<{ clinicalRecord: ClinicalRecord }> {
  // TODO(AI Studio): trocar por chamada Supabase RPC (supabase.rpc('save_clinical_record', ...))
  await mockDelay();
  const now = new Date().toISOString();
  const index = mockClinicalRecords.findIndex(
    (record) => record.appointment_id === input.appointment_id,
  );
  const appointment = mockAppointments.find((apt) => apt.id === input.appointment_id);

  if (index !== -1) {
    if (mockClinicalRecords[index].status === 'finalized') {
      throw new Error('Este prontuário já foi finalizado e não pode ser alterado.');
    }
    const updated: ClinicalRecord = {
      ...mockClinicalRecords[index],
      subjective: input.subjective,
      objective: input.objective,
      assessment: input.assessment,
      plan: input.plan,
      vitals: input.vitals,
      status: input.status,
      finalized_at: input.status === 'finalized' ? now : null,
      updated_at: now,
    };
    mockClinicalRecords[index] = updated;
    return { clinicalRecord: updated };
  }

  const created: ClinicalRecord = {
    id: `soap-${Date.now()}`,
    appointment_id: input.appointment_id,
    organization_id: appointment?.organization_id ?? MOCK_ORGANIZATION_ID,
    pet_id: appointment?.pet_id ?? 'pet-pipoca-001',
    veterinarian_id: MOCK_CURRENT_USER_ID,
    subjective: input.subjective,
    objective: input.objective,
    assessment: input.assessment,
    plan: input.plan,
    vitals: input.vitals,
    status: input.status,
    finalized_at: input.status === 'finalized' ? now : null,
    created_at: now,
    updated_at: now,
    pet: appointment?.pet ?? null,
  };
  mockClinicalRecords.unshift(created);
  return { clinicalRecord: created };
}
