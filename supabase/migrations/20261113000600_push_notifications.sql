-- Fase 6: Notificações Push (Web Push VAPID), Preferências de Lembrete e Alertas de Fila Veterinária.

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
