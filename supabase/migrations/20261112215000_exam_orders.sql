create type public.exam_modality as enum ('laboratory', 'imaging');
create type public.exam_order_status as enum ('requested', 'resulted');

create table public.exam_orders (
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

create index exam_orders_pet_requested_idx
  on public.exam_orders (pet_id, requested_at desc);
create index exam_orders_appointment_idx
  on public.exam_orders (appointment_id);

alter table public.exam_orders enable row level security;

revoke all on table public.exam_orders from anon, authenticated;
grant usage on type public.exam_modality to authenticated;
grant usage on type public.exam_order_status to authenticated;
grant select on public.exam_orders to authenticated;

create policy "Tutors, treating veterinarians and organization admins can read exam orders"
  on public.exam_orders for select to authenticated
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

create function public.create_exam_order(
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

create function public.record_exam_result(
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
