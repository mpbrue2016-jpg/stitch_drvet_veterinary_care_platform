-- Seed idempotente de desenvolvimento e homologação para o DrVet.
-- Senha padrão das contas de teste: DrVet@2026
-- Contas criadas:
--   - admin@drvet.local         (role: admin)
--   - camila.vet@drvet.local    (role: veterinarian - aprovada na clínica)
--   - rafael.vet@drvet.local    (role: veterinarian - pendente de aprovação)
--   - mariana.tutor@drvet.local (role: tutor)

create extension if not exists pgcrypto with schema extensions;

do $$
declare
  admin_id uuid := '10000000-0000-4000-8000-000000000001';
  camila_id uuid := '10000000-0000-4000-8000-000000000002';
  rafael_id uuid := '10000000-0000-4000-8000-000000000003';
  mariana_id uuid := '10000000-0000-4000-8000-000000000004';

  org_id uuid := '20000000-0000-4000-8000-000000000001';

  pet_pipoca_id uuid := '30000000-0000-4000-8000-000000000001';
  pet_thor_id uuid := '30000000-0000-4000-8000-000000000002';
  pet_luna_id uuid := '30000000-0000-4000-8000-000000000003';

  slot_past_1 uuid := '40000000-0000-4000-8000-000000000001';
  slot_past_2 uuid := '40000000-0000-4000-8000-000000000002';
  slot_future_1 uuid := '40000000-0000-4000-8000-000000000003';
  slot_future_2 uuid := '40000000-0000-4000-8000-000000000004';
  slot_open_1 uuid := '40000000-0000-4000-8000-000000000005';
  slot_open_2 uuid := '40000000-0000-4000-8000-000000000006';
  slot_open_3 uuid := '40000000-0000-4000-8000-000000000007';
  slot_blocked_1 uuid := '40000000-0000-4000-8000-000000000008';

  apt_pipoca_completed uuid := '50000000-0000-4000-8000-000000000001';
  apt_luna_confirmed uuid := '50000000-0000-4000-8000-000000000002';
  apt_thor_pending uuid := '50000000-0000-4000-8000-000000000003';
  apt_pipoca_upcoming uuid := '50000000-0000-4000-8000-000000000004';

  exam_luna_id uuid := '60000000-0000-4000-8000-000000000001';
  exam_pipoca_id uuid := '60000000-0000-4000-8000-000000000002';
  pw_hash text := extensions.crypt('DrVet@2026', extensions.gen_salt('bf'));
begin
  -- 1. Usuários no auth.users (dispara trigger on_auth_user_created -> public.profiles)
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  values
    (
      '00000000-0000-0000-0000-000000000000',
      admin_id,
      'authenticated',
      'authenticated',
      'admin@drvet.local',
      pw_hash,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Admin DrVet"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      camila_id,
      'authenticated',
      'authenticated',
      'camila.vet@drvet.local',
      pw_hash,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Dra. Camila Nogueira"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      rafael_id,
      'authenticated',
      'authenticated',
      'rafael.vet@drvet.local',
      pw_hash,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Dr. Rafael Tavares"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      mariana_id,
      'authenticated',
      'authenticated',
      'mariana.tutor@drvet.local',
      pw_hash,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Mariana Costa"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    )
  on conflict (id) do nothing;

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values
    (admin_id, admin_id, jsonb_build_object('sub', admin_id::text, 'email', 'admin@drvet.local'), 'email', admin_id::text, now(), now(), now()),
    (camila_id, camila_id, jsonb_build_object('sub', camila_id::text, 'email', 'camila.vet@drvet.local'), 'email', camila_id::text, now(), now(), now()),
    (rafael_id, rafael_id, jsonb_build_object('sub', rafael_id::text, 'email', 'rafael.vet@drvet.local'), 'email', rafael_id::text, now(), now(), now()),
    (mariana_id, mariana_id, jsonb_build_object('sub', mariana_id::text, 'email', 'mariana.tutor@drvet.local'), 'email', mariana_id::text, now(), now(), now())
  on conflict do nothing;

  update public.profiles set role = 'admin', display_name = 'Admin DrVet' where id = admin_id;
  update public.profiles set role = 'veterinarian', display_name = 'Dra. Camila Nogueira' where id = camila_id;
  update public.profiles set role = 'veterinarian', display_name = 'Dr. Rafael Tavares' where id = rafael_id;
  update public.profiles set role = 'tutor', display_name = 'Mariana Costa' where id = mariana_id;

  -- 2. Organização e equipe veterinária
  insert into public.organizations (id, name, created_by)
  values (org_id, 'Clínica Pet Care Vila Mariana', admin_id)
  on conflict (id) do nothing;

  insert into public.organization_memberships (organization_id, user_id, role)
  values
    (org_id, admin_id, 'owner'),
    (org_id, camila_id, 'veterinarian'),
    (org_id, rafael_id, 'veterinarian')
  on conflict (organization_id, user_id) do nothing;

  insert into public.veterinarian_profiles (
    user_id,
    organization_id,
    registration_number,
    registration_region,
    specialty,
    status
  )
  values
    (camila_id, org_id, '28491', 'SP', 'Clínica Geral e Dermatologia', 'approved'),
    (rafael_id, org_id, '31904', 'SP', 'Cardiologia Veterinária', 'pending')
  on conflict (organization_id, user_id) do nothing;

  -- 3. Pets de exemplo
  insert into public.pets (id, owner_id, name, species, breed, birth_date, sex, notes)
  values
    (pet_pipoca_id, mariana_id, 'Pipoca', 'Cachorro', 'SRD (Porte médio)', '2021-05-14', 'female', 'Alergia alimentar leve em acompanhamento dermatológico.'),
    (pet_thor_id, mariana_id, 'Thor', 'Cachorro', 'Bulldog Francês', '2020-09-02', 'male', 'Sensibilidade respiratória em dias muito quentes.'),
    (pet_luna_id, mariana_id, 'Luna', 'Gato', 'Siamês', '2018-02-20', 'female', 'Acompanhamento renal preventivo.')
  on conflict (id) do nothing;

  -- 4. Disponibilidade profissional (passada para histórico + futura para agendamentos)
  insert into public.professional_availability (
    id, organization_id, veterinarian_id, starts_at, ends_at, is_available, is_blocked, blocked_at, block_reason
  )
  values
    (slot_past_1, org_id, camila_id, date_trunc('hour', now() - interval '2 days') + interval '10 hours', date_trunc('hour', now() - interval '2 days') + interval '10 hours 45 minutes', false, false, null, null),
    (slot_past_2, org_id, camila_id, date_trunc('hour', now() - interval '1 day') + interval '14 hours', date_trunc('hour', now() - interval '1 day') + interval '14 hours 45 minutes', false, false, null, null),
    (slot_future_1, org_id, camila_id, date_trunc('day', now() + interval '1 day') + interval '16 hours', date_trunc('day', now() + interval '1 day') + interval '16 hours 45 minutes', false, false, null, null),
    (slot_future_2, org_id, camila_id, date_trunc('day', now() + interval '2 days') + interval '11 hours', date_trunc('day', now() + interval '2 days') + interval '11 hours 45 minutes', false, false, null, null),
    (slot_open_1, org_id, camila_id, date_trunc('day', now() + interval '1 day') + interval '9 hours', date_trunc('day', now() + interval '1 day') + interval '9 hours 45 minutes', true, false, null, null),
    (slot_open_2, org_id, camila_id, date_trunc('day', now() + interval '1 day') + interval '10 hours', date_trunc('day', now() + interval '1 day') + interval '10 hours 45 minutes', true, false, null, null),
    (slot_open_3, org_id, camila_id, date_trunc('day', now() + interval '3 days') + interval '14 hours', date_trunc('day', now() + interval '3 days') + interval '14 hours 45 minutes', true, false, null, null),
    (slot_blocked_1, org_id, camila_id, date_trunc('day', now() + interval '2 days') + interval '16 hours', date_trunc('day', now() + interval '2 days') + interval '16 hours 45 minutes', false, true, now(), 'Reunião clínica interna')
  on conflict (id) do nothing;

  -- 5. Agendamentos de exemplo (desabilita temporariamente validação de janela futura para inserir atendimentos históricos)
  alter table public.appointments disable trigger appointments_validate_insert;

  insert into public.appointments (
    id, availability_id, organization_id, pet_id, tutor_id, veterinarian_id, kind, status, reason, starts_at, ends_at
  )
  values
    (
      apt_pipoca_completed, slot_past_1, org_id, pet_pipoca_id, mariana_id, camila_id,
      'teleconsultation', 'completed',
      'Retorno dermatológico e revisão da dieta hipoalergênica.',
      date_trunc('day', now() - interval '2 days') + interval '10 hours',
      date_trunc('day', now() - interval '2 days') + interval '10 hours 45 minutes'
    ),
    (
      apt_luna_confirmed, slot_past_2, org_id, pet_luna_id, mariana_id, camila_id,
      'teleconsultation', 'confirmed',
      'Avaliação de exames renais e ajuste de quelante.',
      date_trunc('day', now() - interval '1 day') + interval '14 hours',
      date_trunc('day', now() - interval '1 day') + interval '14 hours 45 minutes'
    ),
    (
      apt_thor_pending, slot_future_1, org_id, pet_thor_id, mariana_id, camila_id,
      'in_person', 'pending',
      'Triagem respiratória e check-up anual.',
      date_trunc('day', now() + interval '1 day') + interval '16 hours',
      date_trunc('day', now() + interval '1 day') + interval '16 hours 45 minutes'
    ),
    (
      apt_pipoca_upcoming, slot_future_2, org_id, pet_pipoca_id, mariana_id, camila_id,
      'teleconsultation', 'confirmed',
      'Acompanhamento de manutenção dermatológica.',
      date_trunc('day', now() + interval '2 days') + interval '11 hours',
      date_trunc('day', now() + interval '2 days') + interval '11 hours 45 minutes'
    )
  on conflict (id) do nothing;

  alter table public.appointments enable trigger appointments_validate_insert;

  -- 6. Prontuários clínicos SOAP
  insert into public.clinical_records (
    appointment_id, organization_id, pet_id, veterinarian_id,
    subjective, objective, assessment, plan, vitals, status, finalized_at
  )
  values
    (
      apt_pipoca_completed, org_id, pet_pipoca_id, camila_id,
      'Tutora relata melhora significativa do prurido após troca para ração hidrolisada há 21 dias. Sem episódios de vômito.',
      'Mucosas normocoradas, hidratação preservada, pelagem sem novas lesões crostosas em região abdominal.',
      'Boa resposta clínica ao manejo nutricional para dermatite trofoalérgica.',
      'Manter dieta exclusiva por mais 30 dias e retornar por teleconsulta para reavaliação.',
      '{"weight_kg":11.4,"temperature_c":38.5,"heart_rate_bpm":96,"respiratory_rate_rpm":24,"mucous_membranes":"Normocoradas","capillary_refill_seconds":1.5}'::jsonb,
      'finalized',
      now() - interval '2 days'
    ),
    (
      apt_luna_confirmed, org_id, pet_luna_id, camila_id,
      'Tutor refere ingestão hídrica estável e apetite seletivo nos últimos 3 dias.',
      'Paciente alerta em vídeo, escore corporal 4/9, sem sinais de desconforto respiratório.',
      'Doença renal crônica estágio II em acompanhamento contínuo; aguarda novo perfil bioquímico.',
      'Solicitar ureia, creatinina e fósforo sérico antes de ajustar quelante.',
      '{"weight_kg":3.9,"temperature_c":38.3,"heart_rate_bpm":152,"respiratory_rate_rpm":28,"mucous_membranes":"Róseas","capillary_refill_seconds":1.5}'::jsonb,
      'draft',
      null
    )
  on conflict (appointment_id) do nothing;

  -- 7. Carteira de vacinação
  insert into public.vaccination_records (
    id, appointment_id, organization_id, pet_id, veterinarian_id,
    vaccine_name, administered_on, batch_number, manufacturer, next_due_on, notes
  )
  values
    (
      '70000000-0000-4000-8000-000000000001',
      apt_pipoca_completed, org_id, pet_pipoca_id, camila_id,
      'V10 (Óctupla / Déctupla Canina)',
      (current_date - interval '90 days')::date,
      'LT-2026-8841',
      'Zoetis',
      (current_date + interval '275 days')::date,
      'Aplicação subcutânea sem intercorrências pós-vacinais.'
    ),
    (
      '70000000-0000-4000-8000-000000000002',
      apt_pipoca_completed, org_id, pet_thor_id, camila_id,
      'Antirrábica',
      (current_date - interval '45 days')::date,
      'RB-99402',
      'Boehringer Ingelheim',
      (current_date + interval '320 days')::date,
      'Reforço anual registrado em consulta presencial.'
    )
  on conflict (id) do nothing;

  -- 8. Pedidos e resultados de exames
  insert into public.exam_orders (
    id, appointment_id, organization_id, pet_id, veterinarian_id,
    modality, exam_name, clinical_indication, instructions, status,
    result_summary, laboratory_name, performed_at, requested_at, resulted_at
  )
  values
    (
      exam_luna_id, apt_luna_confirmed, org_id, pet_luna_id, camila_id,
      'laboratory',
      'Perfil Renal + Fósforo Sérico + SDMA',
      'Monitoramento trimestral de função renal e fósforo para ajuste de quelante.',
      'Jejum alimentar de 8 horas; água à vontade.',
      'requested',
      null, null, null, now() - interval '1 day', null
    ),
    (
      exam_pipoca_id, apt_pipoca_completed, org_id, pet_pipoca_id, camila_id,
      'imaging',
      'Ultrassonografia Abdominal Total',
      'Descartar alterações gastrointestinais associadas.',
      'Evitar micção 1 hora antes do exame.',
      'resulted',
      'Fígado, baço e alças intestinais com ecogenicidade preservada. Sem líquido livre.',
      'Centro Diagnóstico Vet Imagem SP',
      now() - interval '3 days',
      now() - interval '5 days',
      now() - interval '2 days'
    )
  on conflict (id) do nothing;

  -- 9. Rascunho de receita
  insert into public.prescription_drafts (
    appointment_id, organization_id, pet_id, veterinarian_id, items, updated_by
  )
  values (
    apt_luna_confirmed, org_id, pet_luna_id, camila_id,
    '[{"name":"Hidróxido de Alumínio (Quelante de Fósforo)","presentation":"Suspensão oral manipulada","dose":"30 mg/kg/dia divididos nas refeições","route":"Oral","frequency":"A cada 12 horas","duration":"30 dias (rascunho sujeito à revisão após exame)","quantity":"1 frasco de 60 mL","instructions":"Misturar imediatamente antes da oferta do alimento úmido."}]'::jsonb,
    camila_id
  )
  on conflict (appointment_id) do nothing;

  -- 10. Conta de repasse e extrato de comissões
  insert into public.payout_accounts (
    organization_id, veterinarian_id, provider, provider_connected, payout_account_label, pix_key_masked
  )
  values (
    org_id, camila_id, 'asaas', true,
    'Banco Inter · Ag 0001 · CC 88412-9',
    '***.482.910-**'
  )
  on conflict (organization_id, veterinarian_id) do nothing;

  insert into public.commission_ledger (
    organization_id, veterinarian_id, appointment_id, reference, tutor_name, pet_name,
    origin, gross_amount_cents, net_amount_cents, status, occurred_at
  )
  values
    (org_id, camila_id, apt_pipoca_completed, 'TELE-2026-1042', 'Mariana Costa', 'Pipoca', 'teleconsultation', 18000, 15300, 'available', now() - interval '2 days'),
    (org_id, camila_id, apt_luna_confirmed, 'TELE-2026-1049', 'Mariana Costa', 'Luna', 'teleconsultation', 21000, 17850, 'pending', now() - interval '1 day'),
    (org_id, camila_id, null, 'FARM-2026-0318', 'Ana Beatriz', 'Thor', 'pharmacy_split', 24500, 3675, 'paid', now() - interval '4 days')
  on conflict (reference) do nothing;

  -- 11. Sala de teleconsulta e histórico inicial de mensagens
  insert into public.teleconsultation_sessions (
    id, appointment_id, organization_id, pet_id, tutor_id, veterinarian_id,
    room_code, status, recording_consent, started_at, ended_at, notes
  )
  values (
    '80000000-0000-4000-8000-000000000001',
    apt_luna_confirmed,
    org_id,
    pet_luna_id,
    mariana_id,
    camila_id,
    'DRVET-LUNA2026',
    'waiting',
    true,
    null,
    null,
    'Retorno renal trimestral da Luna por teleconsulta.'
  )
  on conflict (appointment_id) do nothing;

  insert into public.teleconsultation_messages (
    id, session_id, sender_id, sender_name, message
  )
  values
    (
      '81000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000001',
      camila_id,
      'Dra. Camila Nogueira',
      'Olá Mariana! Sala aberta para o retorno da Luna. Se tiver exames recentes, pode enviar em /exames.'
    ),
    (
      '81000000-0000-4000-8000-000000000002',
      '80000000-0000-4000-8000-000000000001',
      mariana_id,
      'Mariana Costa',
      'Combinado, doutora! Já estamos prontos para iniciar no horário agendado.'
    )
  on conflict (id) do nothing;

  -- 12. Clube DrVet (planos preventivos, assinatura ativa e comprovante de pagamento)
  insert into public.subscription_plans (
    id, slug, name, description, price_cents, interval, discount_percent, benefits, active
  )
  values
    (
      '90000000-0000-4000-8000-000000000001',
      'clube-essencial-mensal',
      'Clube DrVet Essencial',
      'Acompanhamento preventivo contínuo com 15% OFF em teleconsultas e farmácias parceiras.',
      4990,
      'monthly',
      15,
      '["15% OFF em teleconsultas","Carteira digital de vacinas e alertas","Cupons exclusivos em farmácias parceiras"]'::jsonb,
      true
    ),
    (
      '90000000-0000-4000-8000-000000000002',
      'clube-plus-mensal',
      'Clube DrVet Plus',
      'Cobertura preventiva ampliada com prioridade na agenda e 25% OFF em exames e telemedicina.',
      8990,
      'monthly',
      25,
      '["25% OFF em teleconsultas e retornos","Prioridade em horários de urgência leve","Desconto ampliado em exames e manipulação"]'::jsonb,
      true
    )
  on conflict (slug) do nothing;

  insert into public.pet_subscriptions (
    id, plan_id, pet_id, owner_id, status, discount_percent, started_at, next_billing_at
  )
  values (
    '91000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000001',
    pet_pipoca_id,
    mariana_id,
    'active',
    15,
    now() - interval '15 days',
    now() + interval '15 days'
  )
  on conflict (id) do nothing;

  insert into public.payment_orders (
    id, user_id, organization_id, subscription_id, kind, description,
    amount_cents, discount_cents, net_amount_cents, method, status, external_reference, paid_at
  )
  values (
    '92000000-0000-4000-8000-000000000001',
    mariana_id,
    org_id,
    '91000000-0000-4000-8000-000000000001',
    'subscription',
    'Clube DrVet Essencial — Pipoca',
    4990,
    0,
    4990,
    'pix',
    'paid',
    'SUB-PIPOCA01',
    now() - interval '15 days'
  )
  on conflict (id) do nothing;

  -- 13. Portal B2B de Parceiros e Campanhas DrVet Ads
  insert into public.partner_listings (
    id, organization_id, kind, trade_name, city, state, coupon_code, discount_percent, active
  )
  values
    (
      'a0000000-0000-4000-8000-000000000001',
      org_id,
      'pharmacy',
      'Farmácia Parceira Pet Care Vila Mariana',
      'São Paulo',
      'SP',
      'DRVET15',
      15,
      true
    ),
    (
      'a0000000-0000-4000-8000-000000000002',
      org_id,
      'pet_shop',
      'Pet Care Vila Mariana — Pro Shop',
      'São Paulo',
      'SP',
      'PROSHOP10',
      10,
      true
    )
  on conflict (id) do nothing;

  insert into public.ad_campaigns (
    id, organization_id, title, placement, budget_cents, status, starts_on, clicks_count
  )
  values (
    'a1000000-0000-4000-8000-000000000001',
    org_id,
    'Campanha Preventiva de Inverno — Check-up + Vacinas',
    'booking_sidebar',
    150000,
    'active',
    current_date - 7,
    142
  )
  on conflict (id) do nothing;

  -- 14. Configurações de integrações e comprovante de consulta
  insert into public.integration_configs (
    id, organization_id, provider, environment, webhook_endpoint, active, last_status, last_checked_at
  )
  values
    (
      'b0000000-0000-4000-8000-000000000001',
      org_id,
      'asaas',
      'sandbox',
      'https://drvet.app/functions/v1/payment-webhook',
      true,
      '200 OK',
      now() - interval '2 hours'
    ),
    (
      'b0000000-0000-4000-8000-000000000002',
      org_id,
      'livekit',
      'sandbox',
      'https://drvet.app/teleconsulta',
      true,
      '200 OK',
      now() - interval '1 hour'
    ),
    (
      'b0000000-0000-4000-8000-000000000003',
      org_id,
      'bling',
      'sandbox',
      'https://drvet.app/api/erp-sync',
      false,
      'pending_test',
      null
    )
  on conflict (id) do nothing;

  insert into public.payment_orders (
    id, user_id, organization_id, appointment_id, kind, description,
    amount_cents, discount_cents, net_amount_cents, method, status, external_reference, paid_at
  )
  values (
    '92000000-0000-4000-8000-000000000002',
    mariana_id,
    org_id,
    apt_pipoca_completed,
    'teleconsultation',
    'Atendimento Veterinário — Pipoca',
    18000,
    2700,
    15300,
    'pix',
    'paid',
    'PAY-TELE1042',
    now() - interval '2 days'
  )
  on conflict (id) do nothing;
end
$$;
