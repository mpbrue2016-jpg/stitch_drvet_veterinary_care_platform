-- ============================================================================
-- DrVet / DrVets — Instalador Consolidado e Idempotente (11 Migrations SQL)
-- Gerado a partir de supabase/migrations/ (ordem cronológica exata 01 -> 11)
-- Seguro para executar no Supabase SQL Editor (pode ser reexecutado sem erros).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- MIGRATION 01/11: 20261112210000_initial_drvet_backend.sql
-- ----------------------------------------------------------------------------

create schema if not exists extensions;

set search_path = public, extensions;

create extension if not exists btree_gist with schema extensions;

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'organization_role'
  ) then
    create type public.organization_role as enum (
  'owner',
  'admin',
  'veterinarian',
  'staff',
  'billing'
);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'professional_status'
  ) then
    create type public.professional_status as enum (
  'pending',
  'approved',
  'suspended'
);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'appointment_kind'
  ) then
    create type public.appointment_kind as enum (
  'teleconsultation',
  'in_person'
);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'appointment_status'
  ) then
    create type public.appointment_status as enum (
  'pending',
  'confirmed',
  'cancelled',
  'completed'
);
  end if;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 120),
  phone text check (phone is null or char_length(phone) <= 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_memberships (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.organization_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.veterinarian_profiles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  registration_number text not null,
  registration_region char(2) not null,
  specialty text check (specialty is null or char_length(specialty) <= 120),
  status public.professional_status not null default 'pending',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  unique (registration_region, registration_number)
);

create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100),
  species text not null check (char_length(species) between 1 and 60),
  breed text check (breed is null or char_length(breed) <= 100),
  birth_date date,
  sex text check (sex is null or sex in ('female', 'male', 'unknown')),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.professional_availability (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  veterinarian_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (organization_id, veterinarian_id)
    references public.veterinarian_profiles (organization_id, user_id)
    on delete cascade,
  check (ends_at > starts_at),
  exclude using gist (
    veterinarian_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (is_available)
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  availability_id uuid not null
    references public.professional_availability (id) on delete restrict,
  organization_id uuid not null,
  pet_id uuid not null references public.pets (id) on delete restrict,
  tutor_id uuid not null references public.profiles (id) on delete restrict,
  veterinarian_id uuid not null,
  kind public.appointment_kind not null,
  status public.appointment_status not null default 'pending',
  reason text check (reason is null or char_length(reason) <= 1000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, veterinarian_id)
    references public.veterinarian_profiles (organization_id, user_id)
    on delete restrict,
  check (ends_at > starts_at),
  exclude using gist (
    veterinarian_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed'))
);

create index if not exists pets_owner_id_idx on public.pets (owner_id);
create index if not exists appointments_tutor_starts_idx
  on public.appointments (tutor_id, starts_at desc);
create index if not exists appointments_veterinarian_starts_idx
  on public.appointments (veterinarian_id, starts_at);
create index if not exists appointments_organization_starts_idx
  on public.appointments (organization_id, starts_at);
create index if not exists availability_start_idx
  on public.professional_availability (starts_at)
  where (is_available);

create or replace function public.validate_availability_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.veterinarian_profiles professional
  where professional.organization_id = new.organization_id
    and professional.user_id = new.veterinarian_id
  for update;

  if new.is_available and exists (
    select 1
    from public.appointments appointment
    where appointment.veterinarian_id = new.veterinarian_id
      and appointment.status in ('pending', 'confirmed')
      and tstzrange(appointment.starts_at, appointment.ends_at, '[)')
        && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception 'Availability overlaps an active appointment'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists professional_availability_validate on public.professional_availability;
create trigger professional_availability_validate before insert or update of starts_at, ends_at, is_available
  on public.professional_availability
  for each row execute function public.validate_availability_change();

create or replace function public.validate_appointment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.veterinarian_profiles professional
  where professional.organization_id = new.organization_id
    and professional.user_id = new.veterinarian_id
  for update;

  if not exists (
    select 1
    from public.professional_availability availability
    where availability.id = new.availability_id
      and availability.organization_id = new.organization_id
      and availability.veterinarian_id = new.veterinarian_id
      and availability.starts_at = new.starts_at
      and availability.ends_at = new.ends_at
      and availability.is_available
      and availability.starts_at > now()
  ) then
    raise exception 'Availability is no longer open'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_validate_insert on public.appointments;
create trigger appointments_validate_insert before insert on public.appointments
  for each row execute function public.validate_appointment_insert();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists pets_set_updated_at on public.pets;
create trigger pets_set_updated_at before update on public.pets
  for each row execute function public.set_updated_at();

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();

create or replace function public.sync_appointment_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.professional_availability
    set is_available = false
    where id = new.availability_id;
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.professional_availability availability
    set is_available = not exists (
      select 1
      from public.appointments appointment
      where appointment.availability_id = new.availability_id
        and appointment.id <> new.id
        and appointment.status in ('pending', 'confirmed')
    )
    where availability.id = new.availability_id;
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_sync_availability on public.appointments;
create trigger appointments_sync_availability after insert or update of status on public.appointments
  for each row execute function public.sync_appointment_availability();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), ''), 120)
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.has_organization_role(
  target_organization uuid,
  allowed_roles public.organization_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization
      and membership.user_id = (select auth.uid())
      and membership.role = any (allowed_roles)
  );
$$;

create or replace function public.is_approved_veterinarian(
  target_organization uuid,
  target_user uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.veterinarian_profiles professional
    join public.organization_memberships membership
      on membership.organization_id = professional.organization_id
      and membership.user_id = professional.user_id
      and membership.role = 'veterinarian'
    where professional.organization_id = target_organization
      and professional.user_id = target_user
      and professional.status = 'approved'
  );
$$;

create or replace function public.owns_pet(target_pet uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pets pet
    where pet.id = target_pet
      and pet.owner_id = (select auth.uid())
  );
$$;

create or replace function public.can_access_pet_as_professional(target_pet uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.appointments appointment
    where appointment.pet_id = target_pet
      and appointment.veterinarian_id = (select auth.uid())
      and appointment.status in ('pending', 'confirmed', 'completed')
  );
$$;

create or replace function public.create_organization(organization_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if char_length(btrim(organization_name)) not between 2 and 120 then
    raise exception 'Organization name must have between 2 and 120 characters'
      using errcode = '22023';
  end if;

  insert into public.organizations (name, created_by)
  values (btrim(organization_name), auth.uid())
  returning id into new_organization_id;

  insert into public.organization_memberships (organization_id, user_id, role)
  values (new_organization_id, auth.uid(), 'owner');

  return new_organization_id;
end;
$$;

create or replace function public.add_veterinarian(
  target_organization uuid,
  target_user uuid,
  target_registration_number text,
  target_registration_region text,
  target_specialty text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

  insert into public.organization_memberships (organization_id, user_id, role)
  values (target_organization, target_user, 'veterinarian');

  insert into public.veterinarian_profiles (
    user_id,
    organization_id,
    registration_number,
    registration_region,
    specialty
  )
  values (
    target_user,
    target_organization,
    btrim(target_registration_number),
    target_registration_region,
    nullif(btrim(target_specialty), '')
  );
end;
$$;

create or replace function public.approve_veterinarian(
  target_organization uuid,
  target_user uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not public.has_organization_role(
       target_organization,
       array['owner', 'admin']::public.organization_role[]
     ) then
    raise exception 'Not authorized to approve a veterinarian'
      using errcode = '42501';
  end if;

  update public.veterinarian_profiles
  set status = 'approved'
  where organization_id = target_organization
    and user_id = target_user
    and status = 'pending';

  if not found then
    raise exception 'Pending veterinarian profile not found'
      using errcode = 'P0002';
  end if;
end;
$$;

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
    current_appointment.tutor_id = auth.uid()
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
       or current_appointment.starts_at <= now() then
      raise exception 'Appointment can no longer be cancelled'
        using errcode = '22023';
    end if;
  elsif next_status = 'confirmed' then
    if not is_assigned_veterinarian
       or current_appointment.status <> 'pending'
       or current_appointment.starts_at <= now() then
      raise exception 'Appointment cannot be confirmed'
        using errcode = '42501';
    end if;
  elsif next_status = 'completed' then
    if not is_assigned_veterinarian
       or current_appointment.status <> 'confirmed'
       or current_appointment.ends_at > now() then
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

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.veterinarian_profiles enable row level security;
alter table public.pets enable row level security;
alter table public.professional_availability enable row level security;
alter table public.appointments enable row level security;

grant usage on type public.organization_role to authenticated;
grant usage on type public.appointment_kind to authenticated;
grant usage on type public.appointment_status to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, phone) on public.profiles to authenticated;
grant select on public.organizations to authenticated;
grant select on public.organization_memberships to authenticated;
grant select on public.veterinarian_profiles to authenticated;
grant insert, update, delete on public.pets to authenticated;
grant select, insert, update, delete on public.professional_availability
  to authenticated;
grant select, insert on public.appointments to authenticated;
grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.add_veterinarian(
  uuid,
  uuid,
  text,
  text,
  text
) to authenticated;
grant execute on function public.approve_veterinarian(uuid, uuid)
  to authenticated;
grant execute on function public.transition_appointment(
  uuid,
  public.appointment_status
) to authenticated;

drop policy if exists "Profiles are visible to their owner" on public.profiles;
create policy "Profiles are visible to their owner" on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "Organization members can read their organizations" on public.organizations;
create policy "Organization members can read their organizations" on public.organizations for select to authenticated
  using (
    public.has_organization_role(
      id,
      array['owner', 'admin', 'veterinarian', 'staff', 'billing']
        ::public.organization_role[]
    )
  );

drop policy if exists "Members can read their own membership" on public.organization_memberships;
create policy "Members can read their own membership" on public.organization_memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_organization_role(
      organization_id,
      array['owner', 'admin']::public.organization_role[]
    )
  );

drop policy if exists "Members can read their veterinarian roster" on public.veterinarian_profiles;
create policy "Members can read their veterinarian roster" on public.veterinarian_profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_organization_role(
      organization_id,
      array['owner', 'admin', 'veterinarian', 'staff', 'billing']
        ::public.organization_role[]
    )
  );

drop policy if exists "Organization owners can register veterinarians" on public.veterinarian_profiles;
create policy "Organization owners can register veterinarians" on public.veterinarian_profiles for insert to authenticated
  with check (
    public.has_organization_role(
      organization_id,
      array['owner', 'admin']::public.organization_role[]
    )
    and exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id = organization_id
        and membership.user_id = user_id
        and membership.role = 'veterinarian'
    )
  );

drop policy if exists "Organization owners can update veterinarian approval" on public.veterinarian_profiles;
create policy "Organization owners can update veterinarian approval" on public.veterinarian_profiles for update to authenticated
  using (
    public.has_organization_role(
      organization_id,
      array['owner', 'admin']::public.organization_role[]
    )
  )
  with check (
    public.has_organization_role(
      organization_id,
      array['owner', 'admin']::public.organization_role[]
    )
  );

drop policy if exists "Pet owners can manage their pets" on public.pets;
create policy "Pet owners can manage their pets" on public.pets for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Assigned veterinarians can read patient pets" on public.pets;
create policy "Assigned veterinarians can read patient pets" on public.pets for select to authenticated
  using (public.can_access_pet_as_professional(id));

drop policy if exists "Authenticated users can view open availability" on public.professional_availability;
create policy "Authenticated users can view open availability" on public.professional_availability for select to authenticated
  using (
    (is_available and starts_at > now())
    or veterinarian_id = (select auth.uid())
    or public.has_organization_role(
      organization_id,
      array['owner', 'admin']::public.organization_role[]
    )
  );

drop policy if exists "Approved veterinarians manage their availability" on public.professional_availability;
create policy "Approved veterinarians manage their availability" on public.professional_availability for all to authenticated
  using (
    veterinarian_id = (select auth.uid())
    and public.is_approved_veterinarian(organization_id, (select auth.uid()))
  )
  with check (
    veterinarian_id = (select auth.uid())
    and public.is_approved_veterinarian(organization_id, (select auth.uid()))
    and (not is_available or starts_at > now())
  );

drop policy if exists "Owners and assigned care team can read appointments" on public.appointments;
create policy "Owners and assigned care team can read appointments" on public.appointments for select to authenticated
  using (
    tutor_id = (select auth.uid())
    or (
      veterinarian_id = (select auth.uid())
      and public.is_approved_veterinarian(
        organization_id,
        (select auth.uid())
      )
    )
    or public.has_organization_role(
      organization_id,
      array['owner', 'admin']::public.organization_role[]
    )
  );

drop policy if exists "Pet owners can request appointments in open slots" on public.appointments;
create policy "Pet owners can request appointments in open slots" on public.appointments for insert to authenticated
  with check (
    tutor_id = (select auth.uid())
    and public.owns_pet(pet_id)
    and status = 'pending'
    and exists (
      select 1
      from public.professional_availability availability
      where availability.id = availability_id
        and availability.organization_id = appointments.organization_id
        and availability.veterinarian_id = appointments.veterinarian_id
        and availability.starts_at = appointments.starts_at
        and availability.ends_at = appointments.ends_at
        and availability.is_available
        and availability.starts_at > now()
    )
    and public.is_approved_veterinarian(organization_id, veterinarian_id)
  );

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.sync_appointment_availability()
  from public, anon, authenticated;
revoke all on function public.validate_availability_change()
  from public, anon, authenticated;
revoke all on function public.validate_appointment_insert()
  from public, anon, authenticated;
revoke all on function public.has_organization_role(
  uuid,
  public.organization_role[]
) from public, anon;
revoke all on function public.is_approved_veterinarian(uuid, uuid)
  from public, anon;
revoke all on function public.owns_pet(uuid) from public, anon;
revoke all on function public.can_access_pet_as_professional(uuid)
  from public, anon;
revoke all on function public.create_organization(text) from public, anon;
revoke all on function public.add_veterinarian(
  uuid,
  uuid,
  text,
  text,
  text
) from public, anon;
revoke all on function public.approve_veterinarian(uuid, uuid)
  from public, anon;
revoke all on function public.transition_appointment(
  uuid,
  public.appointment_status
) from public, anon;
grant execute on function public.has_organization_role(
  uuid,
  public.organization_role[]
) to authenticated;
grant execute on function public.is_approved_veterinarian(uuid, uuid)
  to authenticated;
grant execute on function public.owns_pet(uuid) to authenticated;
grant execute on function public.can_access_pet_as_professional(uuid)
  to authenticated;

comment on schema public is
  'DrVet initial schema for identity, organizations, pets and appointments. Review before applying to any existing project.';

-- ----------------------------------------------------------------------------
-- MIGRATION 02/11: 20261112213000_clinical_records.sql
-- ----------------------------------------------------------------------------

-- Finalized SOAP records are immutable; edits remain drafts until finalized.
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'clinical_record_status'
  ) then
    create type public.clinical_record_status as enum ('draft', 'finalized');
  end if;
end
$$;

create table if not exists public.clinical_records (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique
    references public.appointments (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  pet_id uuid not null references public.pets (id) on delete restrict,
  veterinarian_id uuid not null references public.profiles (id) on delete restrict,
  subjective text not null default '' check (char_length(subjective) <= 10000),
  objective text not null default '' check (char_length(objective) <= 10000),
  assessment text not null default '' check (char_length(assessment) <= 10000),
  plan text not null default '' check (char_length(plan) <= 10000),
  vitals jsonb not null default '{}'::jsonb
    check (jsonb_typeof(vitals) = 'object'),
  status public.clinical_record_status not null default 'draft',
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'draft' and finalized_at is null)
    or (status = 'finalized' and finalized_at is not null)
  )
);

create index if not exists clinical_records_pet_created_idx
  on public.clinical_records (pet_id, created_at desc);
create index if not exists clinical_records_organization_created_idx
  on public.clinical_records (organization_id, created_at desc);

drop trigger if exists clinical_records_set_updated_at on public.clinical_records;
create trigger clinical_records_set_updated_at before update on public.clinical_records
  for each row execute function public.set_updated_at();

alter table public.clinical_records enable row level security;

revoke all on table public.clinical_records from anon, authenticated;
grant usage on type public.clinical_record_status to authenticated;
grant select on public.clinical_records to authenticated;

drop policy if exists "Care team and tutors can read authorized clinical records" on public.clinical_records;
create policy "Care team and tutors can read authorized clinical records" on public.clinical_records for select to authenticated
  using (
    (
      veterinarian_id = (select auth.uid())
      and public.is_approved_veterinarian(organization_id, (select auth.uid()))
    )
    or public.has_organization_role(
      organization_id,
      array['owner', 'admin']::public.organization_role[]
    )
    or (
      status = 'finalized'
      and exists (
        select 1
        from public.appointments appointment
        where appointment.id = clinical_records.appointment_id
          and appointment.tutor_id = (select auth.uid())
      )
    )
  );

create or replace function public.save_clinical_record(
  target_appointment uuid,
  target_subjective text,
  target_objective text,
  target_assessment text,
  target_plan text,
  target_vitals jsonb,
  target_status public.clinical_record_status
)
returns public.clinical_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_appointment public.appointments;
  saved_record public.clinical_records;
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
    raise exception 'Not authorized to save this clinical record'
      using errcode = '42501';
  end if;

  if char_length(coalesce(target_subjective, '')) > 10000
     or char_length(coalesce(target_objective, '')) > 10000
     or char_length(coalesce(target_assessment, '')) > 10000
     or char_length(coalesce(target_plan, '')) > 10000
     or target_vitals is null
     or jsonb_typeof(target_vitals) <> 'object' then
    raise exception 'Invalid clinical record data' using errcode = '22023';
  end if;

  if target_status = 'finalized'
     and (
       char_length(btrim(coalesce(target_subjective, ''))) = 0
       or char_length(btrim(coalesce(target_objective, ''))) = 0
       or char_length(btrim(coalesce(target_assessment, ''))) = 0
       or char_length(btrim(coalesce(target_plan, ''))) = 0
     ) then
    raise exception 'All SOAP sections are required to finalize'
      using errcode = '22023';
  end if;

  insert into public.clinical_records as current_record (
    appointment_id,
    organization_id,
    pet_id,
    veterinarian_id,
    subjective,
    objective,
    assessment,
    plan,
    vitals,
    status,
    finalized_at
  )
  values (
    current_appointment.id,
    current_appointment.organization_id,
    current_appointment.pet_id,
    current_appointment.veterinarian_id,
    coalesce(target_subjective, ''),
    coalesce(target_objective, ''),
    coalesce(target_assessment, ''),
    coalesce(target_plan, ''),
    target_vitals,
    target_status,
    case when target_status = 'finalized' then now() else null end
  )
  on conflict (appointment_id) do update
  set subjective = excluded.subjective,
      objective = excluded.objective,
      assessment = excluded.assessment,
      plan = excluded.plan,
      vitals = excluded.vitals,
      status = excluded.status,
      finalized_at = excluded.finalized_at
  where current_record.status = 'draft'
  returning current_record.* into saved_record;

  if not found then
    raise exception 'Finalized clinical records cannot be changed'
      using errcode = '55000';
  end if;

  return saved_record;
end;
$$;

revoke all on function public.save_clinical_record(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  public.clinical_record_status
) from public, anon;
grant execute on function public.save_clinical_record(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  public.clinical_record_status
) to authenticated;

-- ----------------------------------------------------------------------------
-- MIGRATION 03/11: 20261112214000_vaccination_records.sql
-- ----------------------------------------------------------------------------

create table if not exists public.vaccination_records (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null
    references public.appointments (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  pet_id uuid not null references public.pets (id) on delete restrict,
  veterinarian_id uuid not null references public.profiles (id) on delete restrict,
  vaccine_name text not null
    check (char_length(btrim(vaccine_name)) between 1 and 160),
  administered_on date not null,
  batch_number text check (batch_number is null or char_length(batch_number) <= 80),
  manufacturer text check (manufacturer is null or char_length(manufacturer) <= 120),
  next_due_on date,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  check (next_due_on is null or next_due_on >= administered_on)
);

create index if not exists vaccination_records_pet_administered_idx
  on public.vaccination_records (pet_id, administered_on desc);
create index if not exists vaccination_records_appointment_idx
  on public.vaccination_records (appointment_id);

alter table public.vaccination_records enable row level security;

revoke all on table public.vaccination_records from anon, authenticated;
grant select on public.vaccination_records to authenticated;

drop policy if exists "Tutors and treating veterinarians can read vaccination records" on public.vaccination_records;
create policy "Tutors and treating veterinarians can read vaccination records" on public.vaccination_records for select to authenticated
  using (
    exists (
      select 1
      from public.appointments appointment
      where appointment.id = vaccination_records.appointment_id
        and appointment.pet_id = vaccination_records.pet_id
        and (
          appointment.tutor_id = (select auth.uid())
          or (
            appointment.veterinarian_id = (select auth.uid())
            and public.is_approved_veterinarian(
              appointment.organization_id,
              (select auth.uid())
            )
          )
        )
    )
  );

create or replace function public.create_vaccination_record(
  target_appointment uuid,
  target_vaccine_name text,
  target_administered_on date,
  target_batch_number text default null,
  target_manufacturer text default null,
  target_next_due_on date default null,
  target_notes text default null
)
returns public.vaccination_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_appointment public.appointments;
  saved_record public.vaccination_records;
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
     or current_appointment.ends_at > now()
     or not public.is_approved_veterinarian(
       current_appointment.organization_id,
       auth.uid()
     ) then
    raise exception 'Only the assigned veterinarian can record vaccination'
      using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(target_vaccine_name, ''))) not between 1 and 160
     or target_administered_on is null
     or target_administered_on > current_date
     or char_length(coalesce(target_batch_number, '')) > 80
     or char_length(coalesce(target_manufacturer, '')) > 120
     or char_length(coalesce(target_notes, '')) > 2000
     or (
       target_next_due_on is not null
       and target_next_due_on < target_administered_on
     ) then
    raise exception 'Invalid vaccination record data' using errcode = '22023';
  end if;

  insert into public.vaccination_records (
    appointment_id,
    organization_id,
    pet_id,
    veterinarian_id,
    vaccine_name,
    administered_on,
    batch_number,
    manufacturer,
    next_due_on,
    notes
  )
  values (
    current_appointment.id,
    current_appointment.organization_id,
    current_appointment.pet_id,
    current_appointment.veterinarian_id,
    btrim(target_vaccine_name),
    target_administered_on,
    nullif(btrim(target_batch_number), ''),
    nullif(btrim(target_manufacturer), ''),
    target_next_due_on,
    nullif(btrim(target_notes), '')
  )
  returning * into saved_record;

  return saved_record;
end;
$$;

revoke all on function public.create_vaccination_record(
  uuid,
  text,
  date,
  text,
  text,
  date,
  text
) from public, anon;
grant execute on function public.create_vaccination_record(
  uuid,
  text,
  date,
  text,
  text,
  date,
  text
) to authenticated;

-- ----------------------------------------------------------------------------
-- MIGRATION 04/11: 20261112215000_exam_orders.sql
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'exam_modality'
  ) then
    create type public.exam_modality as enum ('laboratory', 'imaging');
  end if;
end
$$;
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'exam_order_status'
  ) then
    create type public.exam_order_status as enum ('requested', 'resulted');
  end if;
end
$$;

create table if not exists public.exam_orders (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null
    references public.appointments (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  pet_id uuid not null references public.pets (id) on delete restrict,
  veterinarian_id uuid not null references public.profiles (id) on delete restrict,
  modality public.exam_modality not null,
  exam_name text not null
    check (char_length(btrim(exam_name)) between 1 and 160),
  clinical_indication text not null
    check (char_length(btrim(clinical_indication)) between 1 and 2000),
  instructions text check (instructions is null or char_length(instructions) <= 2000),
  status public.exam_order_status not null default 'requested',
  result_summary text check (result_summary is null or char_length(result_summary) <= 10000),
  laboratory_name text check (laboratory_name is null or char_length(laboratory_name) <= 160),
  performed_at timestamptz,
  requested_at timestamptz not null default now(),
  resulted_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (status = 'requested' and result_summary is null and resulted_at is null)
    or (status = 'resulted' and result_summary is not null and resulted_at is not null)
  )
);

create index if not exists exam_orders_pet_requested_idx
  on public.exam_orders (pet_id, requested_at desc);
create index if not exists exam_orders_appointment_idx
  on public.exam_orders (appointment_id);

alter table public.exam_orders enable row level security;

revoke all on table public.exam_orders from anon, authenticated;
grant usage on type public.exam_modality to authenticated;
grant usage on type public.exam_order_status to authenticated;
grant select on public.exam_orders to authenticated;

drop policy if exists "Tutors, treating veterinarians and organization admins can read exam orders" on public.exam_orders;
create policy "Tutors, treating veterinarians and organization admins can read exam orders" on public.exam_orders for select to authenticated
  using (
    exists (
      select 1
      from public.appointments appointment
      where appointment.id = exam_orders.appointment_id
        and appointment.pet_id = exam_orders.pet_id
        and (
          appointment.tutor_id = (select auth.uid())
          or (
            appointment.veterinarian_id = (select auth.uid())
            and public.is_approved_veterinarian(
              appointment.organization_id,
              (select auth.uid())
            )
          )
          or public.has_organization_role(
            appointment.organization_id,
            array['owner', 'admin']::public.organization_role[]
          )
        )
    )
  );

create or replace function public.create_exam_order(
  target_appointment uuid,
  target_modality public.exam_modality,
  target_exam_name text,
  target_clinical_indication text,
  target_instructions text default null
)
returns public.exam_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_appointment public.appointments;
  saved_order public.exam_orders;
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
     or current_appointment.starts_at > now()
     or not public.is_approved_veterinarian(
       current_appointment.organization_id,
       auth.uid()
     ) then
    raise exception 'Only the assigned veterinarian can request an exam'
      using errcode = '42501';
  end if;

  if target_modality is null
     or char_length(btrim(coalesce(target_exam_name, ''))) not between 1 and 160
     or char_length(btrim(coalesce(target_clinical_indication, ''))) not between 1 and 2000
     or char_length(coalesce(target_instructions, '')) > 2000 then
    raise exception 'Invalid exam order data' using errcode = '22023';
  end if;

  insert into public.exam_orders (
    appointment_id,
    organization_id,
    pet_id,
    veterinarian_id,
    modality,
    exam_name,
    clinical_indication,
    instructions
  )
  values (
    current_appointment.id,
    current_appointment.organization_id,
    current_appointment.pet_id,
    current_appointment.veterinarian_id,
    target_modality,
    btrim(target_exam_name),
    btrim(target_clinical_indication),
    nullif(btrim(target_instructions), '')
  )
  returning * into saved_order;

  return saved_order;
end;
$$;

create or replace function public.record_exam_result(
  target_exam_order uuid,
  target_result_summary text,
  target_laboratory_name text default null,
  target_performed_at timestamptz default null
)
returns public.exam_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_order public.exam_orders;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select exam_order.*
  into current_order
  from public.exam_orders exam_order
  where exam_order.id = target_exam_order
  for update;

  if not found then
    raise exception 'Exam order not found' using errcode = 'P0002';
  end if;

  if current_order.veterinarian_id <> auth.uid()
     or not public.is_approved_veterinarian(
       current_order.organization_id,
       auth.uid()
     ) then
    raise exception 'Only the assigned veterinarian can record this result'
      using errcode = '42501';
  end if;

  if current_order.status <> 'requested' then
    raise exception 'Exam result is already recorded'
      using errcode = '55000';
  end if;

  if char_length(btrim(coalesce(target_result_summary, ''))) not between 1 and 10000
     or char_length(coalesce(target_laboratory_name, '')) > 160
     or (target_performed_at is not null and target_performed_at > now()) then
    raise exception 'Invalid exam result data' using errcode = '22023';
  end if;

  update public.exam_orders
  set status = 'resulted',
      result_summary = btrim(target_result_summary),
      laboratory_name = nullif(btrim(target_laboratory_name), ''),
      performed_at = target_performed_at,
      resulted_at = now()
  where id = target_exam_order
  returning * into current_order;

  return current_order;
end;
$$;

revoke all on function public.create_exam_order(
  uuid,
  public.exam_modality,
  text,
  text,
  text
) from public, anon;
grant execute on function public.create_exam_order(
  uuid,
  public.exam_modality,
  text,
  text,
  text
) to authenticated;

revoke all on function public.record_exam_result(
  uuid,
  text,
  text,
  timestamptz
) from public, anon;
grant execute on function public.record_exam_result(
  uuid,
  text,
  text,
  timestamptz
) to authenticated;

-- ----------------------------------------------------------------------------
-- MIGRATION 05/11: 20261112216000_availability_blocks.sql
-- ----------------------------------------------------------------------------

alter table public.professional_availability
  add column if not exists is_blocked boolean not null default false,
  add column if not exists blocked_at timestamptz,
  add column if not exists block_reason text;

do $
begin
  if not exists (
    select 1 from pg_constraint where conname = 'professional_availability_block_reason_check'
  ) then
    alter table public.professional_availability
      add constraint professional_availability_block_reason_check
      check (block_reason is null or char_length(block_reason) <= 300);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'professional_availability_block_state_check'
  ) then
    alter table public.professional_availability
      add constraint professional_availability_block_state_check
      check (
        not (is_available and is_blocked)
        and (
          (is_blocked and blocked_at is not null)
          or (not is_blocked and blocked_at is null and block_reason is null)
        )
      );
  end if;
end
$;

create or replace function public.validate_availability_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.veterinarian_profiles professional
  where professional.organization_id = new.organization_id
    and professional.user_id = new.veterinarian_id
  for update;

  if new.is_available and (
    new.is_blocked
    or exists (
      select 1
      from public.appointments appointment
      where appointment.veterinarian_id = new.veterinarian_id
        and appointment.status in ('pending', 'confirmed')
        and tstzrange(appointment.starts_at, appointment.ends_at, '[)')
          && tstzrange(new.starts_at, new.ends_at, '[)')
    )
  ) then
    raise exception 'Availability is blocked or overlaps an active appointment'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists professional_availability_validate
  on public.professional_availability;
drop trigger if exists professional_availability_validate on public.professional_availability;
create trigger professional_availability_validate before insert or update of starts_at, ends_at, is_available, is_blocked
  on public.professional_availability
  for each row execute function public.validate_availability_change();

create or replace function public.sync_appointment_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.professional_availability
    set is_available = false
    where id = new.availability_id;
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.professional_availability availability
    set is_available =
      not availability.is_blocked
      and not exists (
        select 1
        from public.appointments appointment
        where appointment.availability_id = new.availability_id
          and appointment.id <> new.id
          and appointment.status in ('pending', 'confirmed')
      )
    where availability.id = new.availability_id;
  end if;
  return new;
end;
$$;

create or replace function public.set_availability_block(
  target_availability uuid,
  should_block boolean,
  target_reason text default null
)
returns public.professional_availability
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_availability public.professional_availability;
  updated_availability public.professional_availability;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform 1
  from public.veterinarian_profiles professional
  where professional.user_id = auth.uid()
    and professional.status = 'approved'
    and professional.organization_id = (
      select availability.organization_id
      from public.professional_availability availability
      where availability.id = target_availability
    )
  for update;

  if not found then
    raise exception 'Approved veterinarian profile not found'
      using errcode = '42501';
  end if;

  select availability.*
  into current_availability
  from public.professional_availability availability
  where availability.id = target_availability
    and availability.veterinarian_id = auth.uid()
  for update;

  if not found then
    raise exception 'Availability not found' using errcode = 'P0002';
  end if;

  if current_availability.starts_at <= now() then
    raise exception 'Past or started availability cannot be changed'
      using errcode = '22023';
  end if;

  if char_length(coalesce(target_reason, '')) > 300 then
    raise exception 'Block reason is too long' using errcode = '22023';
  end if;

  if should_block and exists (
    select 1
    from public.appointments appointment
    where appointment.availability_id = target_availability
      and appointment.status in ('pending', 'confirmed')
  ) then
    raise exception 'Availability has an active appointment'
      using errcode = '23P01';
  end if;

  update public.professional_availability availability
  set is_blocked = should_block,
      blocked_at = case when should_block then now() else null end,
      block_reason = case
        when should_block then nullif(btrim(target_reason), '')
        else null
      end,
      is_available = not should_block and not exists (
        select 1
        from public.appointments appointment
        where appointment.availability_id = target_availability
          and appointment.status in ('pending', 'confirmed')
      )
  where availability.id = target_availability
  returning availability.* into updated_availability;

  return updated_availability;
end;
$$;

revoke all on function public.set_availability_block(uuid, boolean, text)
  from public, anon;
grant execute on function public.set_availability_block(uuid, boolean, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- MIGRATION 06/11: 20261112217000_prescription_drafts.sql
-- ----------------------------------------------------------------------------

create table if not exists public.prescription_drafts (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique
    references public.appointments (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  pet_id uuid not null references public.pets (id) on delete restrict,
  veterinarian_id uuid not null references public.profiles (id) on delete restrict,
  items jsonb not null
    check (
      case
        when jsonb_typeof(items) = 'array'
          then jsonb_array_length(items) between 1 and 30
        else false
      end
    ),
  updated_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prescription_drafts_veterinarian_updated_idx
  on public.prescription_drafts (veterinarian_id, updated_at desc);

alter table public.prescription_drafts enable row level security;

revoke all on table public.prescription_drafts from anon, authenticated;
grant select on public.prescription_drafts to authenticated;

drop policy if exists "Assigned veterinarians can read their prescription drafts" on public.prescription_drafts;
create policy "Assigned veterinarians can read their prescription drafts" on public.prescription_drafts for select to authenticated
  using (
    veterinarian_id = (select auth.uid())
    and public.is_approved_veterinarian(
      organization_id,
      (select auth.uid())
    )
  );

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
    updated_by
  )
  values (
    current_appointment.id,
    current_appointment.organization_id,
    current_appointment.pet_id,
    current_appointment.veterinarian_id,
    target_items,
    auth.uid()
  )
  on conflict (appointment_id) do update
  set items = excluded.items,
      updated_by = excluded.updated_by,
      updated_at = now()
  where public.prescription_drafts.veterinarian_id = auth.uid()
  returning * into saved_draft;

  if not found then
    raise exception 'Prescription draft is not owned by this veterinarian'
      using errcode = '42501';
  end if;

  return saved_draft;
end;
$$;

revoke all on function public.save_prescription_draft(uuid, jsonb)
  from public, anon;
grant execute on function public.save_prescription_draft(uuid, jsonb)
  to authenticated;

-- ----------------------------------------------------------------------------
-- MIGRATION 07/11: 20261113000100_profiles_roles_and_updated_at.sql
-- ----------------------------------------------------------------------------

-- Fase 1: Perfis com role/email, updated_at em todas as tabelas e auditoria de RLS (incluindo perfil admin).

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'user_role'
  ) then
    create type public.user_role as enum ('tutor', 'veterinarian', 'partner', 'admin');
  end if;
end
$$;

alter table public.profiles
  add column if not exists email text check (email is null or char_length(email) <= 320),
  add column if not exists role public.user_role not null default 'tutor';

create index if not exists profiles_role_idx on public.profiles (role);

-- Atualiza trigger de criação automática de perfil quando um usuário se registra no Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email, role)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), ''), 120),
    new.email,
    'tutor'
  )
  on conflict (id) do update
  set email = coalesce(excluded.email, public.profiles.email),
      display_name = case
        when public.profiles.display_name = '' then excluded.display_name
        else public.profiles.display_name
      end;
  return new;
end;
$$;

-- Helper seguro para verificar se o usuário autenticado possui perfil global 'admin'.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Atualiza add_veterinarian para também promover o perfil de tutor para veterinarian ao vinculá-lo a uma clínica.
create or replace function public.add_veterinarian(
  target_organization uuid,
  target_user uuid,
  target_registration_number text,
  target_registration_region text,
  target_specialty text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or (
       not public.is_admin()
       and not public.has_organization_role(
         target_organization,
         array['owner', 'admin']::public.organization_role[]
       )
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

  insert into public.organization_memberships (organization_id, user_id, role)
  values (target_organization, target_user, 'veterinarian')
  on conflict (organization_id, user_id) do update
  set role = 'veterinarian';

  insert into public.veterinarian_profiles (
    user_id,
    organization_id,
    registration_number,
    registration_region,
    specialty
  )
  values (
    target_user,
    target_organization,
    btrim(target_registration_number),
    target_registration_region,
    nullif(btrim(target_specialty), '')
  );

  update public.profiles
  set role = 'veterinarian'
  where id = target_user
    and role = 'tutor';
end;
$$;

-- Garante colunas updated_at e triggers em todas as tabelas que ainda não possuíam.
alter table public.organizations
  add column if not exists updated_at timestamptz not null default now();

alter table public.organization_memberships
  add column if not exists updated_at timestamptz not null default now();

alter table public.veterinarian_profiles
  add column if not exists updated_at timestamptz not null default now();

alter table public.professional_availability
  add column if not exists updated_at timestamptz not null default now();

alter table public.vaccination_records
  add column if not exists updated_at timestamptz not null default now();

alter table public.exam_orders
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

drop trigger if exists organization_memberships_set_updated_at on public.organization_memberships;
create trigger organization_memberships_set_updated_at
  before update on public.organization_memberships
  for each row execute function public.set_updated_at();

drop trigger if exists veterinarian_profiles_set_updated_at on public.veterinarian_profiles;
create trigger veterinarian_profiles_set_updated_at
  before update on public.veterinarian_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists professional_availability_set_updated_at on public.professional_availability;
create trigger professional_availability_set_updated_at
  before update on public.professional_availability
  for each row execute function public.set_updated_at();

drop trigger if exists vaccination_records_set_updated_at on public.vaccination_records;
create trigger vaccination_records_set_updated_at
  before update on public.vaccination_records
  for each row execute function public.set_updated_at();

drop trigger if exists exam_orders_set_updated_at on public.exam_orders;
create trigger exam_orders_set_updated_at
  before update on public.exam_orders
  for each row execute function public.set_updated_at();

drop trigger if exists prescription_drafts_set_updated_at on public.prescription_drafts;
create trigger prescription_drafts_set_updated_at
  before update on public.prescription_drafts
  for each row execute function public.set_updated_at();

-- Corrige bug de qualificação na policy de inserção de veterinarian_profiles.
drop policy if exists "Organization owners can register veterinarians" on public.veterinarian_profiles;

-- Policy: apenas donos/admins da mesma organização (ou admin global) podem cadastrar veterinários que já possuam vínculo 'veterinarian' naquela organização.
drop policy if exists "Organization owners can register veterinarians" on public.veterinarian_profiles;
create policy "Organization owners can register veterinarians" on public.veterinarian_profiles for insert to authenticated
  with check (
    public.is_admin()
    or (
      public.has_organization_role(
        veterinarian_profiles.organization_id,
        array['owner', 'admin']::public.organization_role[]
      )
      and exists (
        select 1
        from public.organization_memberships membership
        where membership.organization_id = veterinarian_profiles.organization_id
          and membership.user_id = veterinarian_profiles.user_id
          and membership.role = 'veterinarian'
      )
    )
  );

-- Policies adicionais para suporte a leitura de nomes na equipe/agendamento e acesso total do perfil admin.

-- Policy: administradores globais podem consultar todos os perfis de usuário.
drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles" on public.profiles for select to authenticated
  using (public.is_admin());

-- Policy: membros de uma organização e usuários autenticados visualizando veterinários aprovados podem ler o nome de exibição do profissional.
drop policy if exists "Authenticated users can read approved veterinarian profiles summary" on public.profiles;
create policy "Authenticated users can read approved veterinarian profiles summary" on public.profiles for select to authenticated
  using (
    exists (
      select 1
      from public.veterinarian_profiles vp
      where vp.user_id = profiles.id
        and (
          vp.status = 'approved'
          or public.has_organization_role(
            vp.organization_id,
            array['owner', 'admin', 'veterinarian', 'staff', 'billing']::public.organization_role[]
          )
        )
    )
  );

-- Policy: usuários autenticados podem consultar dados públicos de credenciamento de veterinários aprovados durante o agendamento.
drop policy if exists "Authenticated users can read approved veterinarians" on public.veterinarian_profiles;
create policy "Authenticated users can read approved veterinarians" on public.veterinarian_profiles for select to authenticated
  using (status = 'approved');

-- Policy: administradores globais podem gerenciar organizações.
drop policy if exists "Admins can manage all organizations" on public.organizations;
create policy "Admins can manage all organizations" on public.organizations for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Policy: administradores globais podem consultar e gerenciar vínculos organizacionais.
drop policy if exists "Admins can manage all memberships" on public.organization_memberships;
create policy "Admins can manage all memberships" on public.organization_memberships for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Policy: administradores globais podem gerenciar todos os perfis de veterinários.
drop policy if exists "Admins can manage all veterinarian profiles" on public.veterinarian_profiles;
create policy "Admins can manage all veterinarian profiles" on public.veterinarian_profiles for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Policy: administradores globais podem consultar e gerenciar todos os pets.
drop policy if exists "Admins can manage all pets" on public.pets;
create policy "Admins can manage all pets" on public.pets for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Policy: administradores globais podem consultar e gerenciar toda a disponibilidade publicada.
drop policy if exists "Admins can manage all availability" on public.professional_availability;
create policy "Admins can manage all availability" on public.professional_availability for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Policy: administradores globais podem consultar todos os agendamentos.
drop policy if exists "Admins can read all appointments" on public.appointments;
create policy "Admins can read all appointments" on public.appointments for select to authenticated
  using (public.is_admin());

-- Policy: administradores globais podem consultar todos os prontuários clínicos.
drop policy if exists "Admins can read all clinical records" on public.clinical_records;
create policy "Admins can read all clinical records" on public.clinical_records for select to authenticated
  using (public.is_admin());

-- Policy: administradores globais podem consultar todos os registros de vacinação.
drop policy if exists "Admins can read all vaccination records" on public.vaccination_records;
create policy "Admins can read all vaccination records" on public.vaccination_records for select to authenticated
  using (public.is_admin());

-- Policy: administradores globais podem consultar todos os pedidos e resultados de exames.
drop policy if exists "Admins can read all exam orders" on public.exam_orders;
create policy "Admins can read all exam orders" on public.exam_orders for select to authenticated
  using (public.is_admin());

-- Policy: administradores globais podem consultar rascunhos de receita.
drop policy if exists "Admins can read all prescription drafts" on public.prescription_drafts;
create policy "Admins can read all prescription drafts" on public.prescription_drafts for select to authenticated
  using (public.is_admin());

grant usage on type public.user_role to authenticated;

-- ----------------------------------------------------------------------------
-- MIGRATION 08/11: 20261113000200_commissions_and_payouts.sql
-- ----------------------------------------------------------------------------

-- Fase 1: Tabelas financeiras para /comissoes (extrato de comissões, contas de repasse e solicitações de antecipação).

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'commission_origin'
  ) then
    create type public.commission_origin as enum (
  'teleconsultation',
  'in_person',
  'pharmacy_split',
  'partner_plan'
);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'commission_status'
  ) then
    create type public.commission_status as enum (
  'available',
  'pending',
  'paid'
);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'anticipation_status'
  ) then
    create type public.anticipation_status as enum (
  'requested',
  'approved',
  'paid',
  'rejected'
);
  end if;
end
$$;

create table if not exists public.payout_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  veterinarian_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null default 'asaas' check (provider in ('asaas', 'mercadopago')),
  provider_connected boolean not null default false,
  payout_account_label text not null check (char_length(btrim(payout_account_label)) between 2 and 160),
  pix_key_masked text check (pix_key_masked is null or char_length(pix_key_masked) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, veterinarian_id)
);

create table if not exists public.commission_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  veterinarian_id uuid not null references public.profiles (id) on delete restrict,
  appointment_id uuid references public.appointments (id) on delete set null,
  reference text not null unique check (char_length(btrim(reference)) between 3 and 80),
  tutor_name text not null check (char_length(btrim(tutor_name)) between 1 and 120),
  pet_name text not null check (char_length(btrim(pet_name)) between 1 and 100),
  origin public.commission_origin not null,
  gross_amount_cents integer not null check (gross_amount_cents >= 0),
  net_amount_cents integer not null check (net_amount_cents >= 0 and net_amount_cents <= gross_amount_cents),
  status public.commission_status not null default 'pending',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.anticipation_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  veterinarian_id uuid not null references public.profiles (id) on delete restrict,
  protocol text not null unique check (char_length(btrim(protocol)) between 6 and 60),
  requested_cents integer not null check (requested_cents > 0),
  notes text check (notes is null or char_length(notes) <= 500),
  status public.anticipation_status not null default 'requested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payout_accounts_vet_idx
  on public.payout_accounts (veterinarian_id);
create index if not exists commission_ledger_vet_occurred_idx
  on public.commission_ledger (veterinarian_id, occurred_at desc);
create index if not exists commission_ledger_org_status_idx
  on public.commission_ledger (organization_id, status, origin);
create index if not exists anticipation_requests_vet_created_idx
  on public.anticipation_requests (veterinarian_id, created_at desc);

drop trigger if exists payout_accounts_set_updated_at on public.payout_accounts;
create trigger payout_accounts_set_updated_at before update on public.payout_accounts
  for each row execute function public.set_updated_at();

drop trigger if exists commission_ledger_set_updated_at on public.commission_ledger;
create trigger commission_ledger_set_updated_at before update on public.commission_ledger
  for each row execute function public.set_updated_at();

drop trigger if exists anticipation_requests_set_updated_at on public.anticipation_requests;
create trigger anticipation_requests_set_updated_at before update on public.anticipation_requests
  for each row execute function public.set_updated_at();

alter table public.payout_accounts enable row level security;
alter table public.commission_ledger enable row level security;
alter table public.anticipation_requests enable row level security;

revoke all on table public.payout_accounts from anon, authenticated;
revoke all on table public.commission_ledger from anon, authenticated;
revoke all on table public.anticipation_requests from anon, authenticated;

grant usage on type public.commission_origin to authenticated;
grant usage on type public.commission_status to authenticated;
grant usage on type public.anticipation_status to authenticated;
grant select on public.payout_accounts to authenticated;
grant select on public.commission_ledger to authenticated;
grant select on public.anticipation_requests to authenticated;

-- Policy: o veterinário titular, gestores/billing da clínica e administradores globais podem consultar dados de conta de repasse.
drop policy if exists "Veterinarians, org billing and admins can read payout accounts" on public.payout_accounts;
create policy "Veterinarians, org billing and admins can read payout accounts" on public.payout_accounts for select to authenticated
  using (
    veterinarian_id = (select auth.uid())
    or public.has_organization_role(
      organization_id,
      array['owner', 'admin', 'billing']::public.organization_role[]
    )
    or public.is_admin()
  );

-- Policy: apenas o titular da conta ou administradores podem cadastrar/alterar sua conta de repasse (não altera saldo).
drop policy if exists "Veterinarians and admins can manage own payout account" on public.payout_accounts;
create policy "Veterinarians and admins can manage own payout account" on public.payout_accounts for all to authenticated
  using (veterinarian_id = (select auth.uid()) or public.is_admin())
  with check (veterinarian_id = (select auth.uid()) or public.is_admin());

-- Policy: apenas o veterinário titular, perfis de gestão/billing da organização e administradores podem visualizar lançamentos no extrato (imutáveis pelo cliente).
drop policy if exists "Veterinarians, org billing and admins can read commission ledger" on public.commission_ledger;
create policy "Veterinarians, org billing and admins can read commission ledger" on public.commission_ledger for select to authenticated
  using (
    veterinarian_id = (select auth.uid())
    or public.has_organization_role(
      organization_id,
      array['owner', 'admin', 'billing']::public.organization_role[]
    )
    or public.is_admin()
  );

-- Policy: apenas administradores globais podem inserir/atualizar lançamentos diretos no ledger (webhooks usam service_role no servidor).
drop policy if exists "Admins can manage commission ledger" on public.commission_ledger;
create policy "Admins can manage commission ledger" on public.commission_ledger for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Policy: o veterinário solicitante, gestores da organização e administradores podem consultar pedidos de antecipação.
drop policy if exists "Veterinarians, org admins and global admins can read anticipation requests" on public.anticipation_requests;
create policy "Veterinarians, org admins and global admins can read anticipation requests" on public.anticipation_requests for select to authenticated
  using (
    veterinarian_id = (select auth.uid())
    or public.has_organization_role(
      organization_id,
      array['owner', 'admin', 'billing']::public.organization_role[]
    )
    or public.is_admin()
  );

-- Policy: administradores globais podem gerenciar o ciclo de antecipações.
drop policy if exists "Admins can manage anticipation requests" on public.anticipation_requests;
create policy "Admins can manage anticipation requests" on public.anticipation_requests for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- RPC transacional para solicitar antecipação garantindo no servidor que o valor não ultrapassa o saldo disponível.
create or replace function public.request_commission_anticipation(
  target_amount_cents integer,
  target_notes text default null
)
returns public.anticipation_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_org_id uuid;
  available_total integer;
  reserved_total integer;
  remaining_available integer;
  generated_protocol text;
  created_request public.anticipation_requests;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if target_amount_cents is null or target_amount_cents <= 0 then
    raise exception 'Valor de antecipação deve ser maior que zero'
      using errcode = '22023';
  end if;

  if char_length(coalesce(target_notes, '')) > 500 then
    raise exception 'Observação excede o limite de 500 caracteres'
      using errcode = '22023';
  end if;

  select membership.organization_id
  into target_org_id
  from public.organization_memberships membership
  where membership.user_id = caller_id
  order by membership.created_at asc
  limit 1;

  if target_org_id is null then
    raise exception 'Nenhuma organização vinculada ao profissional'
      using errcode = '42501';
  end if;

  select coalesce(sum(entry.net_amount_cents), 0)
  into available_total
  from public.commission_ledger entry
  where entry.veterinarian_id = caller_id
    and entry.status = 'available';

  select coalesce(sum(req.requested_cents), 0)
  into reserved_total
  from public.anticipation_requests req
  where req.veterinarian_id = caller_id
    and req.status in ('requested', 'approved');

  remaining_available := greatest(0, available_total - reserved_total);

  if target_amount_cents > remaining_available then
    raise exception 'Valor solicitado excede o saldo disponível para antecipação'
      using errcode = '22023';
  end if;

  generated_protocol := 'ANT-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.anticipation_requests (
    organization_id,
    veterinarian_id,
    protocol,
    requested_cents,
    notes,
    status
  )
  values (
    target_org_id,
    caller_id,
    generated_protocol,
    target_amount_cents,
    nullif(btrim(target_notes), ''),
    'requested'
  )
  returning * into created_request;

  return created_request;
end;
$$;

revoke all on function public.request_commission_anticipation(integer, text)
  from public, anon;
grant execute on function public.request_commission_anticipation(integer, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- MIGRATION 09/11: 20261113000300_storage_buckets_and_policies.sql
-- ----------------------------------------------------------------------------

-- Fase 3: Buckets de Storage e políticas de acesso para laudos de exames, anexos clínicos e avatares de pets.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'exam-reports',
    'exam-reports',
    false,
    10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'clinical-attachments',
    'clinical-attachments',
    false,
    10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'pet-avatars',
    'pet-avatars',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Convenção de caminho nos buckets privados:
--   pet-avatars:          <owner_id>/<pet_id>/<arquivo>
--   exam-reports:         <pet_id>/<exam_order_id>/<arquivo>
--   clinical-attachments: <pet_id>/<appointment_id>/<arquivo>

-- Policy: tutores donos do pet, veterinários que atendem o pet e administradores globais podem visualizar arquivos clínicos, laudos e avatares autorizados.
drop policy if exists "Authorized users can read DrVet storage objects" on storage.objects;
create policy "Authorized users can read DrVet storage objects" on storage.objects for select to authenticated
  using (
    bucket_id in ('pet-avatars', 'exam-reports', 'clinical-attachments')
    and (
      public.is_admin()
      or (
        bucket_id = 'pet-avatars'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      )
      or (
        bucket_id in ('exam-reports', 'clinical-attachments')
        and (
          exists (
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
    )
  );

-- Policy: tutores podem enviar avatares de seus pets; veterinários aprovados (e tutores em exames) podem enviar arquivos nos respectivos atendimentos/pets.
drop policy if exists "Authorized users can upload DrVet storage objects" on storage.objects;
create policy "Authorized users can upload DrVet storage objects" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('pet-avatars', 'exam-reports', 'clinical-attachments')
    and (
      public.is_admin()
      or (
        bucket_id = 'pet-avatars'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      )
      or (
        bucket_id = 'exam-reports'
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
      or (
        bucket_id = 'clinical-attachments'
        and exists (
          select 1
          from public.pets p
          where p.id::text = (storage.foldername(name))[1]
            and public.can_access_pet_as_professional(p.id)
        )
      )
    )
  );

-- Policy: apenas quem enviou o arquivo (owner), o tutor dono do avatar ou o administrador global pode remover objetos do Storage.
drop policy if exists "Owners and admins can delete DrVet storage objects" on storage.objects;
create policy "Owners and admins can delete DrVet storage objects" on storage.objects for delete to authenticated
  using (
    bucket_id in ('pet-avatars', 'exam-reports', 'clinical-attachments')
    and (
      public.is_admin()
      or owner = (select auth.uid())
      or (
        bucket_id = 'pet-avatars'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      )
    )
  );

-- ----------------------------------------------------------------------------
-- MIGRATION 10/11: 20261113000400_teleconsulta_subscriptions_partners.sql
-- ----------------------------------------------------------------------------

-- Fase 4 (Expansão Stitch): Teleconsulta, Clube DrVet (Assinaturas & Pagamentos), Portal B2B de Parceiros e DrVet Ads.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'teleconsultation_status') then
    create type public.teleconsultation_status as enum ('waiting', 'in_progress', 'ended');
  end if;
  if not exists (select 1 from pg_type where typname = 'subscription_interval') then
    create type public.subscription_interval as enum ('monthly', 'annual');
  end if;
  if not exists (select 1 from pg_type where typname = 'pet_subscription_status') then
    create type public.pet_subscription_status as enum ('active', 'paused', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_kind') then
    create type public.payment_kind as enum ('teleconsultation', 'subscription', 'pharmacy');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum ('pix', 'credit_card', 'voucher');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_order_status') then
    create type public.payment_order_status as enum ('pending', 'paid', 'refunded', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'partner_kind') then
    create type public.partner_kind as enum ('pet_shop', 'pharmacy');
  end if;
  if not exists (select 1 from pg_type where typname = 'ad_placement') then
    create type public.ad_placement as enum ('home_banner', 'booking_sidebar', 'partner_coupon');
  end if;
  if not exists (select 1 from pg_type where typname = 'ad_campaign_status') then
    create type public.ad_campaign_status as enum ('draft', 'active', 'paused', 'ended');
  end if;
end
$$;

-- ============================================================================
-- 1. SALA DE TELECONSULTA
-- ============================================================================

create table if not exists public.teleconsultation_sessions (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  veterinarian_id uuid not null references public.profiles(id) on delete cascade,
  room_code text not null unique,
  status public.teleconsultation_status not null default 'waiting',
  recording_consent boolean not null default false,
  started_at timestamptz,
  ended_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teleconsultation_notes_len check (notes is null or char_length(notes) <= 2000)
);

create index if not exists idx_teleconsultation_sessions_tutor
  on public.teleconsultation_sessions(tutor_id, created_at desc);

create index if not exists idx_teleconsultation_sessions_vet
  on public.teleconsultation_sessions(veterinarian_id, status, created_at desc);

drop trigger if exists set_teleconsultation_sessions_updated_at on public.teleconsultation_sessions;
create trigger set_teleconsultation_sessions_updated_at
  before update on public.teleconsultation_sessions
  for each row execute function public.set_updated_at();

alter table public.teleconsultation_sessions enable row level security;

-- Policy: tutor participante, veterinário designado, membro da clínica e admin podem visualizar a sessão de teleconsulta.
drop policy if exists "Participants and org members can view teleconsultation sessions" on public.teleconsultation_sessions;
create policy "Participants and org members can view teleconsultation sessions" on public.teleconsultation_sessions for select to authenticated
  using (
    public.is_admin()
    or tutor_id = (select auth.uid())
    or veterinarian_id = (select auth.uid())
    or exists (
      select 1 from public.organization_memberships m
      where m.organization_id = teleconsultation_sessions.organization_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'admin')
    )
  );

-- Policy: apenas o veterinário designado (ou admin) pode atualizar estado, consentimento de gravação e anotações da sala.
drop policy if exists "Assigned veterinarian or admin can update teleconsultation session" on public.teleconsultation_sessions;
create policy "Assigned veterinarian or admin can update teleconsultation session" on public.teleconsultation_sessions for update to authenticated
  using (public.is_admin() or veterinarian_id = (select auth.uid()))
  with check (public.is_admin() or veterinarian_id = (select auth.uid()));

create table if not exists public.teleconsultation_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.teleconsultation_sessions(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_name text not null,
  message text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teleconsultation_message_nonempty check (char_length(btrim(message)) between 1 and 2000)
);

create index if not exists idx_teleconsultation_messages_session
  on public.teleconsultation_messages(session_id, created_at asc);

drop trigger if exists set_teleconsultation_messages_updated_at on public.teleconsultation_messages;
create trigger set_teleconsultation_messages_updated_at
  before update on public.teleconsultation_messages
  for each row execute function public.set_updated_at();

alter table public.teleconsultation_messages enable row level security;

-- Policy: somente participantes da sessão (tutor, veterinário) e admin podem ler mensagens da sala.
drop policy if exists "Session participants can view teleconsultation messages" on public.teleconsultation_messages;
create policy "Session participants can view teleconsultation messages" on public.teleconsultation_messages for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.teleconsultation_sessions s
      where s.id = teleconsultation_messages.session_id
        and (s.tutor_id = (select auth.uid()) or s.veterinarian_id = (select auth.uid()))
    )
  );

-- Policy: somente o tutor ou o veterinário da sessão podem enviar mensagens identificadas pelo próprio user_id.
drop policy if exists "Session participants can send teleconsultation messages" on public.teleconsultation_messages;
create policy "Session participants can send teleconsultation messages" on public.teleconsultation_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.teleconsultation_sessions s
      where s.id = teleconsultation_messages.session_id
        and (s.tutor_id = (select auth.uid()) or s.veterinarian_id = (select auth.uid()))
    )
  );

-- RPC transacional para abrir ou recuperar a sala de teleconsulta de um atendimento autorizado.
create or replace function public.open_teleconsultation_session(target_appointment uuid)
returns public.teleconsultation_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  apt public.appointments;
  existing_session public.teleconsultation_sessions;
  generated_code text;
begin
  if actor_id is null then
    raise exception 'Autenticação necessária.';
  end if;

  select * into apt
  from public.appointments
  where id = target_appointment;

  if not found then
    raise exception 'Atendimento não encontrado.';
  end if;

  if apt.kind <> 'teleconsultation' then
    raise exception 'Este atendimento é presencial e não utiliza sala de vídeo.';
  end if;

  if apt.status not in ('confirmed', 'completed') then
    raise exception 'A sala só fica disponível após confirmação da consulta.';
  end if;

  if not (public.is_admin() or apt.tutor_id = actor_id or apt.veterinarian_id = actor_id) then
    raise exception 'Você não tem permissão para acessar esta sala.';
  end if;

  select * into existing_session
  from public.teleconsultation_sessions
  where appointment_id = target_appointment;

  if found then
    return existing_session;
  end if;

  generated_code := 'DRVET-' || upper(substr(replace(target_appointment::text, '-', ''), 1, 8));

  insert into public.teleconsultation_sessions (
    appointment_id,
    organization_id,
    pet_id,
    tutor_id,
    veterinarian_id,
    room_code,
    status
  )
  values (
    apt.id,
    apt.organization_id,
    apt.pet_id,
    apt.tutor_id,
    apt.veterinarian_id,
    generated_code,
    case when apt.status = 'completed' then 'ended'::public.teleconsultation_status else 'waiting'::public.teleconsultation_status end
  )
  returning * into existing_session;

  return existing_session;
end;
$$;

grant execute on function public.open_teleconsultation_session(uuid) to authenticated;

-- ============================================================================
-- 2. CLUBE DRVET (ASSINATURAS PREVENTIVAS) & PAGAMENTOS
-- ============================================================================

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  price_cents integer not null,
  interval public.subscription_interval not null default 'monthly',
  discount_percent integer not null default 15,
  benefits jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plan_price_check check (price_cents > 0),
  constraint subscription_plan_discount_check check (discount_percent between 0 and 100)
);

drop trigger if exists set_subscription_plans_updated_at on public.subscription_plans;
create trigger set_subscription_plans_updated_at
  before update on public.subscription_plans
  for each row execute function public.set_updated_at();

alter table public.subscription_plans enable row level security;

-- Policy: qualquer usuário autenticado pode visualizar planos ativos do Clube DrVet; admins gerenciam todos os planos.
drop policy if exists "Authenticated users can view active subscription plans" on public.subscription_plans;
create policy "Authenticated users can view active subscription plans" on public.subscription_plans for select to authenticated
  using (active = true or public.is_admin());

-- Policy: apenas administradores globais podem criar, editar ou desativar planos do Clube DrVet.
drop policy if exists "Admins manage subscription plans" on public.subscription_plans;
create policy "Admins manage subscription plans" on public.subscription_plans for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create table if not exists public.pet_subscriptions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  pet_id uuid not null references public.pets(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  status public.pet_subscription_status not null default 'active',
  discount_percent integer not null default 15,
  started_at timestamptz not null default now(),
  next_billing_at timestamptz not null default (now() + interval '1 month'),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pet_subscriptions_owner
  on public.pet_subscriptions(owner_id, status, created_at desc);

create index if not exists idx_pet_subscriptions_pet
  on public.pet_subscriptions(pet_id);

drop trigger if exists set_pet_subscriptions_updated_at on public.pet_subscriptions;
create trigger set_pet_subscriptions_updated_at
  before update on public.pet_subscriptions
  for each row execute function public.set_updated_at();

alter table public.pet_subscriptions enable row level security;

-- Policy: tutores visualizam e atualizam (pausar/cancelar) apenas assinaturas dos próprios pets; admin visualiza tudo.
drop policy if exists "Owners and admins can view pet subscriptions" on public.pet_subscriptions;
create policy "Owners and admins can view pet subscriptions" on public.pet_subscriptions for select to authenticated
  using (public.is_admin() or owner_id = (select auth.uid()));

drop policy if exists "Owners and admins can update pet subscriptions" on public.pet_subscriptions;
create policy "Owners and admins can update pet subscriptions" on public.pet_subscriptions for update to authenticated
  using (public.is_admin() or owner_id = (select auth.uid()))
  with check (public.is_admin() or owner_id = (select auth.uid()));

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  subscription_id uuid references public.pet_subscriptions(id) on delete set null,
  kind public.payment_kind not null,
  description text not null,
  amount_cents integer not null,
  discount_cents integer not null default 0,
  net_amount_cents integer not null,
  method public.payment_method not null default 'pix',
  status public.payment_order_status not null default 'pending',
  external_reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_amounts_check check (amount_cents >= 0 and discount_cents >= 0 and net_amount_cents >= 0)
);

create index if not exists idx_payment_orders_user
  on public.payment_orders(user_id, created_at desc);

create index if not exists idx_payment_orders_org
  on public.payment_orders(organization_id, created_at desc);

drop trigger if exists set_payment_orders_updated_at on public.payment_orders;
create trigger set_payment_orders_updated_at
  before update on public.payment_orders
  for each row execute function public.set_updated_at();

alter table public.payment_orders enable row level security;

-- Policy: cada usuário visualiza apenas os próprios comprovantes/pedidos de pagamento; org owners/admins e admin global podem auditar.
drop policy if exists "Users and authorized admins can view payment orders" on public.payment_orders;
create policy "Users and authorized admins can view payment orders" on public.payment_orders for select to authenticated
  using (
    public.is_admin()
    or user_id = (select auth.uid())
    or (
      organization_id is not null
      and exists (
        select 1 from public.organization_memberships m
        where m.organization_id = payment_orders.organization_id
          and m.user_id = (select auth.uid())
          and m.role in ('owner', 'admin', 'billing')
      )
    )
  );

-- RPC transacional para assinar um pet em um plano ativo do Clube DrVet e registrar o pedido de pagamento.
create or replace function public.subscribe_pet_to_plan(
  target_plan uuid,
  target_pet uuid,
  target_method public.payment_method default 'pix'
)
returns public.pet_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  plan_row public.subscription_plans;
  pet_row public.pets;
  created_sub public.pet_subscriptions;
  next_cycle timestamptz;
begin
  if actor_id is null then
    raise exception 'Autenticação necessária.';
  end if;

  select * into plan_row
  from public.subscription_plans
  where id = target_plan and active = true;

  if not found then
    raise exception 'Plano não encontrado ou indisponível.';
  end if;

  select * into pet_row
  from public.pets
  where id = target_pet;

  if not found or pet_row.owner_id <> actor_id then
    raise exception 'Selecione um pet pertencente à sua conta.';
  end if;

  if exists (
    select 1 from public.pet_subscriptions
    where pet_id = target_pet and status = 'active'
  ) then
    raise exception 'Este pet já possui uma assinatura ativa no Clube DrVet.';
  end if;

  next_cycle := case
    when plan_row.interval = 'annual' then now() + interval '1 year'
    else now() + interval '1 month'
  end;

  insert into public.pet_subscriptions (
    plan_id,
    pet_id,
    owner_id,
    status,
    discount_percent,
    next_billing_at
  )
  values (
    plan_row.id,
    pet_row.id,
    actor_id,
    'active',
    plan_row.discount_percent,
    next_cycle
  )
  returning * into created_sub;

  insert into public.payment_orders (
    user_id,
    subscription_id,
    kind,
    description,
    amount_cents,
    discount_cents,
    net_amount_cents,
    method,
    status,
    external_reference,
    paid_at
  )
  values (
    actor_id,
    created_sub.id,
    'subscription',
    plan_row.name || ' — ' || pet_row.name,
    plan_row.price_cents,
    0,
    plan_row.price_cents,
    target_method,
    'paid',
    'SUB-' || upper(substr(replace(created_sub.id::text, '-', ''), 1, 8)),
    now()
  );

  return created_sub;
end;
$$;

grant execute on function public.subscribe_pet_to_plan(uuid, uuid, public.payment_method) to authenticated;

-- ============================================================================
-- 3. PORTAL B2B DE PARCEIROS & DRVET ADS
-- ============================================================================

create table if not exists public.partner_listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind public.partner_kind not null,
  trade_name text not null,
  city text not null,
  state text not null,
  coupon_code text not null,
  discount_percent integer not null default 15,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_state_uf check (state ~ '^[A-Z]{2}$'),
  constraint partner_discount_range check (discount_percent between 0 and 80)
);

create index if not exists idx_partner_listings_active
  on public.partner_listings(active, kind, city);

drop trigger if exists set_partner_listings_updated_at on public.partner_listings;
create trigger set_partner_listings_updated_at
  before update on public.partner_listings
  for each row execute function public.set_updated_at();

alter table public.partner_listings enable row level security;

-- Policy: usuários autenticados visualizam parceiros ativos e cupons; membros da organização e admin gerenciam os cadastros da própria organização.
drop policy if exists "Authenticated users can view active partner listings" on public.partner_listings;
create policy "Authenticated users can view active partner listings" on public.partner_listings for select to authenticated
  using (
    active = true
    or public.is_admin()
    or exists (
      select 1 from public.organization_memberships m
      where m.organization_id = partner_listings.organization_id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "Org owners and admins manage partner listings" on public.partner_listings;
create policy "Org owners and admins manage partner listings" on public.partner_listings for all to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.organization_memberships m
      where m.organization_id = partner_listings.organization_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.organization_memberships m
      where m.organization_id = partner_listings.organization_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'admin')
    )
  );

create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  placement public.ad_placement not null default 'booking_sidebar',
  budget_cents integer not null,
  status public.ad_campaign_status not null default 'draft',
  starts_on date not null default current_date,
  ends_on date,
  clicks_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_campaign_budget_check check (budget_cents > 0),
  constraint ad_campaign_clicks_check check (clicks_count >= 0)
);

create index if not exists idx_ad_campaigns_org
  on public.ad_campaigns(organization_id, status, created_at desc);

drop trigger if exists set_ad_campaigns_updated_at on public.ad_campaigns;
create trigger set_ad_campaigns_updated_at
  before update on public.ad_campaigns
  for each row execute function public.set_updated_at();

alter table public.ad_campaigns enable row level security;

-- Policy: membros da organização e administradores gerenciam as campanhas DrVet Ads da própria empresa.
drop policy if exists "Org members and admins view ad campaigns" on public.ad_campaigns;
create policy "Org members and admins view ad campaigns" on public.ad_campaigns for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.organization_memberships m
      where m.organization_id = ad_campaigns.organization_id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "Org owners and admins manage ad campaigns" on public.ad_campaigns;
create policy "Org owners and admins manage ad campaigns" on public.ad_campaigns for all to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.organization_memberships m
      where m.organization_id = ad_campaigns.organization_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.organization_memberships m
      where m.organization_id = ad_campaigns.organization_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'admin')
    )
  );

-- ----------------------------------------------------------------------------
-- MIGRATION 11/11: 20261113000500_admin_integrations_and_checkout.sql
-- ----------------------------------------------------------------------------

-- Fase 5 (Expansão Stitch): Painel Master Admin, RBAC, Integrações (Asaas/Mercado Pago/LiveKit/ERP) e Checkout de Teleconsulta.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'integration_provider') then
    create type public.integration_provider as enum ('asaas', 'mercado_pago', 'livekit', 'bling', 'omie');
  end if;
  if not exists (select 1 from pg_type where typname = 'integration_environment') then
    create type public.integration_environment as enum ('sandbox', 'production');
  end if;
end
$$;

create table if not exists public.integration_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  provider public.integration_provider not null,
  environment public.integration_environment not null default 'sandbox',
  webhook_endpoint text not null,
  active boolean not null default false,
  last_status text not null default 'pending_test',
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_webhook_len check (char_length(webhook_endpoint) between 1 and 500)
);

create unique index if not exists idx_integration_configs_scope_provider
  on public.integration_configs (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), provider);

drop trigger if exists set_integration_configs_updated_at on public.integration_configs;
create trigger set_integration_configs_updated_at
  before update on public.integration_configs
  for each row execute function public.set_updated_at();

alter table public.integration_configs enable row level security;

-- Policy: apenas administradores globais ou owners/admins da própria organização visualizam metadados de integrações (sem segredos).
drop policy if exists "Admins and org owners view integration configs" on public.integration_configs;
create policy "Admins and org owners view integration configs" on public.integration_configs for select to authenticated
  using (
    public.is_admin()
    or (
      organization_id is not null
      and exists (
        select 1 from public.organization_memberships m
        where m.organization_id = integration_configs.organization_id
          and m.user_id = (select auth.uid())
          and m.role in ('owner', 'admin')
      )
    )
  );

-- Policy: apenas administradores globais ou owners/admins da própria organização gerenciam integrações.
drop policy if exists "Admins and org owners manage integration configs" on public.integration_configs;
create policy "Admins and org owners manage integration configs" on public.integration_configs for all to authenticated
  using (
    public.is_admin()
    or (
      organization_id is not null
      and exists (
        select 1 from public.organization_memberships m
        where m.organization_id = integration_configs.organization_id
          and m.user_id = (select auth.uid())
          and m.role in ('owner', 'admin')
      )
    )
  )
  with check (
    public.is_admin()
    or (
      organization_id is not null
      and exists (
        select 1 from public.organization_memberships m
        where m.organization_id = integration_configs.organization_id
          and m.user_id = (select auth.uid())
          and m.role in ('owner', 'admin')
      )
    )
  );

-- RPC para painel Master Admin listar usuários e papéis RBAC.
create or replace function public.admin_list_users()
returns setof public.profiles
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito ao administrador global.';
  end if;

  return query
  select *
  from public.profiles
  order by created_at desc
  limit 200;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;

-- RPC para painel Master Admin atualizar o papel RBAC de um usuário com proteção contra autorrebaixamento.
create or replace function public.admin_update_user_role(
  target_user uuid,
  next_role public.user_role
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito ao administrador global.';
  end if;

  if target_user = auth.uid() and next_role <> 'admin' then
    raise exception 'Não é permitido remover seu próprio acesso de administrador.';
  end if;

  update public.profiles
  set role = next_role
  where id = target_user
  returning * into updated_profile;

  if not found then
    raise exception 'Usuário não encontrado.';
  end if;

  return updated_profile;
end;
$$;

grant execute on function public.admin_update_user_role(uuid, public.user_role) to authenticated;

-- RPC transacional para calcular desconto (cupom parceiro ou Clube DrVet) e registrar pagamento de teleconsulta.
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
  actor_id uuid := auth.uid();
  apt public.appointments;
  pet_row public.pets;
  base_amount integer := 18000;
  discount_pct integer := 0;
  club_pct integer := 0;
  coupon_pct integer := 0;
  discount_val integer := 0;
  net_val integer := 18000;
  created_order public.payment_orders;
begin
  if actor_id is null then
    raise exception 'Autenticação necessária.';
  end if;

  select * into apt
  from public.appointments
  where id = target_appointment;

  if not found or (apt.tutor_id <> actor_id and not public.is_admin()) then
    raise exception 'Consulta não encontrada ou sem permissão de pagamento.';
  end if;

  if apt.status = 'cancelled' then
    raise exception 'Não é possível pagar uma consulta cancelada.';
  end if;

  if exists (
    select 1 from public.payment_orders
    where appointment_id = target_appointment
      and status = 'paid'
  ) then
    raise exception 'Esta consulta já possui pagamento confirmado.';
  end if;

  select * into pet_row from public.pets where id = apt.pet_id;

  select coalesce(max(discount_percent), 0) into club_pct
  from public.pet_subscriptions
  where pet_id = apt.pet_id
    and status = 'active';

  if target_coupon is not null and btrim(target_coupon) <> '' then
    select coalesce(max(discount_percent), 0) into coupon_pct
    from public.partner_listings
    where upper(coupon_code) = upper(btrim(target_coupon))
      and active = true;

    if coupon_pct = 0 then
      raise exception 'Cupom informado não encontrado ou inativo.';
    end if;
  end if;

  discount_pct := greatest(club_pct, coupon_pct);
  discount_val := round((base_amount * discount_pct)::numeric / 100.0)::integer;
  net_val := greatest(0, base_amount - discount_val);

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
    paid_at
  )
  values (
    apt.tutor_id,
    apt.organization_id,
    apt.id,
    case when apt.kind = 'teleconsultation' then 'teleconsultation'::public.payment_kind else 'pharmacy'::public.payment_kind end,
    'Atendimento Veterinário — ' || coalesce(pet_row.name, 'Pet'),
    base_amount,
    discount_val,
    net_val,
    target_method,
    'paid',
    'PAY-' || upper(substr(replace(apt.id::text, '-', ''), 1, 8)),
    now()
  )
  returning * into created_order;

  return created_order;
end;
$$;

grant execute on function public.create_teleconsultation_payment(uuid, public.payment_method, text) to authenticated;

-- ----------------------------------------------------------------------------
-- MIGRATION 12/12: 20261113000600_push_notifications.sql
-- ----------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  user_agent text,
  role_hint public.user_role not null default 'tutor',
  reminder_lead_minutes integer not null default 30 check (reminder_lead_minutes in (15, 30, 60, 120, 1440)),
  notify_appointments boolean not null default true,
  notify_queue boolean not null default true,
  is_active boolean not null default true,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user
  on public.push_subscriptions (user_id, is_active);

drop trigger if exists push_subscriptions_updated_at on public.push_subscriptions;
create trigger push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own_or_admin" on public.push_subscriptions;
create policy "push_subscriptions_select_own_or_admin"
  on public.push_subscriptions for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own"
  on public.push_subscriptions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  kind text not null check (
    kind in (
      'appointment_reminder',
      'appointment_confirmed',
      'appointment_cancelled',
      'vet_queue_new',
      'system_test'
    )
  ),
  title text not null,
  body text not null,
  action_url text not null default '/agendamento',
  dedupe_key text,
  read_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_recipient_created
  on public.notifications (recipient_id, created_at desc);

create unique index if not exists idx_notifications_dedupe
  on public.notifications (recipient_id, dedupe_key)
  where dedupe_key is not null;

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (auth.uid() = recipient_id);

drop policy if exists "notifications_insert_own_test" on public.notifications;
create policy "notifications_insert_own_test"
  on public.notifications for insert
  to authenticated
  with check (auth.uid() = recipient_id and kind = 'system_test');

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

create or replace function public.notify_on_appointment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pet_name_text text;
  formatted_when text;
  kind_label text;
begin
  select p.name into pet_name_text
  from public.pets p
  where p.id = new.pet_id;

  pet_name_text := coalesce(pet_name_text, 'Paciente');
  formatted_when := to_char(new.starts_at at time zone 'America/Sao_Paulo', 'DD/MM às HH24:MI');
  kind_label := case when new.kind = 'teleconsultation' then 'Teleconsulta' else 'Presencial' end;

  if tg_op = 'INSERT' then
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
      new.veterinarian_id,
      new.id,
      'vet_queue_new',
      'Nova solicitação na fila: ' || pet_name_text,
      kind_label || ' solicitada para ' || formatted_when || '. Confirme na sua fila clínica.',
      '/painel/veterinario',
      'queue-' || new.id::text
    )
    on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;

    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    if new.status = 'confirmed' then
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
        new.tutor_id,
        new.id,
        'appointment_confirmed',
        'Consulta confirmada para ' || pet_name_text,
        kind_label || ' confirmada para ' || formatted_when || '.',
        '/agendamento',
        'confirmed-' || new.id::text
      )
      on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
    elsif new.status = 'cancelled' then
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
        new.tutor_id,
        new.id,
        'appointment_cancelled',
        'Consulta cancelada: ' || pet_name_text,
        'O atendimento de ' || formatted_when || ' foi cancelado.',
        '/agendamento',
        'cancelled-tutor-' || new.id::text
      )
      on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;

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
        new.veterinarian_id,
        new.id,
        'appointment_cancelled',
        'Agendamento cancelado na fila: ' || pet_name_text,
        'O horário de ' || formatted_when || ' foi liberado.',
        '/agenda',
        'cancelled-vet-' || new.id::text
      )
      on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_push_notifications on public.appointments;
create trigger appointments_push_notifications
  after insert or update on public.appointments
  for each row execute function public.notify_on_appointment_change();

create or replace function public.enqueue_appointment_reminders()
returns setof public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  lead_minutes integer := 30;
  apt record;
  formatted_when text;
  inserted_row public.notifications;
begin
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select coalesce(max(ps.reminder_lead_minutes), 30)
  into lead_minutes
  from public.push_subscriptions ps
  where ps.user_id = caller_id
    and ps.is_active = true
    and ps.notify_appointments = true;

  for apt in
    select
      a.id,
      a.tutor_id,
      a.kind,
      a.starts_at,
      coalesce(p.name, 'seu pet') as pet_name
    from public.appointments a
    left join public.pets p on p.id = a.pet_id
    where a.tutor_id = caller_id
      and a.status in ('confirmed', 'pending')
      and a.starts_at > now() - interval '5 minutes'
      and a.starts_at <= now() + make_interval(mins => lead_minutes)
  loop
    formatted_when := to_char(apt.starts_at at time zone 'America/Sao_Paulo', 'DD/MM às HH24:MI');

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
      caller_id,
      apt.id,
      'appointment_reminder',
      'Lembrete de consulta: ' || apt.pet_name,
      case when apt.kind = 'teleconsultation' then 'Teleconsulta' else 'Consulta presencial' end
        || ' marcada para ' || formatted_when || '.',
      case when apt.kind = 'teleconsultation' then '/teleconsulta' else '/agendamento' end,
      'reminder-' || apt.id::text || '-' || lead_minutes::text
    )
    on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing
    returning * into inserted_row;

    if inserted_row.id is not null then
      return next inserted_row;
    end if;
  end loop;

  return;
end;
$$;

grant execute on function public.enqueue_appointment_reminders() to authenticated;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  updated_count integer := 0;
begin
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  update public.notifications
  set read_at = now()
  where recipient_id = caller_id
    and read_at is null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

grant execute on function public.mark_all_notifications_read() to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'appointments'
  ) then
    alter publication supabase_realtime add table public.appointments;
  end if;
end $$;

-- Recarrega schema cache do PostgREST após aplicar as 12 migrations
notify pgrst, 'reload schema';