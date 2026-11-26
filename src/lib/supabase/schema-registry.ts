export interface MigrationSchemaEntry {
  order: number;
  filename: string;
  title: string;
  stitchScope: string;
  tables: string[];
  buckets?: string[];
}

export const DRVET_MIGRATIONS_REGISTRY: MigrationSchemaEntry[] = [
  {
    order: 1,
    filename: '20261112210000_initial_drvet_backend.sql',
    title: 'Identidade, Clínicas, Pets, Agenda & Agendamentos',
    stitchScope: 'Home / Cadastro QR / Meus Pets / Agenda / Agendamentos',
    tables: [
      'profiles',
      'organizations',
      'organization_memberships',
      'veterinarian_profiles',
      'pets',
      'professional_availability',
      'appointments',
    ],
  },
  {
    order: 2,
    filename: '20261112213000_clinical_records.sql',
    title: 'Prontuário Clínico SOAP & Sinais Vitais',
    stitchScope: 'Prontuários SOAP (/prontuarios)',
    tables: ['clinical_records'],
  },
  {
    order: 3,
    filename: '20261112214000_vaccination_records.sql',
    title: 'Carteira Digital de Vacinação',
    stitchScope: 'Carteira de Vacinas (/carteira/vacinas)',
    tables: ['vaccination_records'],
  },
  {
    order: 4,
    filename: '20261112215000_exam_orders.sql',
    title: 'Pedidos e Resultados de Exames',
    stitchScope: 'Exames Laboratoriais e Imagem (/exames)',
    tables: ['exam_orders'],
  },
  {
    order: 5,
    filename: '20261112216000_availability_blocks.sql',
    title: 'Bloqueio e Liberação de Horários Futuros',
    stitchScope: 'Grade Semanal & Bloqueios (/agenda)',
    tables: ['professional_availability'],
  },
  {
    order: 6,
    filename: '20261112217000_prescription_drafts.sql',
    title: 'Rascunhos Estruturados de Receita',
    stitchScope: 'Receita Digital ICP-Brasil (/receitas)',
    tables: ['prescription_drafts'],
  },
  {
    order: 7,
    filename: '20261113000100_profiles_roles_and_updated_at.sql',
    title: 'Papéis RBAC, Auditoria updated_at e Políticas Admin',
    stitchScope: 'RBAC Global (Tutor / Veterinário / Parceiro / Admin)',
    tables: ['profiles', 'organizations', 'organization_memberships'],
  },
  {
    order: 8,
    filename: '20261113000200_commissions_and_payouts.sql',
    title: 'Extrato de Comissões D+1, Repasses e Antecipação',
    stitchScope: 'Faturamento & Repasses (/comissoes)',
    tables: ['payout_accounts', 'commission_ledger', 'anticipation_requests'],
  },
  {
    order: 9,
    filename: '20261113000300_storage_buckets_and_policies.sql',
    title: 'Buckets Privados de Storage e Políticas RLS',
    stitchScope: 'Avatares, Laudos de Exames e Anexos Clínicos',
    tables: ['exam_orders', 'clinical_records', 'pets'],
    buckets: ['exam-reports', 'clinical-attachments', 'pet-avatars'],
  },
  {
    order: 10,
    filename: '20261113000400_teleconsulta_subscriptions_partners.sql',
    title: 'Teleconsulta Realtime, Clube DrVet, Parceiros B2B & Ads',
    stitchScope: 'Sala de Vídeo/Chat, Assinaturas, Parceiros & DrVet Ads',
    tables: [
      'teleconsultation_sessions',
      'teleconsultation_messages',
      'subscription_plans',
      'pet_subscriptions',
      'payment_orders',
      'partner_listings',
      'ad_campaigns',
    ],
  },
  {
    order: 11,
    filename: '20261113000500_admin_integrations_and_checkout.sql',
    title: 'Master Admin, Webhooks/Integrações e Checkout de Consulta',
    stitchScope: 'Master Admin, Integrações CDC & Checkout (/pagamentos)',
    tables: ['integration_configs', 'payment_orders', 'profiles'],
  },
  {
    order: 12,
    filename: '20261113000600_push_notifications.sql',
    title: 'Notificações Push VAPID, Lembretes de Consulta & Fila Veterinária',
    stitchScope: 'Alertas Push & Realtime (/notificacoes, /agendamento, /painel/veterinario)',
    tables: ['push_subscriptions', 'notifications'],
  },
  {
    order: 13,
    filename: '20261123000100_production_repairs_and_features.sql',
    title: 'Catálogo Público, QR Receitas, NFSe, Termos Persistidos, Credenciamento & Liquidação PIX',
    stitchScope: 'Home (/), Receitas (/receitas/verificar), Comissões NFSe, Onboarding QR, Perfil & Admin',
    tables: [
      'veterinarian_profiles',
      'legal_acknowledgements',
      'fiscal_invoices',
      'partner_attributions',
      'role_applications',
      'prescription_drafts',
      'payment_orders',
    ],
  },
  {
    order: 14,
    filename: '20261124000100_security_indexes_and_audit_logs.sql',
    title: 'Índices de Paginação/Filtros, Grants Idempotentes & Trilha de Auditoria',
    stitchScope: 'Hardening de APIs, Paginação & Logs Estruturados',
    tables: ['pets', 'audit_logs'],
  },
  {
    order: 15,
    filename: '20261124000200_mvp_architecture_readiness.sql',
    title: 'Idempotência de Webhooks, Consentimento Bilateral Teleconsulta & Outbox',
    stitchScope: 'Arquitetura MVP (Pagamentos/Webhooks, Teleconsulta LGPD/CFMV & Notificações)',
    tables: ['webhook_events', 'teleconsultation_consents', 'notification_outbox'],
  },
  {
    order: 16,
    filename: '20261125000100_vet_photo_and_facial_biometrics.sql',
    title: 'Foto Profissional do Veterinário & Biometria Facial no Login',
    stitchScope: 'Credenciamento CRMV com Foto (vet-avatars) & Biometria Facial (/login, /perfil, /painel/veterinario)',
    tables: ['facial_biometrics', 'facial_biometric_verifications'],
    buckets: ['vet-avatars'],
  },
  {
    order: 17,
    filename: '20261126000100_individual_vet_agenda_and_comms.sql',
    title: 'Agenda Individual do Veterinário & Comunicados Individuais',
    stitchScope: 'Agenda Semanal Individual (/agenda), Fila Clínica (/painel/veterinario) & Comunicados (/notificacoes)',
    tables: ['notifications', 'professional_availability', 'appointments'],
  },
];

export const DRVET_ALL_TABLES: string[] = Array.from(
  new Set(DRVET_MIGRATIONS_REGISTRY.flatMap((item) => item.tables)),
);
