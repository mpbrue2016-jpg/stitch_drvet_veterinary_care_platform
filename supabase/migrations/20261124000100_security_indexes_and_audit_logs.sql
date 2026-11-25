-- Fase 3 / Fase 5 (Incremental): Índices para paginação/filtros, reforço de grant em pets e tabela audit_logs.
-- Migration incremental segura (não altera histórico das migrations anteriores 1..13).

-- 1. Reforço idempotente de permissão SELECT em public.pets para usuários autenticados (sujeito às políticas RLS).
grant select on table public.pets to authenticated;

-- 2. Índices compostos para paginação e filtragem por tutor, veterinário, clínica, status e período.
create index if not exists pets_owner_name_idx
  on public.pets (owner_id, name);

create index if not exists appointments_tutor_status_starts_idx
  on public.appointments (tutor_id, status, starts_at desc);

create index if not exists appointments_vet_status_starts_idx
  on public.appointments (veterinarian_id, status, starts_at desc);

create index if not exists vaccination_records_org_administered_idx
  on public.vaccination_records (organization_id, administered_on desc);

create index if not exists exam_orders_org_status_requested_idx
  on public.exam_orders (organization_id, status, requested_at desc);

-- 3. Tabela persistente de trilha de auditoria (escrita exclusivamente server-side via service_role).
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  event text not null check (char_length(btrim(event)) between 2 and 120),
  resource text not null check (char_length(btrim(resource)) between 2 and 120),
  action text not null check (char_length(btrim(action)) between 2 and 80),
  outcome text not null check (outcome in ('allowed', 'denied', 'error', 'rate_limited')),
  status_code integer,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx
  on public.audit_logs (created_at desc);

create index if not exists audit_logs_actor_created_idx
  on public.audit_logs (actor_id, created_at desc);

create index if not exists audit_logs_event_outcome_idx
  on public.audit_logs (event, outcome, created_at desc);

alter table public.audit_logs enable row level security;

revoke all on table public.audit_logs from anon, authenticated;
grant select on table public.audit_logs to authenticated;

drop policy if exists "Global admins can read audit logs" on public.audit_logs;
create policy "Global admins can read audit logs"
  on public.audit_logs for select to authenticated
  using (public.is_admin());

notify pgrst, 'reload schema';
