-- Fase 1: Tabelas financeiras para /comissoes (extrato de comissões, contas de repasse e solicitações de antecipação).

create type public.commission_origin as enum (
  'teleconsultation',
  'in_person',
  'pharmacy_split',
  'partner_plan'
);

create type public.commission_status as enum (
  'available',
  'pending',
  'paid'
);

create type public.anticipation_status as enum (
  'requested',
  'approved',
  'paid',
  'rejected'
);

create table public.payout_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  veterinarian_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null default 'asaas' check (provider in ('asaas', 'mercadopago')),
  provider_connected boolean not null default false,
  payout_account_label text not null check (char_length(btrim(payout_account_label)) between 2 and 160),
  pix_key_masked text check (pix_key_masked is null or char_length(pix_key_masked) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, veterinarian_id)
);

create table public.commission_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  veterinarian_id uuid not null references public.profiles (id) on delete restrict,
  appointment_id uuid references public.appointments (id) on delete set null,
  reference text not null unique check (char_length(btrim(reference)) between 3 and 80),
  tutor_name text not null check (char_length(btrim(tutor_name)) between 1 and 120),
  pet_name text not null check (char_length(btrim(pet_name)) between 1 and 100),
  origin public.commission_origin not null,
  gross_amount_cents integer not null check (gross_amount_cents >= 0),
  net_amount_cents integer not null check (net_amount_cents >= 0 and net_amount_cents <= gross_amount_cents),
  status public.commission_status not null default 'pending',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.anticipation_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  veterinarian_id uuid not null references public.profiles (id) on delete restrict,
  protocol text not null unique check (char_length(btrim(protocol)) between 6 and 60),
  requested_cents integer not null check (requested_cents > 0),
  notes text check (notes is null or char_length(notes) <= 500),
  status public.anticipation_status not null default 'requested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payout_accounts_vet_idx
  on public.payout_accounts (veterinarian_id);
create index commission_ledger_vet_occurred_idx
  on public.commission_ledger (veterinarian_id, occurred_at desc);
create index commission_ledger_org_status_idx
  on public.commission_ledger (organization_id, status, origin);
create index anticipation_requests_vet_created_idx
  on public.anticipation_requests (veterinarian_id, created_at desc);

create trigger payout_accounts_set_updated_at
  before update on public.payout_accounts
  for each row execute function public.set_updated_at();

create trigger commission_ledger_set_updated_at
  before update on public.commission_ledger
  for each row execute function public.set_updated_at();

create trigger anticipation_requests_set_updated_at
  before update on public.anticipation_requests
  for each row execute function public.set_updated_at();

alter table public.payout_accounts enable row level security;
alter table public.commission_ledger enable row level security;
alter table public.anticipation_requests enable row level security;

revoke all on table public.payout_accounts from anon, authenticated;
revoke all on table public.commission_ledger from anon, authenticated;
revoke all on table public.anticipation_requests from anon, authenticated;

grant usage on type public.commission_origin to authenticated;
grant usage on type public.commission_status to authenticated;
grant usage on type public.anticipation_status to authenticated;
grant select on public.payout_accounts to authenticated;
grant select on public.commission_ledger to authenticated;
grant select on public.anticipation_requests to authenticated;

-- Policy: o veterinário titular, gestores/billing da clínica e administradores globais podem consultar dados de conta de repasse.
create policy "Veterinarians, org billing and admins can read payout accounts"
  on public.payout_accounts for select to authenticated
  using (
    veterinarian_id = (select auth.uid())
    or public.has_organization_role(
      organization_id,
      array['owner', 'admin', 'billing']::public.organization_role[]
    )
    or public.is_admin()
  );

-- Policy: apenas o titular da conta ou administradores podem cadastrar/alterar sua conta de repasse (não altera saldo).
create policy "Veterinarians and admins can manage own payout account"
  on public.payout_accounts for all to authenticated
  using (veterinarian_id = (select auth.uid()) or public.is_admin())
  with check (veterinarian_id = (select auth.uid()) or public.is_admin());

-- Policy: apenas o veterinário titular, perfis de gestão/billing da organização e administradores podem visualizar lançamentos no extrato (imutáveis pelo cliente).
create policy "Veterinarians, org billing and admins can read commission ledger"
  on public.commission_ledger for select to authenticated
  using (
    veterinarian_id = (select auth.uid())
    or public.has_organization_role(
      organization_id,
      array['owner', 'admin', 'billing']::public.organization_role[]
    )
    or public.is_admin()
  );

-- Policy: apenas administradores globais podem inserir/atualizar lançamentos diretos no ledger (webhooks usam service_role no servidor).
create policy "Admins can manage commission ledger"
  on public.commission_ledger for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Policy: o veterinário solicitante, gestores da organização e administradores podem consultar pedidos de antecipação.
create policy "Veterinarians, org admins and global admins can read anticipation requests"
  on public.anticipation_requests for select to authenticated
  using (
    veterinarian_id = (select auth.uid())
    or public.has_organization_role(
      organization_id,
      array['owner', 'admin', 'billing']::public.organization_role[]
    )
    or public.is_admin()
  );

-- Policy: administradores globais podem gerenciar o ciclo de antecipações.
create policy "Admins can manage anticipation requests"
  on public.anticipation_requests for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- RPC transacional para solicitar antecipação garantindo no servidor que o valor não ultrapassa o saldo disponível.
create or replace function public.request_commission_anticipation(
  target_amount_cents integer,
  target_notes text default null
)
returns public.anticipation_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_org_id uuid;
  available_total integer;
  reserved_total integer;
  remaining_available integer;
  generated_protocol text;
  created_request public.anticipation_requests;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if target_amount_cents is null or target_amount_cents <= 0 then
    raise exception 'Valor de antecipação deve ser maior que zero'
      using errcode = '22023';
  end if;

  if char_length(coalesce(target_notes, '')) > 500 then
    raise exception 'Observação excede o limite de 500 caracteres'
      using errcode = '22023';
  end if;

  select membership.organization_id
  into target_org_id
  from public.organization_memberships membership
  where membership.user_id = caller_id
  order by membership.created_at asc
  limit 1;

  if target_org_id is null then
    raise exception 'Nenhuma organização vinculada ao profissional'
      using errcode = '42501';
  end if;

  select coalesce(sum(entry.net_amount_cents), 0)
  into available_total
  from public.commission_ledger entry
  where entry.veterinarian_id = caller_id
    and entry.status = 'available';

  select coalesce(sum(req.requested_cents), 0)
  into reserved_total
  from public.anticipation_requests req
  where req.veterinarian_id = caller_id
    and req.status in ('requested', 'approved');

  remaining_available := greatest(0, available_total - reserved_total);

  if target_amount_cents > remaining_available then
    raise exception 'Valor solicitado excede o saldo disponível para antecipação'
      using errcode = '22023';
  end if;

  generated_protocol := 'ANT-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.anticipation_requests (
    organization_id,
    veterinarian_id,
    protocol,
    requested_cents,
    notes,
    status
  )
  values (
    target_org_id,
    caller_id,
    generated_protocol,
    target_amount_cents,
    nullif(btrim(target_notes), ''),
    'requested'
  )
  returning * into created_request;

  return created_request;
end;
$$;

revoke all on function public.request_commission_anticipation(integer, text)
  from public, anon;
grant execute on function public.request_commission_anticipation(integer, text)
  to authenticated;
