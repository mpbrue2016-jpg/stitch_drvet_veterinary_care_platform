-- Migration 15 (FASE 6 — Prontidão de Arquitetura MVP):
-- 1) Idempotência e auditoria de webhooks financeiros (webhook_events)
-- 2) Consentimento bilateral LGPD/CFMV para gravação de teleconsulta (teleconsultation_consents + RPC record_teleconsultation_consent)
-- 3) Fila desacoplada de notificações E-mail / WhatsApp / Push (notification_outbox)

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  order_id uuid references public.payment_orders(id) on delete set null,
  payload_hash text not null,
  status text not null default 'processed' check (status in ('processed', 'ignored', 'failed')),
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint webhook_events_provider_event_uidx unique (provider, event_id)
);

alter table public.webhook_events enable row level security;

drop policy if exists "Admins view webhook events" on public.webhook_events;
create policy "Admins view webhook events"
  on public.webhook_events for select to authenticated
  using (public.is_admin());

revoke all on table public.webhook_events from public, anon, authenticated;
grant select on table public.webhook_events to authenticated;

create table if not exists public.teleconsultation_consents (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.teleconsultation_sessions(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  veterinarian_id uuid not null references public.profiles(id) on delete cascade,
  policy_version text not null default 'v1-lgpd-cfmv-2026',
  tutor_consented_at timestamptz,
  tutor_revoked_at timestamptz,
  vet_consented_at timestamptz,
  vet_revoked_at timestamptz,
  retention_days integer not null default 1825 check (retention_days >= 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists teleconsultation_consents_appointment_idx
  on public.teleconsultation_consents (appointment_id);

drop trigger if exists set_teleconsultation_consents_updated_at on public.teleconsultation_consents;
create trigger set_teleconsultation_consents_updated_at
  before update on public.teleconsultation_consents
  for each row execute function public.set_updated_at();

alter table public.teleconsultation_consents enable row level security;

drop policy if exists "Session participants or admins read consents" on public.teleconsultation_consents;
create policy "Session participants or admins read consents"
  on public.teleconsultation_consents for select to authenticated
  using (
    public.is_admin()
    or tutor_id = (select auth.uid())
    or veterinarian_id = (select auth.uid())
  );

revoke all on table public.teleconsultation_consents from public, anon, authenticated;
grant select on table public.teleconsultation_consents to authenticated;

create or replace function public.record_teleconsultation_consent(
  target_session uuid,
  consent_granted boolean
)
returns public.teleconsultation_consents
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  sess public.teleconsultation_sessions;
  consent_row public.teleconsultation_consents;
  now_ts timestamptz := now();
  tutor_active boolean;
  vet_active boolean;
begin
  if actor_id is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;

  select * into sess
  from public.teleconsultation_sessions
  where id = target_session;

  if not found then
    raise exception 'Sessão de teleconsulta não encontrada.' using errcode = 'P0002';
  end if;

  if actor_id <> sess.tutor_id and actor_id <> sess.veterinarian_id then
    raise exception 'Somente o tutor ou o veterinário da sessão pode registrar consentimento próprio.' using errcode = '42501';
  end if;

  if sess.status = 'ended' then
    raise exception 'Não é possível alterar consentimento de uma sessão já encerrada.' using errcode = '55000';
  end if;

  insert into public.teleconsultation_consents (
    session_id,
    appointment_id,
    tutor_id,
    veterinarian_id
  )
  values (
    sess.id,
    sess.appointment_id,
    sess.tutor_id,
    sess.veterinarian_id
  )
  on conflict (session_id) do nothing;

  if actor_id = sess.tutor_id then
    update public.teleconsultation_consents
    set
      tutor_consented_at = case when consent_granted then now_ts else tutor_consented_at end,
      tutor_revoked_at = case when consent_granted then null else now_ts end,
      updated_at = now_ts
    where session_id = sess.id
    returning * into consent_row;
  else
    update public.teleconsultation_consents
    set
      vet_consented_at = case when consent_granted then now_ts else vet_consented_at end,
      vet_revoked_at = case when consent_granted then null else now_ts end,
      updated_at = now_ts
    where session_id = sess.id
    returning * into consent_row;
  end if;

  tutor_active := consent_row.tutor_consented_at is not null
    and (consent_row.tutor_revoked_at is null or consent_row.tutor_consented_at > consent_row.tutor_revoked_at);
  vet_active := consent_row.vet_consented_at is not null
    and (consent_row.vet_revoked_at is null or consent_row.vet_consented_at > consent_row.vet_revoked_at);

  update public.teleconsultation_sessions
  set
    recording_consent = (tutor_active and vet_active),
    updated_at = now_ts
  where id = sess.id;

  return consent_row;
end;
$$;

revoke all on function public.record_teleconsultation_consent(uuid, boolean) from public, anon;
grant execute on function public.record_teleconsultation_consent(uuid, boolean) to authenticated;

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp', 'push')),
  template_key text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  provider_message_id text,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_outbox_status_sched_idx
  on public.notification_outbox (status, scheduled_for asc);

drop trigger if exists set_notification_outbox_updated_at on public.notification_outbox;
create trigger set_notification_outbox_updated_at
  before update on public.notification_outbox
  for each row execute function public.set_updated_at();

alter table public.notification_outbox enable row level security;

drop policy if exists "Recipients or admins view notification outbox" on public.notification_outbox;
create policy "Recipients or admins view notification outbox"
  on public.notification_outbox for select to authenticated
  using (
    public.is_admin()
    or recipient_user_id = (select auth.uid())
  );

revoke all on table public.notification_outbox from public, anon, authenticated;
grant select on table public.notification_outbox to authenticated;

notify pgrst, 'reload schema';
