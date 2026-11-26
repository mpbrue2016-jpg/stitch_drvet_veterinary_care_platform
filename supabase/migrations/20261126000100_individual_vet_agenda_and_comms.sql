-- Fase 11: Agenda Individual por Veterinário & Comunicados Individuais de Agenda.

-- 1. Ampliar os tipos de notificação para suportar lembretes e comunicados individuais da agenda do veterinário.
do $$
declare
  constraint_name_row record;
begin
  for constraint_name_row in
    select conname
    from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format(
      'alter table public.notifications drop constraint if exists %I',
      constraint_name_row.conname
    );
  end loop;
end $$;

alter table public.notifications
  add constraint notifications_kind_check check (
    kind in (
      'appointment_reminder',
      'appointment_confirmed',
      'appointment_cancelled',
      'vet_queue_new',
      'vet_agenda_reminder',
      'vet_agenda_summary',
      'system_test'
    )
  );

create index if not exists idx_availability_vet_starts_at
  on public.professional_availability (veterinarian_id, starts_at);

create index if not exists idx_appointments_vet_starts_at
  on public.appointments (veterinarian_id, starts_at);

-- 2. Trigger de movimentações de agendamento: comunica estritamente o veterinário dono da agenda e o tutor.
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
      'Nova reserva na sua agenda: ' || pet_name_text,
      kind_label || ' solicitada na sua agenda individual para ' || formatted_when || '.',
      '/agenda',
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
        'vet_agenda_summary',
        'Agenda confirmada: ' || pet_name_text,
        kind_label || ' confirmada na sua agenda individual para ' || formatted_when || '.',
        '/agenda',
        'vet-confirmed-' || new.id::text
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
        'Horário liberado na sua agenda: ' || pet_name_text,
        'O atendimento de ' || formatted_when || ' foi cancelado e a janela retornou para sua agenda individual.',
        '/agenda',
        'cancelled-vet-' || new.id::text
      )
      on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end if;

  return new;
end;
$$;

-- 3. Lembretes individuais de consulta para tutor E para o veterinário dono da agenda.
create or replace function public.enqueue_appointment_reminders()
returns setof public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  tutor_lead_minutes integer := 30;
  vet_lead_minutes integer := 30;
  has_vet_opt_out boolean := false;
  apt record;
  formatted_when text;
  inserted_row public.notifications;
begin
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select coalesce(max(ps.reminder_lead_minutes), 30)
  into tutor_lead_minutes
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
      and a.starts_at <= now() + make_interval(mins => tutor_lead_minutes)
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
      'reminder-' || apt.id::text || '-' || tutor_lead_minutes::text
    )
    on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing
    returning * into inserted_row;

    if inserted_row.id is not null then
      return next inserted_row;
    end if;
  end loop;

  select
    coalesce(max(ps.reminder_lead_minutes), 30),
    exists (
      select 1
      from public.push_subscriptions ps2
      where ps2.user_id = caller_id
        and ps2.is_active = true
    ) and not exists (
      select 1
      from public.push_subscriptions ps3
      where ps3.user_id = caller_id
        and ps3.is_active = true
        and ps3.notify_queue = true
    )
  into vet_lead_minutes, has_vet_opt_out
  from public.push_subscriptions ps
  where ps.user_id = caller_id
    and ps.is_active = true
    and ps.notify_queue = true;

  if not has_vet_opt_out then
    for apt in
      select
        a.id,
        a.veterinarian_id,
        a.kind,
        a.status,
        a.starts_at,
        coalesce(p.name, 'Paciente') as pet_name
      from public.appointments a
      left join public.pets p on p.id = a.pet_id
      where a.veterinarian_id = caller_id
        and a.status in ('confirmed', 'pending')
        and a.starts_at > now() - interval '5 minutes'
        and a.starts_at <= now() + make_interval(mins => vet_lead_minutes)
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
        'vet_agenda_reminder',
        'Sua agenda individual: ' || apt.pet_name || ' às ' || to_char(apt.starts_at at time zone 'America/Sao_Paulo', 'HH24:MI'),
        case when apt.kind = 'teleconsultation' then 'Teleconsulta' else 'Atendimento presencial' end
          || ' (' || case when apt.status = 'confirmed' then 'confirmado' else 'aguardando confirmação' end || ')'
          || ' agendado na sua agenda individual para ' || formatted_when || '.',
        case when apt.kind = 'teleconsultation' then '/teleconsulta?appointmentId=' || apt.id::text else '/agenda' end,
        'vet-reminder-' || apt.id::text || '-' || vet_lead_minutes::text
      )
      on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing
      returning * into inserted_row;

      if inserted_row.id is not null then
        return next inserted_row;
      end if;
    end loop;
  end if;

  return;
end;
$$;

-- 4. Comunicado individual consolidado da agenda do veterinário (estritamente veterinarian_id = auth.uid()).
create or replace function public.enqueue_vet_agenda_summary(force_new boolean default false)
returns setof public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  is_vet boolean := false;
  vet_name text := 'Veterinário(a)';
  confirmed_count integer := 0;
  pending_count integer := 0;
  open_slots_count integer := 0;
  next_pet_name text;
  next_starts_at timestamptz;
  next_when text;
  summary_title text;
  summary_body text;
  computed_dedupe_key text;
  inserted_row public.notifications;
begin
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select
    exists (
      select 1
      from public.veterinarian_profiles vp
      where vp.user_id = caller_id
    )
    or exists (
      select 1
      from public.profiles pr
      where pr.id = caller_id
        and pr.role = 'veterinarian'
    )
  into is_vet;

  if not is_vet then
    raise exception 'Only registered veterinarians can generate an individual agenda briefing.'
      using errcode = '42501';
  end if;

  select coalesce(nullif(trim(pr.display_name), ''), 'Veterinário(a)')
  into vet_name
  from public.profiles pr
  where pr.id = caller_id;

  select
    count(*) filter (where a.status = 'confirmed')::integer,
    count(*) filter (where a.status = 'pending')::integer
  into confirmed_count, pending_count
  from public.appointments a
  where a.veterinarian_id = caller_id
    and a.status in ('confirmed', 'pending')
    and a.starts_at >= now()
    and a.starts_at <= now() + interval '7 days';

  select count(*)::integer
  into open_slots_count
  from public.professional_availability s
  where s.veterinarian_id = caller_id
    and s.is_available = true
    and s.is_blocked = false
    and s.starts_at > now()
    and s.starts_at <= now() + interval '7 days';

  select
    coalesce(p.name, 'Paciente'),
    a.starts_at
  into next_pet_name, next_starts_at
  from public.appointments a
  left join public.pets p on p.id = a.pet_id
  where a.veterinarian_id = caller_id
    and a.status in ('confirmed', 'pending')
    and a.ends_at >= now()
  order by a.starts_at asc
  limit 1;

  summary_title := 'Comunicado da Agenda Individual · ' || vet_name;

  if next_starts_at is not null then
    next_when := to_char(next_starts_at at time zone 'America/Sao_Paulo', 'DD/MM às HH24:MI');
    summary_body := format(
      'Próximos 7 dias da sua agenda: %s confirmada(s), %s pendente(s) e %s horário(s) aberto(s). Próximo atendimento: %s em %s.',
      confirmed_count,
      pending_count,
      open_slots_count,
      next_pet_name,
      next_when
    );
  else
    summary_body := format(
      'Próximos 7 dias da sua agenda: %s confirmada(s), %s pendente(s) e %s horário(s) aberto(s) para novos agendamentos.',
      confirmed_count,
      pending_count,
      open_slots_count
    );
  end if;

  computed_dedupe_key := case
    when force_new then 'vet-summary-manual-' || caller_id::text || '-' || extract(epoch from clock_timestamp())::bigint::text
    else 'vet-summary-' || caller_id::text || '-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD-HH24')
  end;

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
    null,
    'vet_agenda_summary',
    summary_title,
    summary_body,
    '/agenda',
    computed_dedupe_key
  )
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing
  returning * into inserted_row;

  if inserted_row.id is not null then
    return next inserted_row;
  end if;

  return;
end;
$$;

revoke all on function public.enqueue_vet_agenda_summary(boolean) from public, anon;
grant execute on function public.enqueue_vet_agenda_summary(boolean) to authenticated;

notify pgrst, 'reload schema';
