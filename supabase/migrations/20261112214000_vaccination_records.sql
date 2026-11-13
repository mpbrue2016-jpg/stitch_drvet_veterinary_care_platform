create table public.vaccination_records (
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

create index vaccination_records_pet_administered_idx
  on public.vaccination_records (pet_id, administered_on desc);
create index vaccination_records_appointment_idx
  on public.vaccination_records (appointment_id);

alter table public.vaccination_records enable row level security;

revoke all on table public.vaccination_records from anon, authenticated;
grant select on public.vaccination_records to authenticated;

create policy "Tutors and treating veterinarians can read vaccination records"
  on public.vaccination_records for select to authenticated
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

create function public.create_vaccination_record(
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
