-- Migration 13: Correções estruturais, catálogo público seguro, receitas emitidas com QR,
-- notas fiscais, termos persistidos, atribuição QR parceiro, solicitações de perfil e liquidação financeira.

-- ============================================================================
-- 1. CATÁLOGO PÚBLICO DE VETERINÁRIOS (SEM EXPOSIÇÃO DE PII)
-- ============================================================================

alter table public.veterinarian_profiles
  add column if not exists consultation_fee_cents integer not null default 18000,
  add column if not exists bio text,
  add column if not exists is_online_now boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'veterinarian_fee_range_check'
  ) then
    alter table public.veterinarian_profiles
      add constraint veterinarian_fee_range_check
      check (consultation_fee_cents between 1000 and 500000);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'veterinarian_bio_len_check'
  ) then
    alter table public.veterinarian_profiles
      add constraint veterinarian_bio_len_check
      check (bio is null or char_length(bio) <= 600);
  end if;
end
$$;

-- Permite leitura pública apenas dos catálogos comerciais sem PII (planos e parceiros ativos).
drop policy if exists "Anon can view active subscription plans" on public.subscription_plans;
create policy "Anon can view active subscription plans"
  on public.subscription_plans for select to anon
  using (active = true);

drop policy if exists "Anon can view active partner listings" on public.partner_listings;
create policy "Anon can view active partner listings"
  on public.partner_listings for select to anon
  using (active = true);

-- Função pública segura que retorna somente dados profissionais públicos (sem email ou telefone).
create or replace function public.get_public_veterinarians()
returns table (
  user_id uuid,
  organization_id uuid,
  organization_name text,
  display_name text,
  registration_number text,
  registration_region text,
  specialty text,
  consultation_fee_cents integer,
  bio text,
  is_online_now boolean,
  open_slots_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    vp.user_id,
    vp.organization_id,
    o.name as organization_name,
    coalesce(nullif(btrim(p.display_name), ''), 'Médico-Veterinário') as display_name,
    vp.registration_number,
    vp.registration_region,
    vp.specialty,
    vp.consultation_fee_cents,
    vp.bio,
    vp.is_online_now,
    (
      select count(*)
      from public.professional_availability pa
      where pa.veterinarian_id = vp.user_id
        and pa.organization_id = vp.organization_id
        and pa.is_available = true
        and pa.is_blocked = false
        and pa.starts_at > now()
    ) as open_slots_count
  from public.veterinarian_profiles vp
  join public.profiles p on p.id = vp.user_id
  join public.organizations o on o.id = vp.organization_id
  where vp.status = 'approved'
  order by vp.is_online_now desc, open_slots_count desc, p.display_name asc;
$$;

revoke all on function public.get_public_veterinarians() from public;
grant execute on function public.get_public_veterinarians() to anon, authenticated;

-- RPC segura para o próprio veterinário atualizar honorário, bio e status online sem escalar status/papel.
create or replace function public.update_my_vet_profile(
  target_consultation_fee_cents integer,
  target_bio text default null,
  target_is_online_now boolean default null
)
returns public.veterinarian_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  updated_row public.veterinarian_profiles;
begin
  if actor_id is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;

  if target_consultation_fee_cents is null
     or target_consultation_fee_cents < 1000
     or target_consultation_fee_cents > 500000 then
    raise exception 'Valor de consulta deve estar entre R$ 10,00 e R$ 5.000,00.'
      using errcode = '22023';
  end if;

  if target_bio is not null and char_length(target_bio) > 600 then
    raise exception 'Biografia deve ter no máximo 600 caracteres.'
      using errcode = '22023';
  end if;

  update public.veterinarian_profiles
  set consultation_fee_cents = target_consultation_fee_cents,
      bio = nullif(btrim(target_bio), ''),
      is_online_now = coalesce(target_is_online_now, is_online_now),
      updated_at = now()
  where user_id = actor_id
    and status = 'approved'
  returning * into updated_row;

  if not found then
    raise exception 'Perfil veterinário aprovado não encontrado para sua conta.'
      using errcode = 'P0002';
  end if;

  return updated_row;
end;
$$;

revoke all on function public.update_my_vet_profile(integer, text, boolean) from public, anon;
grant execute on function public.update_my_vet_profile(integer, text, boolean) to authenticated;

-- ============================================================================
-- 2. CORREÇÃO DA POLICY DE STORAGE (PET-AVATARS PARA VETERINÁRIOS DESIGNADOS)
-- ============================================================================

drop policy if exists "Authorized users can read DrVet storage objects" on storage.objects;
create policy "Authorized users can read DrVet storage objects"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('pet-avatars', 'exam-reports', 'clinical-attachments')
    and (
      public.is_admin()
      or (
        bucket_id = 'pet-avatars'
        and (
          (storage.foldername(name))[1] = (select auth.uid()::text)
          or exists (
            select 1
            from public.pets p
            where p.id::text = (storage.foldername(name))[2]
              and (
                p.owner_id = (select auth.uid())
                or public.can_access_pet_as_professional(p.id)
              )
          )
        )
      )
      or (
        bucket_id in ('exam-reports', 'clinical-attachments')
        and exists (
          select 1
          from public.pets p
          where p.id::text = (storage.foldername(name))[1]
            and (
              p.owner_id = (select auth.uid())
              or public.can_access_pet_as_professional(p.id)
            )
        )
      )
    )
  );

-- ============================================================================
-- 3. CIÊNCIA DE DOCUMENTOS E TERMOS LEGAIS PERSISTIDA NO BANCO
-- ============================================================================

create table if not exists public.legal_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_key text not null,
  document_version text not null,
  acknowledged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legal_ack_key_len check (char_length(btrim(document_key)) between 2 and 80),
  constraint legal_ack_ver_len check (char_length(btrim(document_version)) between 1 and 40),
  unique (user_id, document_key, document_version)
);

drop trigger if exists set_legal_acknowledgements_updated_at on public.legal_acknowledgements;
create trigger set_legal_acknowledgements_updated_at
  before update on public.legal_acknowledgements
  for each row execute function public.set_updated_at();

alter table public.legal_acknowledgements enable row level security;

revoke all on table public.legal_acknowledgements from anon, authenticated;
grant select, insert on table public.legal_acknowledgements to authenticated;

drop policy if exists "Users read own legal acknowledgements" on public.legal_acknowledgements;
create policy "Users read own legal acknowledgements"
  on public.legal_acknowledgements for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "Users insert own legal acknowledgements" on public.legal_acknowledgements;
create policy "Users insert own legal acknowledgements"
  on public.legal_acknowledgements for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ============================================================================
-- 4. NOTAS FISCAIS DE SERVIÇO (NFSe / CONCILIAÇÃO NO /comissoes)
-- ============================================================================

create table if not exists public.fiscal_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  veterinarian_id uuid not null references public.profiles(id) on delete cascade,
  invoice_number text not null unique,
  period_label text not null,
  total_cents integer not null,
  tax_id text not null,
  verification_code text not null unique,
  status text not null default 'requested' check (status in ('requested', 'issued', 'cancelled')),
  provider text not null default 'drvet_fiscal' check (provider in ('drvet_fiscal', 'bling', 'omie')),
  notes text,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_invoice_period_len check (char_length(btrim(period_label)) between 2 and 60),
  constraint fiscal_invoice_total_positive check (total_cents > 0),
  constraint fiscal_invoice_tax_id_len check (char_length(btrim(tax_id)) between 11 and 24),
  constraint fiscal_invoice_notes_len check (notes is null or char_length(notes) <= 500)
);

create index if not exists idx_fiscal_invoices_vet_created
  on public.fiscal_invoices(veterinarian_id, created_at desc);

drop trigger if exists set_fiscal_invoices_updated_at on public.fiscal_invoices;
create trigger set_fiscal_invoices_updated_at
  before update on public.fiscal_invoices
  for each row execute function public.set_updated_at();

alter table public.fiscal_invoices enable row level security;

revoke all on table public.fiscal_invoices from anon, authenticated;
grant select on table public.fiscal_invoices to authenticated;

drop policy if exists "Authorized users view fiscal invoices" on public.fiscal_invoices;
create policy "Authorized users view fiscal invoices"
  on public.fiscal_invoices for select to authenticated
  using (
    veterinarian_id = (select auth.uid())
    or public.has_organization_role(
      organization_id,
      array['owner', 'admin', 'billing']::public.organization_role[]
    )
    or public.is_admin()
  );

create or replace function public.request_fiscal_invoice(
  target_period_label text,
  target_total_cents integer,
  target_tax_id text,
  target_provider text default 'drvet_fiscal',
  target_notes text default null
)
returns public.fiscal_invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_org_id uuid;
  clean_tax_id text := regexp_replace(coalesce(target_tax_id, ''), '[^0-9A-Za-z./-]', '', 'g');
  gen_number text;
  gen_code text;
  created_invoice public.fiscal_invoices;
begin
  if actor_id is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;

  if target_total_cents is null or target_total_cents <= 0 then
    raise exception 'Valor da nota fiscal deve ser positivo.' using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(target_period_label, ''))) not between 2 and 60 then
    raise exception 'Informe uma competência válida.' using errcode = '22023';
  end if;

  if char_length(clean_tax_id) not between 11 and 24 then
    raise exception 'Informe um CPF ou CNPJ válido.' using errcode = '22023';
  end if;

  if target_provider not in ('drvet_fiscal', 'bling', 'omie') then
    raise exception 'Emissor fiscal inválido.' using errcode = '22023';
  end if;

  select m.organization_id into target_org_id
  from public.organization_memberships m
  where m.user_id = actor_id
  order by m.created_at asc
  limit 1;

  if target_org_id is null then
    raise exception 'Você precisa estar vinculado a uma clínica ou organização parceira para solicitar NFSe.'
      using errcode = '42501';
  end if;

  gen_number := 'RPS-' || to_char(now(), 'YYYYMM') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  gen_code := 'NF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.fiscal_invoices (
    organization_id,
    veterinarian_id,
    invoice_number,
    period_label,
    total_cents,
    tax_id,
    verification_code,
    status,
    provider,
    notes
  )
  values (
    target_org_id,
    actor_id,
    gen_number,
    btrim(target_period_label),
    target_total_cents,
    clean_tax_id,
    gen_code,
    'requested',
    target_provider,
    nullif(btrim(target_notes), '')
  )
  returning * into created_invoice;

  return created_invoice;
end;
$$;

revoke all on function public.request_fiscal_invoice(text, integer, text, text, text) from public, anon;
grant execute on function public.request_fiscal_invoice(text, integer, text, text, text) to authenticated;

create or replace function public.update_fiscal_invoice_status(
  target_invoice uuid,
  next_status text
)
returns public.fiscal_invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.fiscal_invoices;
  updated_inv public.fiscal_invoices;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;

  if next_status not in ('requested', 'issued', 'cancelled') then
    raise exception 'Status fiscal inválido.' using errcode = '22023';
  end if;

  select * into inv from public.fiscal_invoices where id = target_invoice;
  if not found then
    raise exception 'Nota fiscal não encontrada.' using errcode = 'P0002';
  end if;

  if not (
    public.is_admin()
    or public.has_organization_role(
      inv.organization_id,
      array['owner', 'admin', 'billing']::public.organization_role[]
    )
  ) then
    raise exception 'Sem permissão para alterar status fiscal.' using errcode = '42501';
  end if;

  update public.fiscal_invoices
  set status = next_status,
      issued_at = case when next_status = 'issued' then coalesce(issued_at, now()) else issued_at end,
      updated_at = now()
  where id = target_invoice
  returning * into updated_inv;

  return updated_inv;
end;
$$;

revoke all on function public.update_fiscal_invoice_status(uuid, text) from public, anon;
grant execute on function public.update_fiscal_invoice_status(uuid, text) to authenticated;

-- ============================================================================
-- 5. ATRIBUIÇÃO DE CUPONS E QR CODE PARCEIRO (PERSISTÊNCIA NO ONBOARDING)
-- ============================================================================

create table if not exists public.partner_attributions (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  partner_listing_id uuid references public.partner_listings(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  coupon_code text not null,
  discount_percent integer not null default 0 check (discount_percent between 0 and 80),
  source text not null default 'qr_onboarding',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_attr_coupon_len check (char_length(btrim(coupon_code)) between 2 and 32),
  unique (tutor_id, coupon_code)
);

create index if not exists idx_partner_attributions_tutor_active
  on public.partner_attributions(tutor_id, active, updated_at desc);

drop trigger if exists set_partner_attributions_updated_at on public.partner_attributions;
create trigger set_partner_attributions_updated_at
  before update on public.partner_attributions
  for each row execute function public.set_updated_at();

alter table public.partner_attributions enable row level security;

revoke all on table public.partner_attributions from anon, authenticated;
grant select on table public.partner_attributions to authenticated;

drop policy if exists "Authorized users view partner attributions" on public.partner_attributions;
create policy "Authorized users view partner attributions"
  on public.partner_attributions for select to authenticated
  using (
    tutor_id = (select auth.uid())
    or public.is_admin()
    or (
      organization_id is not null
      and public.has_organization_role(
        organization_id,
        array['owner', 'admin']::public.organization_role[]
      )
    )
  );

create or replace function public.record_partner_attribution(target_coupon text)
returns public.partner_attributions
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_coupon text := upper(btrim(coalesce(target_coupon, '')));
  listing public.partner_listings;
  saved_row public.partner_attributions;
begin
  if actor_id is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;

  if char_length(normalized_coupon) not between 2 and 32 then
    raise exception 'Código de cupom inválido.' using errcode = '22023';
  end if;

  select * into listing
  from public.partner_listings
  where upper(coupon_code) = normalized_coupon
    and active = true
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'Cupom parceiro não encontrado ou inativo.' using errcode = 'P0002';
  end if;

  update public.partner_attributions
  set active = false, updated_at = now()
  where tutor_id = actor_id and coupon_code <> listing.coupon_code and active = true;

  insert into public.partner_attributions (
    tutor_id,
    partner_listing_id,
    organization_id,
    coupon_code,
    discount_percent,
    source,
    active
  )
  values (
    actor_id,
    listing.id,
    listing.organization_id,
    listing.coupon_code,
    listing.discount_percent,
    'qr_onboarding',
    true
  )
  on conflict (tutor_id, coupon_code) do update
  set partner_listing_id = excluded.partner_listing_id,
      organization_id = excluded.organization_id,
      discount_percent = excluded.discount_percent,
      active = true,
      updated_at = now()
  returning * into saved_row;

  return saved_row;
end;
$$;

revoke all on function public.record_partner_attribution(text) from public, anon;
grant execute on function public.record_partner_attribution(text) to authenticated;

-- ============================================================================
-- 6. SOLICITAÇÕES DE CREDENCIAMENTO (VETERINÁRIO / PARCEIRO B2B) -> ADMIN
-- ============================================================================

create table if not exists public.role_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_role text not null check (requested_role in ('veterinarian', 'partner')),
  organization_name text not null,
  document_id text not null,
  registration_region text check (registration_region is null or registration_region ~ '^[A-Z]{2}$'),
  specialty text check (specialty is null or char_length(specialty) <= 120),
  city text check (city is null or char_length(city) <= 80),
  state text check (state is null or state ~ '^[A-Z]{2}$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_notes text check (reviewer_notes is null or char_length(reviewer_notes) <= 500),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint role_app_org_len check (char_length(btrim(organization_name)) between 2 and 140),
  constraint role_app_doc_len check (char_length(btrim(document_id)) between 2 and 32)
);

create index if not exists idx_role_applications_status_created
  on public.role_applications(status, created_at desc);

drop trigger if exists set_role_applications_updated_at on public.role_applications;
create trigger set_role_applications_updated_at
  before update on public.role_applications
  for each row execute function public.set_updated_at();

alter table public.role_applications enable row level security;

revoke all on table public.role_applications from anon, authenticated;
grant select on table public.role_applications to authenticated;

drop policy if exists "Applicants and admins view role applications" on public.role_applications;
create policy "Applicants and admins view role applications"
  on public.role_applications for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create or replace function public.submit_role_application(
  target_requested_role text,
  target_organization_name text,
  target_document_id text,
  target_registration_region text default null,
  target_specialty text default null,
  target_city text default null,
  target_state text default null
)
returns public.role_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  clean_uf text := nullif(upper(btrim(coalesce(target_registration_region, ''))), '');
  clean_state text := nullif(upper(btrim(coalesce(target_state, ''))), '');
  created_app public.role_applications;
begin
  if actor_id is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;

  if target_requested_role not in ('veterinarian', 'partner') then
    raise exception 'Tipo de credenciamento inválido.' using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(target_organization_name, ''))) not between 2 and 140 then
    raise exception 'Informe o nome da clínica, consultório ou estabelecimento.' using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(target_document_id, ''))) not between 2 and 32 then
    raise exception 'Informe o CRMV (veterinário) ou CNPJ (parceiro).' using errcode = '22023';
  end if;

  if target_requested_role = 'veterinarian' and (clean_uf is null or clean_uf !~ '^[A-Z]{2}$') then
    raise exception 'Informe a UF de 2 letras do CRMV.' using errcode = '22023';
  end if;

  if clean_state is not null and clean_state !~ '^[A-Z]{2}$' then
    raise exception 'UF da cidade deve ter 2 letras.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.role_applications
    where user_id = actor_id and status = 'pending'
  ) then
    raise exception 'Você já possui uma solicitação em análise pela equipe.' using errcode = '23505';
  end if;

  insert into public.role_applications (
    user_id,
    requested_role,
    organization_name,
    document_id,
    registration_region,
    specialty,
    city,
    state,
    status
  )
  values (
    actor_id,
    target_requested_role,
    btrim(target_organization_name),
    btrim(target_document_id),
    clean_uf,
    nullif(btrim(target_specialty), ''),
    nullif(btrim(target_city), ''),
    clean_state,
    'pending'
  )
  returning * into created_app;

  return created_app;
end;
$$;

revoke all on function public.submit_role_application(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_role_application(text, text, text, text, text, text, text) to authenticated;

create or replace function public.review_role_application(
  target_application uuid,
  approve boolean,
  target_notes text default null
)
returns public.role_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  reviewer_id uuid := auth.uid();
  app public.role_applications;
  updated_app public.role_applications;
  new_org_id uuid;
  gen_coupon text;
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito ao administrador global.' using errcode = '42501';
  end if;

  select * into app from public.role_applications where id = target_application for update;
  if not found then
    raise exception 'Solicitação não encontrada.' using errcode = 'P0002';
  end if;

  if app.status <> 'pending' then
    raise exception 'Esta solicitação já foi avaliada.' using errcode = '55000';
  end if;

  update public.role_applications
  set status = case when approve then 'approved' else 'rejected' end,
      reviewer_notes = nullif(btrim(target_notes), ''),
      reviewed_by = reviewer_id,
      reviewed_at = now(),
      updated_at = now()
  where id = target_application
  returning * into updated_app;

  if approve then
    update public.profiles
    set role = case when role = 'admin' then 'admin'::public.user_role else app.requested_role::public.user_role end
    where id = app.user_id;

    insert into public.organizations (name, created_by)
    values (app.organization_name, app.user_id)
    returning id into new_org_id;

    insert into public.organization_memberships (organization_id, user_id, role)
    values (
      new_org_id,
      app.user_id,
      case when app.requested_role = 'partner' then 'owner'::public.organization_role else 'veterinarian'::public.organization_role end
    )
    on conflict (organization_id, user_id) do update
    set role = excluded.role;

    if app.requested_role = 'veterinarian' then
      insert into public.veterinarian_profiles (
        user_id,
        organization_id,
        registration_number,
        registration_region,
        specialty,
        status
      )
      values (
        app.user_id,
        new_org_id,
        app.document_id,
        coalesce(app.registration_region, 'SP'),
        app.specialty,
        'approved'
      )
      on conflict (organization_id, user_id) do update
      set registration_number = excluded.registration_number,
          registration_region = excluded.registration_region,
          specialty = excluded.specialty,
          status = 'approved';
    else
      gen_coupon := 'PARC' || upper(substr(replace(new_org_id::text, '-', ''), 1, 5));
      insert into public.partner_listings (
        organization_id,
        kind,
        trade_name,
        city,
        state,
        coupon_code,
        discount_percent,
        active
      )
      values (
        new_org_id,
        'pet_shop',
        app.organization_name,
        coalesce(app.city, 'São Paulo'),
        coalesce(app.state, 'SP'),
        gen_coupon,
        15,
        true
      );
    end if;
  end if;

  return updated_app;
end;
$$;

revoke all on function public.review_role_application(uuid, boolean, text) from public, anon;
grant execute on function public.review_role_application(uuid, boolean, text) to authenticated;

-- ============================================================================
-- 7. RECEITAS EMITIDAS COM VERIFICAÇÃO POR QR CODE E VISIBILIDADE AO TUTOR
-- ============================================================================

alter table public.prescription_drafts
  add column if not exists status text not null default 'draft',
  add column if not exists issued_at timestamptz,
  add column if not exists verification_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'prescription_drafts_status_check'
  ) then
    alter table public.prescription_drafts
      add constraint prescription_drafts_status_check
      check (status in ('draft', 'issued'));
  end if;
end
$$;

create unique index if not exists idx_prescription_drafts_verification_code
  on public.prescription_drafts(verification_code)
  where verification_code is not null;

drop policy if exists "Tutors can read issued prescriptions for own pets" on public.prescription_drafts;
create policy "Tutors can read issued prescriptions for own pets"
  on public.prescription_drafts for select to authenticated
  using (
    status = 'issued'
    and exists (
      select 1 from public.appointments a
      where a.id = prescription_drafts.appointment_id
        and a.tutor_id = (select auth.uid())
    )
  );

-- Impede edição de receita já emitida ao salvar rascunho.
create or replace function public.save_prescription_draft(
  target_appointment uuid,
  target_items jsonb
)
returns public.prescription_drafts
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_appointment public.appointments;
  existing_draft public.prescription_drafts;
  saved_draft public.prescription_drafts;
  item jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select appointment.*
  into current_appointment
  from public.appointments appointment
  where appointment.id = target_appointment
  for update;

  if not found then
    raise exception 'Appointment not found' using errcode = 'P0002';
  end if;

  if current_appointment.veterinarian_id <> auth.uid()
     or current_appointment.status not in ('confirmed', 'completed')
     or (
       current_appointment.status = 'confirmed'
       and current_appointment.starts_at > now()
     )
     or not public.is_approved_veterinarian(
       current_appointment.organization_id,
       auth.uid()
     ) then
    raise exception 'Only the assigned veterinarian can save a prescription draft'
      using errcode = '42501';
  end if;

  select * into existing_draft
  from public.prescription_drafts
  where appointment_id = target_appointment;

  if found and existing_draft.status = 'issued' then
    raise exception 'Esta receita já foi emitida oficialmente e não pode ser alterada.'
      using errcode = '55000';
  end if;

  if target_items is null or jsonb_typeof(target_items) <> 'array' then
    raise exception 'Invalid prescription items' using errcode = '22023';
  end if;

  if jsonb_array_length(target_items) not between 1 and 30 then
    raise exception 'A draft must contain between 1 and 30 items'
      using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(target_items)
  loop
    if jsonb_typeof(item) is distinct from 'object'
       or item - array[
         'name',
         'presentation',
         'dose',
         'route',
         'frequency',
         'duration',
         'quantity',
         'instructions'
       ] <> '{}'::jsonb
       or jsonb_typeof(item -> 'name') is distinct from 'string'
       or char_length(btrim(coalesce(item ->> 'name', ''))) not between 1 and 160
       or jsonb_typeof(item -> 'presentation') is distinct from 'string'
       or char_length(item ->> 'presentation') > 120
       or jsonb_typeof(item -> 'dose') is distinct from 'string'
       or char_length(item ->> 'dose') > 250
       or jsonb_typeof(item -> 'route') is distinct from 'string'
       or char_length(item ->> 'route') > 100
       or jsonb_typeof(item -> 'frequency') is distinct from 'string'
       or char_length(item ->> 'frequency') > 160
       or jsonb_typeof(item -> 'duration') is distinct from 'string'
       or char_length(item ->> 'duration') > 160
       or jsonb_typeof(item -> 'quantity') is distinct from 'string'
       or char_length(item ->> 'quantity') > 120
       or jsonb_typeof(item -> 'instructions') is distinct from 'string'
       or char_length(item ->> 'instructions') > 1000 then
      raise exception 'Invalid prescription item' using errcode = '22023';
    end if;
  end loop;

  insert into public.prescription_drafts (
    appointment_id,
    organization_id,
    pet_id,
    veterinarian_id,
    items,
    updated_by,
    status
  )
  values (
    current_appointment.id,
    current_appointment.organization_id,
    current_appointment.pet_id,
    current_appointment.veterinarian_id,
    target_items,
    auth.uid(),
    'draft'
  )
  on conflict (appointment_id) do update
  set items = excluded.items,
      updated_by = excluded.updated_by,
      updated_at = now()
  where public.prescription_drafts.veterinarian_id = auth.uid()
    and public.prescription_drafts.status = 'draft'
  returning * into saved_draft;

  if not found then
    raise exception 'Prescription draft cannot be updated'
      using errcode = '42501';
  end if;

  return saved_draft;
end;
$$;

create or replace function public.issue_prescription(target_appointment uuid)
returns public.prescription_drafts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  apt public.appointments;
  draft public.prescription_drafts;
  pet_name_text text;
  gen_code text;
begin
  if actor_id is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;

  select * into apt
  from public.appointments
  where id = target_appointment;

  if not found then
    raise exception 'Atendimento não encontrado.' using errcode = 'P0002';
  end if;

  if apt.veterinarian_id <> actor_id
     or not public.is_approved_veterinarian(apt.organization_id, actor_id) then
    raise exception 'Somente o veterinário responsável aprovado pode emitir a receita.'
      using errcode = '42501';
  end if;

  select * into draft
  from public.prescription_drafts
  where appointment_id = target_appointment
  for update;

  if not found then
    raise exception 'Salve o rascunho da receita antes de emitir.' using errcode = 'P0002';
  end if;

  if draft.status = 'issued' then
    return draft;
  end if;

  gen_code := 'RX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  update public.prescription_drafts
  set status = 'issued',
      issued_at = now(),
      verification_code = gen_code,
      updated_by = actor_id,
      updated_at = now()
  where id = draft.id
  returning * into draft;

  select p.name into pet_name_text from public.pets p where p.id = apt.pet_id;

  insert into public.notifications (
    recipient_id,
    appointment_id,
    kind,
    title,
    body,
    action_url,
    dedupe_key
  )
  values (
    apt.tutor_id,
    apt.id,
    'appointment_confirmed',
    'Nova receita emitida para ' || coalesce(pet_name_text, 'seu pet'),
    'Código de verificação ' || gen_code || ' disponível para impressão ou uso na farmácia.',
    '/receitas',
    'rx-' || draft.id::text
  )
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;

  return draft;
end;
$$;

revoke all on function public.issue_prescription(uuid) from public, anon;
grant execute on function public.issue_prescription(uuid) to authenticated;

create or replace function public.verify_prescription_code(target_code text)
returns table (
  verification_code text,
  status text,
  issued_at timestamptz,
  pet_name text,
  species text,
  veterinarian_name text,
  crmv text,
  items_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.verification_code,
    d.status,
    d.issued_at,
    p.name as pet_name,
    p.species,
    coalesce(nullif(btrim(prof.display_name), ''), 'Médico-Veterinário') as veterinarian_name,
    'CRMV-' || vp.registration_region || ' ' || vp.registration_number as crmv,
    jsonb_array_length(d.items) as items_count
  from public.prescription_drafts d
  join public.pets p on p.id = d.pet_id
  join public.profiles prof on prof.id = d.veterinarian_id
  join public.veterinarian_profiles vp
    on vp.user_id = d.veterinarian_id and vp.organization_id = d.organization_id
  where d.verification_code = upper(btrim(target_code))
    and d.status = 'issued'
  limit 1;
$$;

revoke all on function public.verify_prescription_code(text) from public;
grant execute on function public.verify_prescription_code(text) to anon, authenticated;

-- ============================================================================
-- 8. PAGAMENTOS PENDENTES COM PIX + LIQUIDAÇÃO AUTOMÁTICA EM COMISSÕES
-- ============================================================================

alter table public.payment_orders
  add column if not exists pix_payload text,
  add column if not exists provider_payment_id text;

create or replace function public.settle_payment_order(
  target_order_id uuid,
  target_reference text default null
)
returns public.payment_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  ord public.payment_orders;
  updated_ord public.payment_orders;
  apt public.appointments;
  tutor_name_text text;
  pet_name_text text;
  vet_net_cents integer;
  comm_ref text;
begin
  select * into ord
  from public.payment_orders
  where id = target_order_id
  for update;

  if not found then
    raise exception 'Pedido de pagamento não encontrado.' using errcode = 'P0002';
  end if;

  if actor_id is not null and not (
    public.is_admin()
    or (
      ord.organization_id is not null
      and public.has_organization_role(
        ord.organization_id,
        array['owner', 'admin', 'billing']::public.organization_role[]
      )
    )
  ) then
    raise exception 'Apenas administradores, financeiro da clínica ou webhooks autorizados podem dar baixa no pagamento.'
      using errcode = '42501';
  end if;

  if ord.status = 'paid' then
    return ord;
  end if;

  update public.payment_orders
  set status = 'paid',
      paid_at = coalesce(paid_at, now()),
      external_reference = coalesce(nullif(btrim(target_reference), ''), external_reference),
      updated_at = now()
  where id = ord.id
  returning * into updated_ord;

  if updated_ord.subscription_id is not null then
    update public.pet_subscriptions
    set status = 'active',
        updated_at = now()
    where id = updated_ord.subscription_id
      and status = 'paused';
  end if;

  if updated_ord.appointment_id is not null then
    select * into apt
    from public.appointments
    where id = updated_ord.appointment_id;

    if found then
      if apt.status = 'pending' then
        update public.appointments
        set status = 'confirmed', updated_at = now()
        where id = apt.id;
      end if;

      select coalesce(nullif(btrim(prof.display_name), ''), 'Tutor')
      into tutor_name_text
      from public.profiles prof where prof.id = apt.tutor_id;

      select coalesce(nullif(btrim(p.name), ''), 'Pet')
      into pet_name_text
      from public.pets p where p.id = apt.pet_id;

      vet_net_cents := round((updated_ord.net_amount_cents * 85)::numeric / 100.0)::integer;
      comm_ref := 'COM-' || upper(substr(replace(updated_ord.id::text, '-', ''), 1, 10));

      insert into public.commission_ledger (
        organization_id,
        veterinarian_id,
        appointment_id,
        reference,
        tutor_name,
        pet_name,
        origin,
        gross_amount_cents,
        net_amount_cents,
        status,
        occurred_at
      )
      values (
        apt.organization_id,
        apt.veterinarian_id,
        apt.id,
        comm_ref,
        coalesce(tutor_name_text, 'Tutor'),
        coalesce(pet_name_text, 'Pet'),
        case when apt.kind = 'teleconsultation' then 'teleconsultation'::public.commission_origin else 'in_person'::public.commission_origin end,
        updated_ord.net_amount_cents,
        vet_net_cents,
        'available',
        now()
      )
      on conflict (reference) do nothing;
    end if;
  end if;

  return updated_ord;
end;
$$;

revoke all on function public.settle_payment_order(uuid, text) from public, anon;
grant execute on function public.settle_payment_order(uuid, text) to authenticated;

create or replace function public.create_pending_appointment_order(
  target_appointment uuid,
  target_method public.payment_method default 'pix',
  target_coupon text default null,
  target_pix_payload text default null,
  target_provider_id text default null
)
returns public.payment_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  apt public.appointments;
  pet_row public.pets;
  vet_fee integer := 18000;
  discount_pct integer := 0;
  club_pct integer := 0;
  coupon_pct integer := 0;
  discount_val integer := 0;
  net_val integer := 18000;
  effective_coupon text := nullif(upper(btrim(coalesce(target_coupon, ''))), '');
  existing_pending public.payment_orders;
  saved_order public.payment_orders;
begin
  if actor_id is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;

  select * into apt
  from public.appointments
  where id = target_appointment;

  if not found or (apt.tutor_id <> actor_id and not public.is_admin()) then
    raise exception 'Consulta não encontrada ou sem permissão de pagamento.'
      using errcode = '42501';
  end if;

  if apt.status = 'cancelled' then
    raise exception 'Não é possível gerar cobrança para uma consulta cancelada.'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.payment_orders
    where appointment_id = target_appointment and status = 'paid'
  ) then
    raise exception 'Esta consulta já possui pagamento confirmado.'
      using errcode = '23505';
  end if;

  select coalesce(vp.consultation_fee_cents, 18000) into vet_fee
  from public.veterinarian_profiles vp
  where vp.user_id = apt.veterinarian_id
    and vp.organization_id = apt.organization_id
  limit 1;

  vet_fee := coalesce(vet_fee, 18000);

  select * into pet_row from public.pets where id = apt.pet_id;

  select coalesce(max(discount_percent), 0) into club_pct
  from public.pet_subscriptions
  where pet_id = apt.pet_id and status = 'active';

  if effective_coupon is null then
    select pa.coupon_code, pa.discount_percent
    into effective_coupon, coupon_pct
    from public.partner_attributions pa
    where pa.tutor_id = apt.tutor_id and pa.active = true
    order by pa.updated_at desc
    limit 1;
  elsif effective_coupon <> '' then
    select coalesce(max(discount_percent), 0) into coupon_pct
    from public.partner_listings
    where upper(coupon_code) = effective_coupon and active = true;

    if coupon_pct = 0 then
      raise exception 'Cupom informado não encontrado ou inativo.'
        using errcode = '22023';
    end if;
  end if;

  discount_pct := greatest(coalesce(club_pct, 0), coalesce(coupon_pct, 0));
  discount_val := round((vet_fee * discount_pct)::numeric / 100.0)::integer;
  net_val := greatest(0, vet_fee - discount_val);

  select * into existing_pending
  from public.payment_orders
  where appointment_id = target_appointment and status = 'pending'
  order by created_at desc
  limit 1;

  if found then
    update public.payment_orders
    set amount_cents = vet_fee,
        discount_cents = discount_val,
        net_amount_cents = net_val,
        method = target_method,
        pix_payload = coalesce(target_pix_payload, pix_payload),
        provider_payment_id = coalesce(target_provider_id, provider_payment_id),
        updated_at = now()
    where id = existing_pending.id
    returning * into saved_order;
    return saved_order;
  end if;

  insert into public.payment_orders (
    user_id,
    organization_id,
    appointment_id,
    kind,
    description,
    amount_cents,
    discount_cents,
    net_amount_cents,
    method,
    status,
    external_reference,
    pix_payload,
    provider_payment_id
  )
  values (
    apt.tutor_id,
    apt.organization_id,
    apt.id,
    case when apt.kind = 'teleconsultation' then 'teleconsultation'::public.payment_kind else 'pharmacy'::public.payment_kind end,
    'Atendimento Veterinário — ' || coalesce(pet_row.name, 'Pet'),
    vet_fee,
    discount_val,
    net_val,
    target_method,
    'pending',
    'PAY-' || upper(substr(replace(apt.id::text, '-', ''), 1, 8)),
    target_pix_payload,
    target_provider_id
  )
  returning * into saved_order;

  return saved_order;
end;
$$;

revoke all on function public.create_pending_appointment_order(uuid, public.payment_method, text, text, text) from public, anon;
grant execute on function public.create_pending_appointment_order(uuid, public.payment_method, text, text, text) to authenticated;

-- Atualiza create_teleconsultation_payment para usar honorário real do veterinário e registrar comissão.
create or replace function public.create_teleconsultation_payment(
  target_appointment uuid,
  target_method public.payment_method default 'pix',
  target_coupon text default null
)
returns public.payment_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_order public.payment_orders;
begin
  if not public.is_admin() then
    -- Tutores geram cobrança pendente (PIX QR / gateway) via create_pending_appointment_order.
    return public.create_pending_appointment_order(target_appointment, target_method, target_coupon, null, null);
  end if;

  created_order := public.create_pending_appointment_order(target_appointment, target_method, target_coupon, null, null);
  return public.settle_payment_order(created_order.id, created_order.external_reference);
end;
$$;

-- ============================================================================
-- 9. REALTIME PUBLICATION COMPLETA PARA MENSAGENS, SESSÕES E PAGAMENTOS
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'teleconsultation_messages'
  ) then
    alter publication supabase_realtime add table public.teleconsultation_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'teleconsultation_sessions'
  ) then
    alter publication supabase_realtime add table public.teleconsultation_sessions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payment_orders'
  ) then
    alter publication supabase_realtime add table public.payment_orders;
  end if;
end
$$;

-- ============================================================================
-- 10. CONTA DE REPASSE / CHAVE PIX DO VETERINÁRIO
-- ============================================================================

grant insert, update on table public.payout_accounts to authenticated;

create or replace function public.upsert_my_payout_account(
  target_provider text,
  target_label text,
  target_pix_key text
)
returns public.payout_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_org_id uuid;
  clean_provider text := lower(btrim(coalesce(target_provider, 'asaas')));
  clean_label text := btrim(coalesce(target_label, ''));
  clean_pix text := btrim(coalesce(target_pix_key, ''));
  saved_account public.payout_accounts;
begin
  if actor_id is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;

  if clean_provider not in ('asaas', 'mercadopago') then
    raise exception 'Provedor inválido. Escolha asaas ou mercadopago.' using errcode = '22023';
  end if;

  if char_length(clean_label) not between 3 and 160 then
    raise exception 'Informe a identificação da conta bancária ou titular.' using errcode = '22023';
  end if;

  if char_length(clean_pix) not between 5 and 120 then
    raise exception 'Informe uma chave PIX válida.' using errcode = '22023';
  end if;

  select coalesce(vp.organization_id, m.organization_id) into target_org_id
  from public.organization_memberships m
  left join public.veterinarian_profiles vp
    on vp.user_id = m.user_id and vp.organization_id = m.organization_id
  where m.user_id = actor_id
  order by m.created_at asc
  limit 1;

  if target_org_id is null then
    raise exception 'Vincule-se a uma clínica ou credencie-se como veterinário para configurar repasses.'
      using errcode = '42501';
  end if;

  insert into public.payout_accounts (
    organization_id,
    veterinarian_id,
    provider,
    provider_connected,
    payout_account_label,
    pix_key_masked
  )
  values (
    target_org_id,
    actor_id,
    clean_provider,
    true,
    clean_label,
    clean_pix
  )
  on conflict (organization_id, veterinarian_id) do update
  set provider = excluded.provider,
      provider_connected = true,
      payout_account_label = excluded.payout_account_label,
      pix_key_masked = excluded.pix_key_masked,
      updated_at = now()
  returning * into saved_account;

  return saved_account;
end;
$$;

revoke all on function public.upsert_my_payout_account(text, text, text) from public, anon;
grant execute on function public.upsert_my_payout_account(text, text, text) to authenticated;

-- ============================================================================
-- 11. PERMISSÕES EXPLÍCITAS DE TABELAS E FUNÇÕES (GRANTS + RLS)
-- ============================================================================

grant select on table public.pets to authenticated;
grant select on table public.subscription_plans, public.partner_listings to anon, authenticated;
grant insert, update, delete on table
  public.organizations,
  public.organization_memberships,
  public.veterinarian_profiles,
  public.commission_ledger,
  public.anticipation_requests
  to authenticated;

grant execute on function public.settle_payment_order(uuid, text) to authenticated, service_role;

-- ============================================================================
-- 12. BACKFILL DE PERFIS PARA USUÁRIOS JÁ EXISTENTES EM auth.users
-- ============================================================================

insert into public.profiles (id, display_name, email, role)
select
  u.id,
  left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''), ''), 120),
  u.email,
  case
    when u.email = 'admin@drvet.local' then 'admin'::public.user_role
    when u.email in ('camila.vet@drvet.local', 'rafael.vet@drvet.local') then 'veterinarian'::public.user_role
    else 'tutor'::public.user_role
  end
from auth.users u
on conflict (id) do update
set email = coalesce(excluded.email, public.profiles.email),
    display_name = case
      when public.profiles.display_name = '' then excluded.display_name
      else public.profiles.display_name
    end,
    role = case
      when excluded.email = 'admin@drvet.local' then 'admin'::public.user_role
      else public.profiles.role
    end;

-- ============================================================================
-- 13. SUPORTE ADMINISTRATIVO EM transition_appointment
-- ============================================================================

create or replace function public.transition_appointment(
  target_appointment uuid,
  next_status public.appointment_status
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_appointment public.appointments;
  is_assigned_veterinarian boolean;
  is_authorized_owner boolean;
  is_global_admin boolean := public.is_admin();
begin
  select appointment.*
  into current_appointment
  from public.appointments appointment
  where appointment.id = target_appointment
  for update;

  if not found then
    raise exception 'Appointment not found' using errcode = 'P0002';
  end if;

  is_assigned_veterinarian :=
    current_appointment.veterinarian_id = auth.uid()
    and public.is_approved_veterinarian(
      current_appointment.organization_id,
      auth.uid()
    );
  is_authorized_owner :=
    is_global_admin
    or current_appointment.tutor_id = auth.uid()
    or public.has_organization_role(
      current_appointment.organization_id,
      array['owner', 'admin']::public.organization_role[]
    );

  if next_status = 'cancelled' then
    if not (is_authorized_owner or is_assigned_veterinarian) then
      raise exception 'Not authorized to cancel this appointment'
        using errcode = '42501';
    end if;
    if current_appointment.status not in ('pending', 'confirmed')
       or (current_appointment.starts_at <= now() and not is_global_admin) then
      raise exception 'Appointment can no longer be cancelled'
        using errcode = '22023';
    end if;
  elsif next_status = 'confirmed' then
    if (not is_assigned_veterinarian and not is_global_admin)
       or current_appointment.status <> 'pending'
       or current_appointment.starts_at <= now() then
      raise exception 'Appointment cannot be confirmed'
        using errcode = '42501';
    end if;
  elsif next_status = 'completed' then
    if (not is_assigned_veterinarian and not is_global_admin)
       or current_appointment.status <> 'confirmed'
       or (current_appointment.ends_at > now() and not is_global_admin) then
      raise exception 'Appointment cannot be completed'
        using errcode = '42501';
    end if;
  else
    raise exception 'Unsupported appointment status transition'
      using errcode = '22023';
  end if;

  update public.appointments
  set status = next_status
  where id = target_appointment
  returning * into current_appointment;

  return current_appointment;
end;
$$;

notify pgrst, 'reload schema';
