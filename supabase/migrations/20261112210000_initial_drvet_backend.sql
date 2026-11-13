create schema if not exists extensions;

set search_path = public, extensions;

create extension if not exists btree_gist with schema extensions;

create type public.organization_role as enum (
  'owner',
  'admin',
  'veterinarian',
  'staff',
  'billing'
);

create type public.professional_status as enum (
  'pending',
  'approved',
  'suspended'
);

create type public.appointment_kind as enum (
  'teleconsultation',
  'in_person'
);

create type public.appointment_status as enum (
  'pending',
  'confirmed',
  'cancelled',
  'completed'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 120),
  phone text check (phone is null or char_length(phone) <= 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.organization_memberships (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.organization_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.veterinarian_profiles (
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

create table public.pets (
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

create table public.professional_availability (
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

create table public.appointments (
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

create index pets_owner_id_idx on public.pets (owner_id);
create index appointments_tutor_starts_idx
  on public.appointments (tutor_id, starts_at desc);
create index appointments_veterinarian_starts_idx
  on public.appointments (veterinarian_id, starts_at);
create index appointments_organization_starts_idx
  on public.appointments (organization_id, starts_at);
create index availability_start_idx
  on public.professional_availability (starts_at)
  where (is_available);

create function public.validate_availability_change()
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

create trigger professional_availability_validate
  before insert or update of starts_at, ends_at, is_available
  on public.professional_availability
  for each row execute function public.validate_availability_change();

create function public.validate_appointment_insert()
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

create trigger appointments_validate_insert
  before insert on public.appointments
  for each row execute function public.validate_appointment_insert();

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger pets_set_updated_at
  before update on public.pets
  for each row execute function public.set_updated_at();

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

create function public.sync_appointment_availability()
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

create trigger appointments_sync_availability
  after insert or update of status on public.appointments
  for each row execute function public.sync_appointment_availability();

create function public.handle_new_user()
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.has_organization_role(
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

create function public.is_approved_veterinarian(
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

create function public.owns_pet(target_pet uuid)
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

create function public.can_access_pet_as_professional(target_pet uuid)
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

create function public.create_organization(organization_name text)
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

create function public.add_veterinarian(
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

create function public.approve_veterinarian(
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

create function public.transition_appointment(
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

create policy "Profiles are visible to their owner"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Organization members can read their organizations"
  on public.organizations for select to authenticated
  using (
    public.has_organization_role(
      id,
      array['owner', 'admin', 'veterinarian', 'staff', 'billing']
        ::public.organization_role[]
    )
  );

create policy "Members can read their own membership"
  on public.organization_memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_organization_role(
      organization_id,
      array['owner', 'admin']::public.organization_role[]
    )
  );

create policy "Members can read their veterinarian roster"
  on public.veterinarian_profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_organization_role(
      organization_id,
      array['owner', 'admin', 'veterinarian', 'staff', 'billing']
        ::public.organization_role[]
    )
  );

create policy "Organization owners can register veterinarians"
  on public.veterinarian_profiles for insert to authenticated
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

create policy "Organization owners can update veterinarian approval"
  on public.veterinarian_profiles for update to authenticated
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

create policy "Pet owners can manage their pets"
  on public.pets for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Assigned veterinarians can read patient pets"
  on public.pets for select to authenticated
  using (public.can_access_pet_as_professional(id));

create policy "Authenticated users can view open availability"
  on public.professional_availability for select to authenticated
  using (
    (is_available and starts_at > now())
    or veterinarian_id = (select auth.uid())
    or public.has_organization_role(
      organization_id,
      array['owner', 'admin']::public.organization_role[]
    )
  );

create policy "Approved veterinarians manage their availability"
  on public.professional_availability for all to authenticated
  using (
    veterinarian_id = (select auth.uid())
    and public.is_approved_veterinarian(organization_id, (select auth.uid()))
  )
  with check (
    veterinarian_id = (select auth.uid())
    and public.is_approved_veterinarian(organization_id, (select auth.uid()))
    and (not is_available or starts_at > now())
  );

create policy "Owners and assigned care team can read appointments"
  on public.appointments for select to authenticated
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

create policy "Pet owners can request appointments in open slots"
  on public.appointments for insert to authenticated
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
