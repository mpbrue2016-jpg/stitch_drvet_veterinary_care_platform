-- Finalized SOAP records are immutable; edits remain drafts until finalized.
create type public.clinical_record_status as enum ('draft', 'finalized');

create table public.clinical_records (
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

create index clinical_records_pet_created_idx
  on public.clinical_records (pet_id, created_at desc);
create index clinical_records_organization_created_idx
  on public.clinical_records (organization_id, created_at desc);

create trigger clinical_records_set_updated_at
  before update on public.clinical_records
  for each row execute function public.set_updated_at();

alter table public.clinical_records enable row level security;

revoke all on table public.clinical_records from anon, authenticated;
grant usage on type public.clinical_record_status to authenticated;
grant select on public.clinical_records to authenticated;

create policy "Care team and tutors can read authorized clinical records"
  on public.clinical_records for select to authenticated
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

create function public.save_clinical_record(
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
