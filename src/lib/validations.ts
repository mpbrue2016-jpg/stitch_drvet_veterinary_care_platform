import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email('Informe um e-mail válido.'),
  password: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.'),
});

export const signUpSchema = loginSchema.extend({
  displayName: z
    .string()
    .trim()
    .min(2, 'Informe seu nome completo (mínimo 2 caracteres).')
    .max(120, 'Nome muito longo (máximo 120 caracteres).'),
});

export const resetRequestSchema = z.object({
  email: z.string().trim().email('Informe um e-mail válido.'),
});

export const newPasswordSchema = z
  .object({
    password: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.'),
    confirmation: z.string().min(8, 'Confirme a nova senha.'),
  })
  .refine((data) => data.password === data.confirmation, {
    message: 'As senhas informadas não coincidem.',
    path: ['confirmation'],
  });

export const createPetSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Informe o nome do pet.')
    .max(100, 'Nome do pet deve ter até 100 caracteres.'),
  species: z
    .string()
    .trim()
    .min(1, 'Informe a espécie do pet.')
    .max(60, 'Espécie deve ter até 60 caracteres.'),
  breed: z.string().trim().max(100, 'Raça deve ter até 100 caracteres.').nullable().optional(),
  birth_date: z.string().trim().nullable().optional(),
});

export const createBookingSchema = z.object({
  availability_id: z.string().min(1, 'Selecione um horário disponível.'),
  pet_id: z.string().min(1, 'Selecione ou cadastre um pet antes de continuar.'),
  kind: z.enum(['teleconsultation', 'in_person']),
  reason: z.string().trim().max(1000, 'Motivo deve ter até 1000 caracteres.').nullable().optional(),
});

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'O nome da organização deve ter pelo menos 2 caracteres.')
    .max(120, 'Máximo de 120 caracteres.'),
});

export const registerVeterinarianSchema = z.object({
  organization_id: z.string().min(1, 'Selecione uma organização.'),
  user_id: z.string().trim().min(3, 'Informe o ID da conta do profissional.'),
  registration_number: z
    .string()
    .trim()
    .min(2, 'Informe o número do registro CRMV.')
    .max(32, 'Registro deve ter até 32 caracteres.'),
  registration_region: z
    .string()
    .trim()
    .length(2, 'A UF do registro deve ter exatamente 2 letras.')
    .transform((val) => val.toUpperCase()),
  specialty: z.string().trim().max(120, 'Especialidade deve ter até 120 caracteres.').optional(),
});

export const createAvailabilitySchema = z
  .object({
    organization_id: z.string().min(1, 'Organização obrigatória.'),
    starts_at: z.string().min(1, 'Informe a data e hora de início.'),
    ends_at: z.string().min(1, 'Informe a data e hora de término.'),
  })
  .refine(
    (data) => new Date(data.ends_at).getTime() > new Date(data.starts_at).getTime(),
    {
      message: 'O horário de término deve ser posterior ao início.',
      path: ['ends_at'],
    },
  );

export const clinicalRecordSchema = z.object({
  appointment_id: z.string().min(1, 'Atendimento inválido.'),
  subjective: z.string().max(10000, 'Limite de 10.000 caracteres.'),
  objective: z.string().max(10000, 'Limite de 10.000 caracteres.'),
  assessment: z.string().max(10000, 'Limite de 10.000 caracteres.'),
  plan: z.string().max(10000, 'Limite de 10.000 caracteres.'),
  vitals: z.object({
    weight_kg: z.number().min(0, 'Peso não pode ser negativo.').max(500, 'Peso inválido.').nullable(),
    temperature_c: z.number().min(25, 'Temperatura muito baixa.').max(45, 'Temperatura muito alta.').nullable(),
    heart_rate_bpm: z.number().min(10, 'FC inválida.').max(400, 'FC inválida.').nullable(),
    respiratory_rate_rpm: z.number().min(4, 'FR inválida.').max(200, 'FR inválida.').nullable(),
    mucous_membranes: z.string().max(100).nullable(),
    capillary_refill_seconds: z.number().min(0).max(20).nullable(),
  }),
});

export const createVaccinationSchema = z
  .object({
    appointment_id: z.string().min(1, 'Selecione o atendimento concluído.'),
    vaccine_name: z
      .string()
      .trim()
      .min(2, 'Informe o nome da vacina.')
      .max(160, 'Máximo de 160 caracteres.'),
    administered_on: z.string().min(1, 'Informe a data de aplicação.'),
    batch_number: z.string().trim().max(80).nullable().optional(),
    manufacturer: z.string().trim().max(120).nullable().optional(),
    next_due_on: z.string().trim().nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine(
    (data) =>
      !data.next_due_on ||
      new Date(data.next_due_on).getTime() >= new Date(data.administered_on).getTime(),
    {
      message: 'A próxima dose não pode ser anterior à data de aplicação.',
      path: ['next_due_on'],
    },
  );

export const createExamOrderSchema = z.object({
  appointment_id: z.string().min(1, 'Selecione um atendimento.'),
  modality: z.enum(['laboratory', 'imaging']),
  exam_name: z
    .string()
    .trim()
    .min(2, 'Informe o nome do exame.')
    .max(160, 'Máximo de 160 caracteres.'),
  clinical_indication: z
    .string()
    .trim()
    .min(3, 'Descreva a indicação clínica.')
    .max(2000, 'Máximo de 2000 caracteres.'),
  instructions: z.string().trim().max(2000).nullable().optional(),
});

export const recordExamResultSchema = z.object({
  id: z.string().min(1),
  result_summary: z
    .string()
    .trim()
    .min(3, 'Informe o resumo do resultado.')
    .max(10000, 'Máximo de 10.000 caracteres.'),
  laboratory_name: z.string().trim().max(160).nullable().optional(),
  performed_at: z.string().nullable().optional(),
});

export const prescriptionItemSchema = z.object({
  name: z.string().trim().min(2, 'Informe o medicamento ou princípio ativo.').max(160),
  presentation: z.string().trim().max(120),
  dose: z.string().trim().max(250),
  route: z.string().trim().max(100),
  frequency: z.string().trim().max(160),
  duration: z.string().trim().max(160),
  quantity: z.string().trim().max(120),
  instructions: z.string().trim().max(1000),
});

export const savePrescriptionDraftSchema = z.object({
  appointment_id: z.string().min(1, 'Selecione um atendimento.'),
  items: z
    .array(prescriptionItemSchema)
    .min(1, 'Adicione pelo menos 1 item na receita.')
    .max(30, 'Máximo de 30 itens por receita.'),
});

export const anticipationRequestSchema = z.object({
  amount_cents: z.number().int().positive('Informe um valor válido para antecipação.'),
  notes: z.string().trim().max(300).optional(),
});

export const updateProfileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(2, 'Informe seu nome (mínimo 2 caracteres).')
    .max(120, 'Nome deve ter até 120 caracteres.'),
  phone: z
    .string()
    .trim()
    .max(32, 'Telefone deve ter até 32 caracteres.')
    .nullable()
    .optional(),
});
