import type {
  Appointment,
  AvailabilitySlot,
  ClinicalRecord,
  CommissionEntry,
  CommissionSummary,
  ExamOrder,
  Organization,
  Pet,
  PrescriptionDraft,
  VaccinationRecord,
  VeterinarianProfile,
} from '@/types/entities';

export const MOCK_CURRENT_USER_ID = 'vet-camila-001';
export const MOCK_ORGANIZATION_ID = 'org-drvet-vila-mariana';
export const MOCK_TUTOR_ID = 'tutor-mariana-001';

function isoOffset(daysFromToday: number, hour: number, minute = 0): string {
  const base = new Date();
  base.setHours(hour, minute, 0, 0);
  base.setDate(base.getDate() + daysFromToday);
  return base.toISOString();
}

function dateOffset(daysFromToday: number): string {
  const base = new Date();
  base.setDate(base.getDate() + daysFromToday);
  const year = base.getFullYear();
  const month = String(base.getMonth() + 1).padStart(2, '0');
  const day = String(base.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const mockDelay = (ms = 180) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export const mockOrganizations: Organization[] = [
  {
    id: MOCK_ORGANIZATION_ID,
    name: 'Clínica Pet Care Vila Mariana',
    role: 'veterinarian',
    created_at: isoOffset(-60, 9),
  },
];

export const mockProfessionals: VeterinarianProfile[] = [
  {
    organization_id: MOCK_ORGANIZATION_ID,
    user_id: MOCK_CURRENT_USER_ID,
    display_name: 'Dra. Camila Nogueira',
    registration_number: '28491',
    registration_region: 'SP',
    specialty: 'Clínica Geral e Dermatologia',
    status: 'approved',
    created_at: isoOffset(-55, 10),
  },
  {
    organization_id: MOCK_ORGANIZATION_ID,
    user_id: 'vet-rafael-002',
    display_name: 'Dr. Rafael Tavares',
    registration_number: '31904',
    registration_region: 'SP',
    specialty: 'Cardiologia Veterinária',
    status: 'pending',
    created_at: isoOffset(-2, 14),
  },
];

export const mockPets: Pet[] = [
  {
    id: 'pet-pipoca-001',
    owner_id: MOCK_TUTOR_ID,
    name: 'Pipoca',
    species: 'Cachorro',
    breed: 'SRD (Porte médio)',
    birth_date: '2021-05-14',
    sex: 'female',
    notes: 'Alergia alimentar leve em acompanhamento dermatológico.',
    created_at: isoOffset(-45, 10),
    updated_at: isoOffset(-3, 15),
  },
  {
    id: 'pet-thor-002',
    owner_id: MOCK_TUTOR_ID,
    name: 'Thor',
    species: 'Cachorro',
    breed: 'Bulldog Francês',
    birth_date: '2020-09-02',
    sex: 'male',
    notes: 'Sensibilidade respiratória em dias muito quentes.',
    created_at: isoOffset(-30, 11),
    updated_at: isoOffset(-5, 9),
  },
  {
    id: 'pet-luna-003',
    owner_id: MOCK_TUTOR_ID,
    name: 'Luna',
    species: 'Gato',
    breed: 'Siamês',
    birth_date: '2018-02-20',
    sex: 'female',
    notes: 'Acompanhamento renal preventivo.',
    created_at: isoOffset(-25, 16),
    updated_at: isoOffset(-1, 18),
  },
];

export const mockAvailability: AvailabilitySlot[] = [
  {
    id: 'slot-001',
    organization_id: MOCK_ORGANIZATION_ID,
    veterinarian_id: MOCK_CURRENT_USER_ID,
    starts_at: isoOffset(1, 9, 0),
    ends_at: isoOffset(1, 9, 45),
    is_available: true,
    is_blocked: false,
    block_reason: null,
  },
  {
    id: 'slot-002',
    organization_id: MOCK_ORGANIZATION_ID,
    veterinarian_id: MOCK_CURRENT_USER_ID,
    starts_at: isoOffset(1, 10, 0),
    ends_at: isoOffset(1, 10, 45),
    is_available: true,
    is_blocked: false,
    block_reason: null,
  },
  {
    id: 'slot-003',
    organization_id: MOCK_ORGANIZATION_ID,
    veterinarian_id: MOCK_CURRENT_USER_ID,
    starts_at: isoOffset(1, 15, 0),
    ends_at: isoOffset(1, 15, 45),
    is_available: true,
    is_blocked: false,
    block_reason: null,
  },
  {
    id: 'slot-004',
    organization_id: MOCK_ORGANIZATION_ID,
    veterinarian_id: MOCK_CURRENT_USER_ID,
    starts_at: isoOffset(2, 11, 0),
    ends_at: isoOffset(2, 11, 45),
    is_available: true,
    is_blocked: false,
    block_reason: null,
  },
  {
    id: 'slot-005',
    organization_id: MOCK_ORGANIZATION_ID,
    veterinarian_id: MOCK_CURRENT_USER_ID,
    starts_at: isoOffset(2, 16, 0),
    ends_at: isoOffset(2, 16, 45),
    is_available: false,
    is_blocked: true,
    block_reason: 'Reunião clínica interna',
  },
  {
    id: 'slot-006',
    organization_id: MOCK_ORGANIZATION_ID,
    veterinarian_id: MOCK_CURRENT_USER_ID,
    starts_at: isoOffset(3, 14, 0),
    ends_at: isoOffset(3, 14, 45),
    is_available: true,
    is_blocked: false,
    block_reason: null,
  },
];

export const mockAppointments: Appointment[] = [
  {
    id: 'apt-pipoca-completed',
    availability_id: 'slot-past-01',
    organization_id: MOCK_ORGANIZATION_ID,
    pet_id: 'pet-pipoca-001',
    tutor_id: MOCK_TUTOR_ID,
    veterinarian_id: MOCK_CURRENT_USER_ID,
    kind: 'teleconsultation',
    status: 'completed',
    reason: 'Retorno dermatológico e revisão da dieta hipoalergênica.',
    starts_at: isoOffset(-2, 10, 0),
    ends_at: isoOffset(-2, 10, 45),
    pet: { id: 'pet-pipoca-001', name: 'Pipoca', species: 'Cachorro' },
  },
  {
    id: 'apt-luna-confirmed',
    availability_id: 'slot-past-02',
    organization_id: MOCK_ORGANIZATION_ID,
    pet_id: 'pet-luna-003',
    tutor_id: MOCK_TUTOR_ID,
    veterinarian_id: MOCK_CURRENT_USER_ID,
    kind: 'teleconsultation',
    status: 'confirmed',
    reason: 'Avaliação de exames renais e ajuste de quelante.',
    starts_at: isoOffset(-1, 14, 0),
    ends_at: isoOffset(-1, 14, 45),
    pet: { id: 'pet-luna-003', name: 'Luna', species: 'Gato' },
  },
  {
    id: 'apt-thor-pending',
    availability_id: 'slot-future-01',
    organization_id: MOCK_ORGANIZATION_ID,
    pet_id: 'pet-thor-002',
    tutor_id: MOCK_TUTOR_ID,
    veterinarian_id: MOCK_CURRENT_USER_ID,
    kind: 'in_person',
    status: 'pending',
    reason: 'Triagem respiratória e check-up anual.',
    starts_at: isoOffset(0, 16, 0),
    ends_at: isoOffset(0, 16, 45),
    pet: { id: 'pet-thor-002', name: 'Thor', species: 'Cachorro' },
  },
  {
    id: 'apt-pipoca-upcoming',
    availability_id: 'slot-future-02',
    organization_id: MOCK_ORGANIZATION_ID,
    pet_id: 'pet-pipoca-001',
    tutor_id: MOCK_TUTOR_ID,
    veterinarian_id: MOCK_CURRENT_USER_ID,
    kind: 'teleconsultation',
    status: 'confirmed',
    reason: 'Acompanhamento de manutenção dermatológica.',
    starts_at: isoOffset(1, 11, 0),
    ends_at: isoOffset(1, 11, 45),
    pet: { id: 'pet-pipoca-001', name: 'Pipoca', species: 'Cachorro' },
  },
];

export const mockClinicalRecords: ClinicalRecord[] = [
  {
    id: 'soap-pipoca-001',
    appointment_id: 'apt-pipoca-completed',
    organization_id: MOCK_ORGANIZATION_ID,
    pet_id: 'pet-pipoca-001',
    veterinarian_id: MOCK_CURRENT_USER_ID,
    subjective:
      'Tutora relata melhora significativa do prurido após troca para ração hidrolisada há 21 dias. Sem episódios de vômito.',
    objective:
      'Mucosas normocoradas, hidratação preservada, pelagem sem novas lesões crostosas em região abdominal.',
    assessment:
      'Boa resposta clínica ao manejo nutricional para dermatite trofoalérgica.',
    plan:
      'Manter dieta exclusiva por mais 30 dias e retornar por teleconsulta para reavaliação.',
    vitals: {
      weight_kg: 11.4,
      temperature_c: 38.5,
      heart_rate_bpm: 96,
      respiratory_rate_rpm: 24,
      mucous_membranes: 'Normocoradas',
      capillary_refill_seconds: 1.5,
    },
    status: 'finalized',
    finalized_at: isoOffset(-2, 10, 50),
    created_at: isoOffset(-2, 10, 20),
    updated_at: isoOffset(-2, 10, 50),
    pet: { id: 'pet-pipoca-001', name: 'Pipoca', species: 'Cachorro' },
  },
  {
    id: 'soap-luna-002',
    appointment_id: 'apt-luna-confirmed',
    organization_id: MOCK_ORGANIZATION_ID,
    pet_id: 'pet-luna-003',
    veterinarian_id: MOCK_CURRENT_USER_ID,
    subjective:
      'Tutor refere ingestão hídrica estável e apetite seletivo nos últimos 3 dias.',
    objective:
      'Paciente alerta em vídeo, escore corporal 4/9, sem sinais de desconforto respiratório.',
    assessment:
      'Doença renal crônica estágio II em acompanhamento contínuo; aguarda novo perfil bioquímico.',
    plan:
      'Solicitar ureia, creatinina e fósforo sérico antes de ajustar quelante.',
    vitals: {
      weight_kg: 3.9,
      temperature_c: 38.3,
      heart_rate_bpm: 152,
      respiratory_rate_rpm: 28,
      mucous_membranes: 'Róseas',
      capillary_refill_seconds: 1.5,
    },
    status: 'draft',
    finalized_at: null,
    created_at: isoOffset(-1, 14, 15),
    updated_at: isoOffset(-1, 14, 40),
    pet: { id: 'pet-luna-003', name: 'Luna', species: 'Gato' },
  },
];

export const mockVaccinations: VaccinationRecord[] = [
  {
    id: 'vac-001',
    appointment_id: 'apt-pipoca-completed',
    organization_id: MOCK_ORGANIZATION_ID,
    pet_id: 'pet-pipoca-001',
    veterinarian_id: MOCK_CURRENT_USER_ID,
    vaccine_name: 'V10 (Óctupla / Déctupla Canina)',
    administered_on: dateOffset(-90),
    batch_number: 'LT-2026-8841',
    manufacturer: 'Zoetis',
    next_due_on: dateOffset(275),
    notes: 'Aplicação subcutânea sem intercorrências pós-vacinais.',
    created_at: isoOffset(-90, 11),
    pet: { id: 'pet-pipoca-001', name: 'Pipoca', species: 'Cachorro' },
  },
  {
    id: 'vac-002',
    appointment_id: 'apt-pipoca-completed',
    organization_id: MOCK_ORGANIZATION_ID,
    pet_id: 'pet-thor-002',
    veterinarian_id: MOCK_CURRENT_USER_ID,
    vaccine_name: 'Antirrábica',
    administered_on: dateOffset(-45),
    batch_number: 'RB-99402',
    manufacturer: 'Boehringer Ingelheim',
    next_due_on: dateOffset(320),
    notes: 'Reforço anual registrado em consulta presencial.',
    created_at: isoOffset(-45, 16),
    pet: { id: 'pet-thor-002', name: 'Thor', species: 'Cachorro' },
  },
];

export const mockExamOrders: ExamOrder[] = [
  {
    id: 'exam-001',
    appointment_id: 'apt-luna-confirmed',
    organization_id: MOCK_ORGANIZATION_ID,
    pet_id: 'pet-luna-003',
    veterinarian_id: MOCK_CURRENT_USER_ID,
    modality: 'laboratory',
    exam_name: 'Perfil Renal + Fósforo Sérico + SDMA',
    clinical_indication:
      'Monitoramento trimestral de função renal e fósforo para ajuste de quelante.',
    instructions: 'Jejum alimentar de 8 horas; água à vontade.',
    status: 'requested',
    result_summary: null,
    laboratory_name: null,
    performed_at: null,
    requested_at: isoOffset(-1, 14, 30),
    resulted_at: null,
    created_at: isoOffset(-1, 14, 30),
    pet: { id: 'pet-luna-003', name: 'Luna', species: 'Gato' },
  },
  {
    id: 'exam-002',
    appointment_id: 'apt-pipoca-completed',
    organization_id: MOCK_ORGANIZATION_ID,
    pet_id: 'pet-pipoca-001',
    veterinarian_id: MOCK_CURRENT_USER_ID,
    modality: 'imaging',
    exam_name: 'Ultrassonografia Abdominal Total',
    clinical_indication: 'Descartar alterações gastrointestinais associadas.',
    instructions: 'Evitar micção 1 hora antes do exame.',
    status: 'resulted',
    result_summary:
      'Fígado, baço e alças intestinais com ecogenicidade preservada. Sem líquido livre.',
    laboratory_name: 'Centro Diagnóstico Vet Imagem SP',
    performed_at: isoOffset(-3, 11, 0),
    requested_at: isoOffset(-5, 9, 0),
    resulted_at: isoOffset(-2, 9, 30),
    created_at: isoOffset(-5, 9, 0),
    pet: { id: 'pet-pipoca-001', name: 'Pipoca', species: 'Cachorro' },
  },
];

export const mockPrescriptionDrafts: PrescriptionDraft[] = [
  {
    id: 'rx-draft-001',
    appointment_id: 'apt-luna-confirmed',
    organization_id: MOCK_ORGANIZATION_ID,
    pet_id: 'pet-luna-003',
    veterinarian_id: MOCK_CURRENT_USER_ID,
    items: [
      {
        name: 'Hidróxido de Alumínio (Quelante de Fósforo)',
        presentation: 'Suspensão oral manipulada',
        dose: '30 mg/kg/dia divididos nas refeições',
        route: 'Oral',
        frequency: 'A cada 12 horas',
        duration: '30 dias (rascunho sujeito à revisão após exame)',
        quantity: '1 frasco de 60 mL',
        instructions: 'Misturar imediatamente antes da oferta do alimento úmido.',
      },
    ],
    updated_by: MOCK_CURRENT_USER_ID,
    created_at: isoOffset(-1, 14, 35),
    updated_at: isoOffset(-1, 14, 35),
  },
];

export const mockCommissionSummary: CommissionSummary = {
  available_cents: 124500,
  period_total_cents: 389000,
  pending_cents: 64500,
  accumulated_cents: 1428000,
  provider_connected: false,
  payout_account_label: 'Banco Inter · Ag 0001 · CC 88412-9 (Simulação)',
  pix_key_masked: '***.482.910-** (Modo demonstração)',
  period_label: 'Novembro de 2026 (dados mock)',
};

export const mockCommissionEntries: CommissionEntry[] = [
  {
    id: 'com-001',
    reference: 'TELE-2026-1042',
    tutor_name: 'Mariana Costa',
    pet_name: 'Pipoca',
    origin: 'teleconsultation',
    gross_amount_cents: 18000,
    net_amount_cents: 15300,
    status: 'available',
    occurred_at: isoOffset(-2, 10, 45),
  },
  {
    id: 'com-002',
    reference: 'TELE-2026-1049',
    tutor_name: 'Carlos Eduardo',
    pet_name: 'Luna',
    origin: 'teleconsultation',
    gross_amount_cents: 21000,
    net_amount_cents: 17850,
    status: 'pending',
    occurred_at: isoOffset(-1, 14, 45),
  },
  {
    id: 'com-003',
    reference: 'FARM-2026-0318',
    tutor_name: 'Ana Beatriz',
    pet_name: 'Thor',
    origin: 'pharmacy_split',
    gross_amount_cents: 24500,
    net_amount_cents: 3675,
    status: 'paid',
    occurred_at: isoOffset(-4, 17, 20),
  },
];
