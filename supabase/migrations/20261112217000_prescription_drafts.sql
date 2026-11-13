create table public.prescription_drafts (
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

create index prescription_drafts_veterinarian_updated_idx
  on public.prescription_drafts (veterinarian_id, updated_at desc);

alter table public.prescription_drafts enable row level security;

revoke all on table public.prescription_drafts from anon, authenticated;
grant select on public.prescription_drafts to authenticated;

create policy "Assigned veterinarians can read their prescription drafts"
  on public.prescription_drafts for select to authenticated
  using (
    veterinarian_id = (select auth.uid())
    and public.is_approved_veterinarian(
      organization_id,
      (select auth.uid())
    )
  );

create function public.save_prescription_draft(
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
