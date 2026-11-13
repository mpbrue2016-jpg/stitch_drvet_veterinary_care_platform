alter table public.professional_availability
  add column is_blocked boolean not null default false,
  add column blocked_at timestamptz,
  add column block_reason text
    check (block_reason is null or char_length(block_reason) <= 300),
  add constraint professional_availability_block_state_check
    check (
      not (is_available and is_blocked)
      and (
        (is_blocked and blocked_at is not null)
        or (not is_blocked and blocked_at is null and block_reason is null)
      )
    );

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

drop trigger professional_availability_validate
  on public.professional_availability;
create trigger professional_availability_validate
  before insert or update of starts_at, ends_at, is_available, is_blocked
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

create function public.set_availability_block(
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
