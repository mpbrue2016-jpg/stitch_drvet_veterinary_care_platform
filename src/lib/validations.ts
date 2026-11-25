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
  birth_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato YYYY-MM-DD.')
    .refine((value) => {
      const parsedDate = new Date(`${value}T00:00:00Z`);
      return (
        !Number.isNaN(parsedDate.valueOf()) &&
        parsedDate.toISOString().slice(0, 10) === value
      );
    }, 'Data de nascimento inválida.')
    .nullable()
    .optional(),
  sex: z.enum(['female', 'male', 'unknown']).nullable().optional(),
  notes: z.string().trim().max(2000, 'Observações devem ter até 2000 caracteres.').nullable().optional(),
});

export const updatePetSchema = createPetSchema.partial().extend({
  id: z.string().uuid('Identificador do pet inválido.'),
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

export const avatarPathSchema = z
  .string()
  .trim()
  .min(5, 'Caminho da foto inválido.')
  .max(300, 'Caminho da foto muito longo.')
  .refine(
    (value) =>
      !value.includes('..') &&
      /^[0-9a-fA-F-]{36}\/[a-zA-Z0-9/_.-]+$/.test(value),
    'Caminho de armazenamento da foto inválido.',
  );

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
  avatar_path: avatarPathSchema.nullable().optional(),
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

export const clinicalVitalsSchema = z
  .object({
    weight_kg: z.number().min(0, 'Peso não pode ser negativo.').max(500, 'Peso inválido.').nullable(),
    temperature_c: z.number().min(20, 'Temperatura muito baixa.').max(50, 'Temperatura muito alta.').nullable(),
    heart_rate_bpm: z.number().int().min(10, 'FC inválida.').max(1000, 'FC inválida.').nullable(),
    respiratory_rate_rpm: z.number().int().min(4, 'FR inválida.').max(500, 'FR inválida.').nullable(),
    mucous_membranes: z.string().trim().max(100, 'Limite de 100 caracteres.').nullable(),
    capillary_refill_seconds: z.number().min(0, 'TPC inválido.').max(30, 'TPC inválido.').nullable(),
  })
  .strict();

export const clinicalRecordSchema = z.object({
  appointment_id: z.string().uuid('Atendimento inválido.'),
  subjective: z.string().max(10000, 'Limite de 10.000 caracteres.'),
  objective: z.string().max(10000, 'Limite de 10.000 caracteres.'),
  assessment: z.string().max(10000, 'Limite de 10.000 caracteres.'),
  plan: z.string().max(10000, 'Limite de 10.000 caracteres.'),
  vitals: clinicalVitalsSchema,
  status: z.enum(['draft', 'finalized']).optional(),
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

export const vetProfileSettingsSchema = z.object({
  consultation_fee_cents: z
    .number()
    .int('Informe um valor inteiro em centavos.')
    .min(1000, 'Valor mínimo da consulta é R$ 10,00.')
    .max(500000, 'Valor máximo da consulta é R$ 5.000,00.'),
  bio: z.string().trim().max(600, 'Biografia deve ter até 600 caracteres.').nullable().optional(),
  is_online_now: z.boolean().optional(),
  avatar_path: avatarPathSchema.nullable().optional(),
});

export const payoutAccountSchema = z.object({
  provider: z.string().trim().min(2, 'Informe o provedor de repasse.').max(40),
  payout_account_label: z
    .string()
    .trim()
    .min(3, 'Informe a descrição da conta ou banco.')
    .max(120),
  pix_key: z
    .string()
    .trim()
    .min(5, 'Informe uma chave PIX válida (CPF, CNPJ, e-mail, telefone ou aleatória).')
    .max(120),
});

export const fiscalInvoiceSchema = z.object({
  period_label: z.string().trim().min(2, 'Informe a competência.').max(60),
  total_cents: z.number().int().positive('Informe um valor positivo para a NFSe.'),
  tax_id: z.string().trim().min(11, 'Informe CPF ou CNPJ válido.').max(24),
  provider: z.enum(['drvet_fiscal', 'bling', 'omie']),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const roleApplicationSchema = z.object({
  requested_role: z.enum(['veterinarian', 'partner']),
  organization_name: z
    .string()
    .trim()
    .min(2, 'Informe o nome da clínica, consultório ou empresa.')
    .max(140),
  document_id: z
    .string()
    .trim()
    .min(2, 'Informe o CRMV (veterinário) ou CNPJ (parceiro).')
    .max(32),
  registration_region: z.string().trim().max(2).nullable().optional(),
  specialty: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  state: z.string().trim().max(2).nullable().optional(),
  avatar_path: avatarPathSchema.nullable().optional(),
});

export const issuePrescriptionSchema = z
  .object({
    appointment_id: z.string().uuid('Identificador de atendimento inválido.'),
  })
  .strict();

export const createPartnerListingSchema = z
  .object({
    organization_id: z.string().uuid('Organização inválida.'),
    kind: z.enum(['pet_shop', 'pharmacy']),
    trade_name: z
      .string()
      .trim()
      .min(2, 'Informe o nome fantasia (mínimo 2 caracteres).')
      .max(120, 'Nome fantasia deve ter até 120 caracteres.'),
    city: z
      .string()
      .trim()
      .min(2, 'Informe a cidade.')
      .max(80, 'Cidade deve ter até 80 caracteres.'),
    state: z
      .string()
      .trim()
      .length(2, 'A UF deve ter exatamente 2 letras.')
      .transform((value) => value.toUpperCase())
      .refine((value) => /^[A-Z]{2}$/.test(value), 'UF inválida.'),
    coupon_code: z
      .string()
      .trim()
      .min(3, 'O cupom deve ter pelo menos 3 caracteres.')
      .max(24, 'O cupom deve ter até 24 caracteres.')
      .transform((value) => value.toUpperCase())
      .refine(
        (value) => /^[A-Z0-9_-]+$/.test(value),
        'Use apenas letras, números, hífen ou sublinhado no cupom.',
      ),
    discount_percent: z
      .number()
      .int('Desconto deve ser um número inteiro.')
      .min(0, 'Desconto mínimo é 0%.')
      .max(80, 'Desconto máximo permitido é 80%.'),
  })
  .strict();

export const createAdCampaignSchema = z
  .object({
    organization_id: z.string().uuid('Organização inválida.'),
    title: z
      .string()
      .trim()
      .min(3, 'Informe o título da campanha (mínimo 3 caracteres).')
      .max(140, 'Título da campanha deve ter até 140 caracteres.'),
    placement: z.enum(['home_banner', 'booking_sidebar', 'partner_coupon']),
    budget_cents: z
      .number()
      .int('Orçamento inválido.')
      .min(1000, 'Orçamento mínimo da campanha é R$ 10,00.')
      .max(100_000_000, 'Orçamento excede o limite permitido.'),
    starts_on: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data de início no formato YYYY-MM-DD.'),
  })
  .strict();

export const updateAdCampaignStatusSchema = z
  .object({
    campaignId: z.string().uuid('Campanha inválida.'),
    status: z.enum(['active', 'paused', 'ended']),
  })
  .strict();

export const saveIntegrationConfigSchema = z
  .object({
    organization_id: z.string().uuid('Organização inválida.').nullable().optional(),
    provider: z.enum(['asaas', 'mercado_pago', 'livekit', 'bling', 'omie']),
    environment: z.enum(['sandbox', 'production']),
    webhook_endpoint: z
      .string()
      .trim()
      .url('Informe uma URL válida de webhook.')
      .max(500, 'URL deve ter até 500 caracteres.'),
    active: z.boolean(),
  })
  .strict();

export const adminUpdateUserRoleSchema = z
  .object({
    userId: z.string().uuid('Usuário inválido.'),
    role: z.enum(['tutor', 'veterinarian', 'partner', 'admin']),
  })
  .strict();

export const adminReviewRoleApplicationSchema = z
  .object({
    applicationId: z.string().uuid('Solicitação inválida.'),
    approve: z.boolean(),
    notes: z.string().trim().max(500, 'Observação deve ter até 500 caracteres.').optional(),
  })
  .strict();

export const strictPayoutAccountSchema = z
  .object({
    provider: z.enum(['asaas', 'mercadopago']),
    payout_account_label: z
      .string()
      .trim()
      .min(3, 'Informe a descrição da conta ou banco.')
      .max(120),
    pix_key: z
      .string()
      .trim()
      .min(5, 'Informe uma chave PIX válida (CPF, CNPJ, e-mail, telefone ou aleatória).')
      .max(120),
  })
  .strict();

export const updateFiscalInvoiceStatusSchema = z
  .object({
    invoiceId: z.string().uuid('Nota fiscal inválida.'),
    status: z.enum(['requested', 'issued', 'cancelled']),
  })
  .strict();

export const strictRoleApplicationSchema = roleApplicationSchema
  .extend({
    registration_region: z
      .string()
      .trim()
      .max(2)
      .transform((value) => (value ? value.toUpperCase() : null))
      .nullable()
      .optional(),
    state: z
      .string()
      .trim()
      .max(2)
      .transform((value) => (value ? value.toUpperCase() : null))
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.requested_role === 'veterinarian' &&
      (!data.registration_region || !/^[A-Z]{2}$/.test(data.registration_region))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['registration_region'],
        message: 'Informe a UF de 2 letras do CRMV.',
      });
    }
    if (data.state && !/^[A-Z]{2}$/.test(data.state)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['state'],
        message: 'UF da cidade deve ter 2 letras.',
      });
    }
  });

export const subscribePetPlanSchema = z
  .object({
    planId: z.string().uuid('Plano inválido.'),
    petId: z.string().uuid('Pet inválido.'),
    method: z.enum(['pix', 'credit_card', 'voucher']),
  })
  .strict();

export const updateSubscriptionStatusSchema = z
  .object({
    subscriptionId: z.string().uuid('Assinatura inválida.'),
    status: z.enum(['active', 'paused', 'cancelled']),
  })
  .strict();

export const openTeleconsultationSessionSchema = z
  .object({
    appointmentId: z.string().uuid('Atendimento inválido.'),
  })
  .strict();

export const updateTeleconsultationSessionSchema = z
  .object({
    sessionId: z.string().uuid('Sessão inválida.'),
    status: z.enum(['waiting', 'in_progress', 'ended']).optional(),
    notes: z
      .string()
      .trim()
      .max(2000, 'Anotações devem ter até 2000 caracteres.')
      .nullable()
      .optional(),
  })
  .strict()
  .refine(
    (data) => data.status !== undefined || data.notes !== undefined,
    {
      message: 'Informe status ou anotações para atualizar a sessão.',
    },
  );

export const deleteAvailabilitySchema = z
  .object({
    id: z.string().uuid('Horário inválido.'),
  })
  .strict();

export const sendTeleconsultationMessageSchema = z
  .object({
    sessionId: z.string().uuid('Sessão inválida.'),
    message: z
      .string()
      .trim()
      .min(1, 'Escreva uma mensagem antes de enviar.')
      .max(2000, 'A mensagem deve ter até 2000 caracteres.'),
  })
  .strict();

export const legalAcknowledgementSchema = z
  .object({
    documentKey: z
      .string()
      .trim()
      .min(2, 'Identificador do documento inválido.')
      .max(80, 'Identificador muito longo.')
      .regex(/^[a-zA-Z0-9_.-]+$/, 'Identificador de documento inválido.'),
    documentVersion: z
      .string()
      .trim()
      .min(1, 'Versão do documento obrigatória.')
      .max(32, 'Versão muito longa.'),
  })
  .strict();

export const recordPartnerAttributionSchema = z
  .object({
    couponCode: z
      .string()
      .trim()
      .min(3, 'O cupom deve ter pelo menos 3 caracteres.')
      .max(24, 'O cupom deve ter até 24 caracteres.')
      .transform((value) => value.toUpperCase())
      .refine(
        (value) => /^[A-Z0-9_-]+$/.test(value),
        'Use apenas letras, números, hífen ou sublinhado no cupom.',
      ),
  })
  .strict();

const facialDescriptorVectorSchema = z
  .array(z.number().finite().min(-1).max(1))
  .min(32, 'Descritor biométrico incompleto.')
  .max(256, 'Descritor biométrico excede o tamanho suportado.');

export const enrollFacialBiometricsSchema = z
  .object({
    template_hash: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{64}$/i, 'Hash do template facial inválido.')
      .transform((value) => value.toLowerCase()),
    descriptor_vector: facialDescriptorVectorSchema,
    liveness_score: z
      .number()
      .finite()
      .min(0.55, 'Prova de vida insuficiente para cadastrar biometria facial.')
      .max(1),
    device_label: z.string().trim().max(160).nullable().optional(),
  })
  .strict();

export const verifyFacialBiometricsSchema = z
  .object({
    descriptor_vector: facialDescriptorVectorSchema,
    liveness_score: z.number().finite().min(0).max(1),
    device_label: z.string().trim().max(160).nullable().optional(),
  })
  .strict();



