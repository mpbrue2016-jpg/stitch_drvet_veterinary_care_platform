-- Migration 16: Foto profissional no cadastro de veterinário (vet-avatars + avatar_path)
-- e sistema completo de Biometria Facial no login (facial_biometrics + facial_biometric_verifications).

-- ============================================================================
-- 1. LOCAL DA FOTO DO VETERINÁRIO (COLUNAS + BUCKET + POLICIES)
-- ============================================================================

alter table public.profiles
  add column if not exists avatar_path text;

alter table public.veterinarian_profiles
  add column if not exists avatar_path text;

alter table public.role_applications
  add column if not exists avatar_path text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_avatar_path_check'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_path_check
      check (
        avatar_path is null
        or (
          char_length(btrim(avatar_path)) between 5 and 300
          and position('..' in avatar_path) = 0
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'vet_profiles_avatar_path_check'
  ) then
    alter table public.veterinarian_profiles
      add constraint vet_profiles_avatar_path_check
      check (
        avatar_path is null
        or (
          char_length(btrim(avatar_path)) between 5 and 300
          and position('..' in avatar_path) = 0
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'role_applications_avatar_path_check'
  ) then
    alter table public.role_applications
      add constraint role_applications_avatar_path_check
      check (
        avatar_path is null
        or (
          char_length(btrim(avatar_path)) between 5 and 300
          and position('..' in avatar_path) = 0
        )
      );
  end if;
end
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vet-avatars',
  'vet-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view veterinarian avatars" on storage.objects;
create policy "Public can view veterinarian avatars"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'vet-avatars');

drop policy if exists "Authorized users can upload veterinarian avatars" on storage.objects;
create policy "Authorized users can upload veterinarian avatars"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vet-avatars'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = (select auth.uid()::text)
      or exists (
        select 1
        from public.organizations o
        where o.id::text = (storage.foldername(name))[1]
          and public.has_organization_role(
            o.id,
            array['owner', 'admin']::public.organization_role[]
          )
      )
    )
  );

drop policy if exists "Authorized users can update veterinarian avatars" on storage.objects;
create policy "Authorized users can update veterinarian avatars"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'vet-avatars'
    and (
      public.is_admin()
      or owner = (select auth.uid())
      or (storage.foldername(name))[1] = (select auth.uid()::text)
      or exists (
        select 1
        from public.organizations o
        where o.id::text = (storage.foldername(name))[1]
          and public.has_organization_role(
            o.id,
            array['owner', 'admin']::public.organization_role[]
          )
      )
    )
  )
  with check (
    bucket_id = 'vet-avatars'
    and (
      public.is_admin()
      or owner = (select auth.uid())
      or (storage.foldername(name))[1] = (select auth.uid()::text)
      or exists (
        select 1
        from public.organizations o
        where o.id::text = (storage.foldername(name))[1]
          and public.has_organization_role(
            o.id,
            array['owner', 'admin']::public.organization_role[]
          )
      )
    )
  );

drop policy if exists "Authorized users can delete veterinarian avatars" on storage.objects;
create policy "Authorized users can delete veterinarian avatars"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vet-avatars'
    and (
      public.is_admin()
      or owner = (select auth.uid())
      or (storage.foldername(name))[1] = (select auth.uid()::text)
      or exists (
        select 1
        from public.organizations o
        where o.id::text = (storage.foldername(name))[1]
          and public.has_organization_role(
            o.id,
            array['owner', 'admin']::public.organization_role[]
          )
      )
    )
  );

-- ============================================================================
-- 2. ATUALIZAÇÃO DAS RPCS DE CADASTRO E CATÁLOGO DE VETERINÁRIOS COM FOTO
-- ============================================================================

drop function if exists public.get_public_veterinarians();
create function public.get_public_veterinarians()
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
  open_slots_count bigint,
  avatar_path text
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
    ) as open_slots_count,
    coalesce(vp.avatar_path, p.avatar_path) as avatar_path
  from public.veterinarian_profiles vp
  join public.profiles p on p.id = vp.user_id
  join public.organizations o on o.id = vp.organization_id
  where vp.status = 'approved'
  order by vp.is_online_now desc, open_slots_count desc, p.display_name asc;
$$;

revoke all on function public.get_public_veterinarians() from public;
grant execute on function public.get_public_veterinarians() to anon, authenticated;

drop function if exists public.add_veterinarian(uuid, uuid, text, text, text);
create or replace function public.add_veterinarian(
  target_organization uuid,
  target_user uuid,
  target_registration_number text,
  target_registration_region text,
  target_specialty text default null,
  target_avatar_path text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_avatar text := nullif(btrim(coalesce(target_avatar_path, '')), '');
begin
  if auth.uid() is null
     or not public.has_organization_role(
       target_organization,
       array['owner', 'admin']::public.organization_role[]
     ) then
    raise exception 'Not authorized to add a veterinarian'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = target_user) then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;

  if char_length(btrim(target_registration_number)) not between 1 and 32
     or target_registration_region !~ '^[A-Z]{2}$'
     or (target_specialty is not null and char_length(target_specialty) > 120) then
    raise exception 'Invalid veterinarian registration data'
      using errcode = '22023';
  end if;

  if clean_avatar is not null and (char_length(clean_avatar) not between 5 and 300 or position('..' in clean_avatar) > 0) then
    raise exception 'Caminho da foto profissional inválido.' using errcode = '22023';
  end if;

  insert into public.organization_memberships (organization_id, user_id, role)
  values (target_organization, target_user, 'veterinarian')
  on conflict (organization_id, user_id) do update
  set role = 'veterinarian';

  insert into public.veterinarian_profiles (
    user_id,
    organization_id,
    registration_number,
    registration_region,
    specialty,
    avatar_path
  )
  values (
    target_user,
    target_organization,
    btrim(target_registration_number),
    target_registration_region,
    nullif(btrim(target_specialty), ''),
    clean_avatar
  );

  if clean_avatar is not null then
    update public.profiles
    set avatar_path = coalesce(avatar_path, clean_avatar),
        updated_at = now()
    where id = target_user;
  end if;
end;
$$;

revoke all on function public.add_veterinarian(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.add_veterinarian(uuid, uuid, text, text, text, text) to authenticated;

drop function if exists public.update_my_vet_profile(integer, text, boolean);
create or replace function public.update_my_vet_profile(
  target_consultation_fee_cents integer,
  target_bio text default null,
  target_is_online_now boolean default null,
  target_avatar_path text default null
)
returns public.veterinarian_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  clean_avatar text := nullif(btrim(coalesce(target_avatar_path, '')), '');
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

  if clean_avatar is not null and (char_length(clean_avatar) not between 5 and 300 or position('..' in clean_avatar) > 0) then
    raise exception 'Caminho da foto profissional inválido.' using errcode = '22023';
  end if;

  update public.veterinarian_profiles
  set consultation_fee_cents = target_consultation_fee_cents,
      bio = nullif(btrim(target_bio), ''),
      is_online_now = coalesce(target_is_online_now, is_online_now),
      avatar_path = coalesce(clean_avatar, avatar_path),
      updated_at = now()
  where user_id = actor_id
    and status = 'approved'
  returning * into updated_row;

  if not found then
    raise exception 'Perfil veterinário aprovado não encontrado para sua conta.'
      using errcode = 'P0002';
  end if;

  if clean_avatar is not null then
    update public.profiles
    set avatar_path = clean_avatar,
        updated_at = now()
    where id = actor_id;
  end if;

  return updated_row;
end;
$$;

revoke all on function public.update_my_vet_profile(integer, text, boolean, text) from public, anon;
grant execute on function public.update_my_vet_profile(integer, text, boolean, text) to authenticated;

drop function if exists public.submit_role_application(text, text, text, text, text, text, text);
create or replace function public.submit_role_application(
  target_requested_role text,
  target_organization_name text,
  target_document_id text,
  target_registration_region text default null,
  target_specialty text default null,
  target_city text default null,
  target_state text default null,
  target_avatar_path text default null
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
  clean_avatar text := nullif(btrim(coalesce(target_avatar_path, '')), '');
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

  if clean_avatar is not null and (char_length(clean_avatar) not between 5 and 300 or position('..' in clean_avatar) > 0) then
    raise exception 'Caminho da foto profissional inválido.' using errcode = '22023';
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
    avatar_path,
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
    clean_avatar,
    'pending'
  )
  returning * into created_app;

  if clean_avatar is not null then
    update public.profiles
    set avatar_path = coalesce(avatar_path, clean_avatar),
        updated_at = now()
    where id = actor_id;
  end if;

  return created_app;
end;
$$;

revoke all on function public.submit_role_application(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_role_application(text, text, text, text, text, text, text, text) to authenticated;

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
    set role = case when role = 'admin' then 'admin'::public.user_role else app.requested_role::public.user_role end,
        avatar_path = coalesce(app.avatar_path, avatar_path),
        updated_at = now()
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
        avatar_path,
        status
      )
      values (
        app.user_id,
        new_org_id,
        app.document_id,
        coalesce(app.registration_region, 'SP'),
        app.specialty,
        app.avatar_path,
        'approved'
      )
      on conflict (organization_id, user_id) do update
      set registration_number = excluded.registration_number,
          registration_region = excluded.registration_region,
          specialty = excluded.specialty,
          avatar_path = coalesce(excluded.avatar_path, public.veterinarian_profiles.avatar_path),
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
-- 3. SISTEMA DE BIOMETRIA FACIAL (CADASTRO E VALIDAÇÃO NO LOGIN)
-- ============================================================================

create table if not exists public.facial_biometrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked', 'pending_recalibration')),
  algorithm text not null default 'drvet-face-descriptor-v1',
  template_hash text not null check (template_hash ~ '^[a-f0-9]{64}$'),
  descriptor_vector jsonb not null check (
    jsonb_typeof(descriptor_vector) = 'array'
    and jsonb_array_length(descriptor_vector) between 32 and 256
  ),
  liveness_score numeric(5,4) not null check (liveness_score >= 0 and liveness_score <= 1),
  device_label text check (device_label is null or char_length(device_label) <= 160),
  enrolled_at timestamptz not null default now(),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_facial_biometrics_user_status
  on public.facial_biometrics (user_id, status);

drop trigger if exists set_facial_biometrics_updated_at on public.facial_biometrics;
create trigger set_facial_biometrics_updated_at
  before update on public.facial_biometrics
  for each row execute function public.set_updated_at();

alter table public.facial_biometrics enable row level security;

revoke all on table public.facial_biometrics from public, anon, authenticated;
grant select on table public.facial_biometrics to authenticated;

drop policy if exists "Users and admins read own facial biometrics" on public.facial_biometrics;
create policy "Users and admins read own facial biometrics"
  on public.facial_biometrics for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create table if not exists public.facial_biometric_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  biometric_id uuid references public.facial_biometrics(id) on delete set null,
  event_type text not null check (event_type in ('enroll', 'verify_success', 'verify_failed', 'revoke')),
  similarity_score numeric(5,4),
  liveness_score numeric(5,4),
  matched boolean not null default false,
  device_label text check (device_label is null or char_length(device_label) <= 160),
  created_at timestamptz not null default now()
);

create index if not exists idx_facial_biometric_verifications_user_created
  on public.facial_biometric_verifications (user_id, created_at desc);

alter table public.facial_biometric_verifications enable row level security;

revoke all on table public.facial_biometric_verifications from public, anon, authenticated;
grant select on table public.facial_biometric_verifications to authenticated;

drop policy if exists "Users and admins read own facial biometric logs" on public.facial_biometric_verifications;
create policy "Users and admins read own facial biometric logs"
  on public.facial_biometric_verifications for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create or replace function public.enroll_facial_biometrics(
  target_template_hash text,
  target_descriptor_vector jsonb,
  target_liveness_score numeric,
  target_device_label text default null
)
returns public.facial_biometrics
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  now_ts timestamptz := now();
  clean_hash text := lower(btrim(coalesce(target_template_hash, '')));
  clean_device text := nullif(left(btrim(coalesce(target_device_label, '')), 160), '');
  saved_row public.facial_biometrics;
begin
  if actor_id is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;

  if clean_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Assinatura biométrica inválida.' using errcode = '22023';
  end if;

  if target_descriptor_vector is null
     or jsonb_typeof(target_descriptor_vector) <> 'array'
     or jsonb_array_length(target_descriptor_vector) not between 32 and 256 then
    raise exception 'Descritor facial inválido.' using errcode = '22023';
  end if;

  if target_liveness_score is null or target_liveness_score < 0.55 or target_liveness_score > 1 then
    raise exception 'Prova de vida (liveness) insuficiente para cadastrar biometria.' using errcode = '22023';
  end if;

  insert into public.facial_biometrics (
    user_id,
    status,
    algorithm,
    template_hash,
    descriptor_vector,
    liveness_score,
    device_label,
    enrolled_at,
    last_verified_at
  )
  values (
    actor_id,
    'active',
    'drvet-face-descriptor-v1',
    clean_hash,
    target_descriptor_vector,
    round(target_liveness_score::numeric, 4),
    clean_device,
    now_ts,
    now_ts
  )
  on conflict (user_id) do update
  set status = 'active',
      algorithm = 'drvet-face-descriptor-v1',
      template_hash = excluded.template_hash,
      descriptor_vector = excluded.descriptor_vector,
      liveness_score = excluded.liveness_score,
      device_label = excluded.device_label,
      enrolled_at = now_ts,
      last_verified_at = now_ts,
      updated_at = now_ts
  returning * into saved_row;

  insert into public.facial_biometric_verifications (
    user_id,
    biometric_id,
    event_type,
    similarity_score,
    liveness_score,
    matched,
    device_label
  )
  values (
    actor_id,
    saved_row.id,
    'enroll',
    1.0000,
    round(target_liveness_score::numeric, 4),
    true,
    clean_device
  );

  return saved_row;
end;
$$;

revoke all on function public.enroll_facial_biometrics(text, jsonb, numeric, text) from public, anon;
grant execute on function public.enroll_facial_biometrics(text, jsonb, numeric, text) to authenticated;

create or replace function public.record_facial_biometric_verification(
  target_matched boolean,
  target_similarity_score numeric,
  target_liveness_score numeric,
  target_device_label text default null
)
returns public.facial_biometric_verifications
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  now_ts timestamptz := now();
  bio public.facial_biometrics;
  clean_device text := nullif(left(btrim(coalesce(target_device_label, '')), 160), '');
  created_log public.facial_biometric_verifications;
begin
  if actor_id is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;

  select * into bio
  from public.facial_biometrics
  where user_id = actor_id
    and status = 'active';

  if not found then
    raise exception 'Nenhuma biometria facial ativa cadastrada para esta conta.' using errcode = 'P0002';
  end if;

  if target_matched then
    update public.facial_biometrics
    set last_verified_at = now_ts,
        updated_at = now_ts
    where id = bio.id;
  end if;

  insert into public.facial_biometric_verifications (
    user_id,
    biometric_id,
    event_type,
    similarity_score,
    liveness_score,
    matched,
    device_label
  )
  values (
    actor_id,
    bio.id,
    case when target_matched then 'verify_success' else 'verify_failed' end,
    round(least(greatest(coalesce(target_similarity_score, 0), 0), 1)::numeric, 4),
    round(least(greatest(coalesce(target_liveness_score, 0), 0), 1)::numeric, 4),
    coalesce(target_matched, false),
    clean_device
  )
  returning * into created_log;

  return created_log;
end;
$$;

revoke all on function public.record_facial_biometric_verification(boolean, numeric, numeric, text) from public, anon;
grant execute on function public.record_facial_biometric_verification(boolean, numeric, numeric, text) to authenticated;

create or replace function public.revoke_facial_biometrics()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  bio public.facial_biometrics;
begin
  if actor_id is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;

  update public.facial_biometrics
  set status = 'revoked',
      updated_at = now()
  where user_id = actor_id
    and status <> 'revoked'
  returning * into bio;

  if found then
    insert into public.facial_biometric_verifications (
      user_id,
      biometric_id,
      event_type,
      matched
    )
    values (
      actor_id,
      bio.id,
      'revoke',
      false
    );
  end if;
end;
$$;

revoke all on function public.revoke_facial_biometrics() from public, anon;
grant execute on function public.revoke_facial_biometrics() to authenticated;

notify pgrst, 'reload schema';
