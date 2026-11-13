-- Fase 4 (Expansão Stitch): Teleconsulta, Clube DrVet (Assinaturas & Pagamentos), Portal B2B de Parceiros e DrVet Ads.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'teleconsultation_status') then
    create type public.teleconsultation_status as enum ('waiting', 'in_progress', 'ended');
  end if;
  if not exists (select 1 from pg_type where typname = 'subscription_interval') then
    create type public.subscription_interval as enum ('monthly', 'annual');
  end if;
  if not exists (select 1 from pg_type where typname = 'pet_subscription_status') then
    create type public.pet_subscription_status as enum ('active', 'paused', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_kind') then
    create type public.payment_kind as enum ('teleconsultation', 'subscription', 'pharmacy');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum ('pix', 'credit_card', 'voucher');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_order_status') then
    create type public.payment_order_status as enum ('pending', 'paid', 'refunded', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'partner_kind') then
    create type public.partner_kind as enum ('pet_shop', 'pharmacy');
  end if;
  if not exists (select 1 from pg_type where typname = 'ad_placement') then
    create type public.ad_placement as enum ('home_banner', 'booking_sidebar', 'partner_coupon');
  end if;
  if not exists (select 1 from pg_type where typname = 'ad_campaign_status') then
    create type public.ad_campaign_status as enum ('draft', 'active', 'paused', 'ended');
  end if;
end
$$;

-- ============================================================================
-- 1. SALA DE TELECONSULTA
-- ============================================================================

create table if not exists public.teleconsultation_sessions (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  veterinarian_id uuid not null references public.profiles(id) on delete cascade,
  room_code text not null unique,
  status public.teleconsultation_status not null default 'waiting',
  recording_consent boolean not null default false,
  started_at timestamptz,
  ended_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teleconsultation_notes_len check (notes is null or char_length(notes) <= 2000)
);

create index if not exists idx_teleconsultation_sessions_tutor
  on public.teleconsultation_sessions(tutor_id, created_at desc);

create index if not exists idx_teleconsultation_sessions_vet
  on public.teleconsultation_sessions(veterinarian_id, status, created_at desc);

drop trigger if exists set_teleconsultation_sessions_updated_at on public.teleconsultation_sessions;
create trigger set_teleconsultation_sessions_updated_at
  before update on public.teleconsultation_sessions
  for each row execute function public.set_updated_at();

alter table public.teleconsultation_sessions enable row level security;

-- Policy: tutor participante, veterinário designado, membro da clínica e admin podem visualizar a sessão de teleconsulta.
create policy "Participants and org members can view teleconsultation sessions"
  on public.teleconsultation_sessions for select to authenticated
  using (
    public.is_admin()
    or tutor_id = (select auth.uid())
    or veterinarian_id = (select auth.uid())
    or exists (
      select 1 from public.organization_memberships m
      where m.organization_id = teleconsultation_sessions.organization_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'admin')
    )
  );

-- Policy: apenas o veterinário designado (ou admin) pode atualizar estado, consentimento de gravação e anotações da sala.
create policy "Assigned veterinarian or admin can update teleconsultation session"
  on public.teleconsultation_sessions for update to authenticated
  using (public.is_admin() or veterinarian_id = (select auth.uid()))
  with check (public.is_admin() or veterinarian_id = (select auth.uid()));

create table if not exists public.teleconsultation_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.teleconsultation_sessions(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_name text not null,
  message text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teleconsultation_message_nonempty check (char_length(btrim(message)) between 1 and 2000)
);

create index if not exists idx_teleconsultation_messages_session
  on public.teleconsultation_messages(session_id, created_at asc);

drop trigger if exists set_teleconsultation_messages_updated_at on public.teleconsultation_messages;
create trigger set_teleconsultation_messages_updated_at
  before update on public.teleconsultation_messages
  for each row execute function public.set_updated_at();

alter table public.teleconsultation_messages enable row level security;

-- Policy: somente participantes da sessão (tutor, veterinário) e admin podem ler mensagens da sala.
create policy "Session participants can view teleconsultation messages"
  on public.teleconsultation_messages for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.teleconsultation_sessions s
      where s.id = teleconsultation_messages.session_id
        and (s.tutor_id = (select auth.uid()) or s.veterinarian_id = (select auth.uid()))
    )
  );

-- Policy: somente o tutor ou o veterinário da sessão podem enviar mensagens identificadas pelo próprio user_id.
create policy "Session participants can send teleconsultation messages"
  on public.teleconsultation_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.teleconsultation_sessions s
      where s.id = teleconsultation_messages.session_id
        and (s.tutor_id = (select auth.uid()) or s.veterinarian_id = (select auth.uid()))
    )
  );

-- RPC transacional para abrir ou recuperar a sala de teleconsulta de um atendimento autorizado.
create or replace function public.open_teleconsultation_session(target_appointment uuid)
returns public.teleconsultation_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  apt public.appointments;
  existing_session public.teleconsultation_sessions;
  generated_code text;
begin
  if actor_id is null then
    raise exception 'Autenticação necessária.';
  end if;

  select * into apt
  from public.appointments
  where id = target_appointment;

  if not found then
    raise exception 'Atendimento não encontrado.';
  end if;

  if apt.kind <> 'teleconsultation' then
    raise exception 'Este atendimento é presencial e não utiliza sala de vídeo.';
  end if;

  if apt.status not in ('confirmed', 'completed') then
    raise exception 'A sala só fica disponível após confirmação da consulta.';
  end if;

  if not (public.is_admin() or apt.tutor_id = actor_id or apt.veterinarian_id = actor_id) then
    raise exception 'Você não tem permissão para acessar esta sala.';
  end if;

  select * into existing_session
  from public.teleconsultation_sessions
  where appointment_id = target_appointment;

  if found then
    return existing_session;
  end if;

  generated_code := 'DRVET-' || upper(substr(replace(target_appointment::text, '-', ''), 1, 8));

  insert into public.teleconsultation_sessions (
    appointment_id,
    organization_id,
    pet_id,
    tutor_id,
    veterinarian_id,
    room_code,
    status
  )
  values (
    apt.id,
    apt.organization_id,
    apt.pet_id,
    apt.tutor_id,
    apt.veterinarian_id,
    generated_code,
    case when apt.status = 'completed' then 'ended'::public.teleconsultation_status else 'waiting'::public.teleconsultation_status end
  )
  returning * into existing_session;

  return existing_session;
end;
$$;

grant execute on function public.open_teleconsultation_session(uuid) to authenticated;

-- ============================================================================
-- 2. CLUBE DRVET (ASSINATURAS PREVENTIVAS) & PAGAMENTOS
-- ============================================================================

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  price_cents integer not null,
  interval public.subscription_interval not null default 'monthly',
  discount_percent integer not null default 15,
  benefits jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plan_price_check check (price_cents > 0),
  constraint subscription_plan_discount_check check (discount_percent between 0 and 100)
);

drop trigger if exists set_subscription_plans_updated_at on public.subscription_plans;
create trigger set_subscription_plans_updated_at
  before update on public.subscription_plans
  for each row execute function public.set_updated_at();

alter table public.subscription_plans enable row level security;

-- Policy: qualquer usuário autenticado pode visualizar planos ativos do Clube DrVet; admins gerenciam todos os planos.
create policy "Authenticated users can view active subscription plans"
  on public.subscription_plans for select to authenticated
  using (active = true or public.is_admin());

-- Policy: apenas administradores globais podem criar, editar ou desativar planos do Clube DrVet.
create policy "Admins manage subscription plans"
  on public.subscription_plans for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create table if not exists public.pet_subscriptions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  pet_id uuid not null references public.pets(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  status public.pet_subscription_status not null default 'active',
  discount_percent integer not null default 15,
  started_at timestamptz not null default now(),
  next_billing_at timestamptz not null default (now() + interval '1 month'),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pet_subscriptions_owner
  on public.pet_subscriptions(owner_id, status, created_at desc);

create index if not exists idx_pet_subscriptions_pet
  on public.pet_subscriptions(pet_id);

drop trigger if exists set_pet_subscriptions_updated_at on public.pet_subscriptions;
create trigger set_pet_subscriptions_updated_at
  before update on public.pet_subscriptions
  for each row execute function public.set_updated_at();

alter table public.pet_subscriptions enable row level security;

-- Policy: tutores visualizam e atualizam (pausar/cancelar) apenas assinaturas dos próprios pets; admin visualiza tudo.
create policy "Owners and admins can view pet subscriptions"
  on public.pet_subscriptions for select to authenticated
  using (public.is_admin() or owner_id = (select auth.uid()));

create policy "Owners and admins can update pet subscriptions"
  on public.pet_subscriptions for update to authenticated
  using (public.is_admin() or owner_id = (select auth.uid()))
  with check (public.is_admin() or owner_id = (select auth.uid()));

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  subscription_id uuid references public.pet_subscriptions(id) on delete set null,
  kind public.payment_kind not null,
  description text not null,
  amount_cents integer not null,
  discount_cents integer not null default 0,
  net_amount_cents integer not null,
  method public.payment_method not null default 'pix',
  status public.payment_order_status not null default 'pending',
  external_reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_amounts_check check (amount_cents >= 0 and discount_cents >= 0 and net_amount_cents >= 0)
);

create index if not exists idx_payment_orders_user
  on public.payment_orders(user_id, created_at desc);

create index if not exists idx_payment_orders_org
  on public.payment_orders(organization_id, created_at desc);

drop trigger if exists set_payment_orders_updated_at on public.payment_orders;
create trigger set_payment_orders_updated_at
  before update on public.payment_orders
  for each row execute function public.set_updated_at();

alter table public.payment_orders enable row level security;

-- Policy: cada usuário visualiza apenas os próprios comprovantes/pedidos de pagamento; org owners/admins e admin global podem auditar.
create policy "Users and authorized admins can view payment orders"
  on public.payment_orders for select to authenticated
  using (
    public.is_admin()
    or user_id = (select auth.uid())
    or (
      organization_id is not null
      and exists (
        select 1 from public.organization_memberships m
        where m.organization_id = payment_orders.organization_id
          and m.user_id = (select auth.uid())
          and m.role in ('owner', 'admin', 'billing')
      )
    )
  );

-- RPC transacional para assinar um pet em um plano ativo do Clube DrVet e registrar o pedido de pagamento.
create or replace function public.subscribe_pet_to_plan(
  target_plan uuid,
  target_pet uuid,
  target_method public.payment_method default 'pix'
)
returns public.pet_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  plan_row public.subscription_plans;
  pet_row public.pets;
  created_sub public.pet_subscriptions;
  next_cycle timestamptz;
begin
  if actor_id is null then
    raise exception 'Autenticação necessária.';
  end if;

  select * into plan_row
  from public.subscription_plans
  where id = target_plan and active = true;

  if not found then
    raise exception 'Plano não encontrado ou indisponível.';
  end if;

  select * into pet_row
  from public.pets
  where id = target_pet;

  if not found or pet_row.owner_id <> actor_id then
    raise exception 'Selecione um pet pertencente à sua conta.';
  end if;

  if exists (
    select 1 from public.pet_subscriptions
    where pet_id = target_pet and status = 'active'
  ) then
    raise exception 'Este pet já possui uma assinatura ativa no Clube DrVet.';
  end if;

  next_cycle := case
    when plan_row.interval = 'annual' then now() + interval '1 year'
    else now() + interval '1 month'
  end;

  insert into public.pet_subscriptions (
    plan_id,
    pet_id,
    owner_id,
    status,
    discount_percent,
    next_billing_at
  )
  values (
    plan_row.id,
    pet_row.id,
    actor_id,
    'active',
    plan_row.discount_percent,
    next_cycle
  )
  returning * into created_sub;

  insert into public.payment_orders (
    user_id,
    subscription_id,
    kind,
    description,
    amount_cents,
    discount_cents,
    net_amount_cents,
    method,
    status,
    external_reference,
    paid_at
  )
  values (
    actor_id,
    created_sub.id,
    'subscription',
    plan_row.name || ' — ' || pet_row.name,
    plan_row.price_cents,
    0,
    plan_row.price_cents,
    target_method,
    'paid',
    'SUB-' || upper(substr(replace(created_sub.id::text, '-', ''), 1, 8)),
    now()
  );

  return created_sub;
end;
$$;

grant execute on function public.subscribe_pet_to_plan(uuid, uuid, public.payment_method) to authenticated;

-- ============================================================================
-- 3. PORTAL B2B DE PARCEIROS & DRVET ADS
-- ============================================================================

create table if not exists public.partner_listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind public.partner_kind not null,
  trade_name text not null,
  city text not null,
  state text not null,
  coupon_code text not null,
  discount_percent integer not null default 15,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_state_uf check (state ~ '^[A-Z]{2}$'),
  constraint partner_discount_range check (discount_percent between 0 and 80)
);

create index if not exists idx_partner_listings_active
  on public.partner_listings(active, kind, city);

drop trigger if exists set_partner_listings_updated_at on public.partner_listings;
create trigger set_partner_listings_updated_at
  before update on public.partner_listings
  for each row execute function public.set_updated_at();

alter table public.partner_listings enable row level security;

-- Policy: usuários autenticados visualizam parceiros ativos e cupons; membros da organização e admin gerenciam os cadastros da própria organização.
create policy "Authenticated users can view active partner listings"
  on public.partner_listings for select to authenticated
  using (
    active = true
    or public.is_admin()
    or exists (
      select 1 from public.organization_memberships m
      where m.organization_id = partner_listings.organization_id
        and m.user_id = (select auth.uid())
    )
  );

create policy "Org owners and admins manage partner listings"
  on public.partner_listings for all to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.organization_memberships m
      where m.organization_id = partner_listings.organization_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.organization_memberships m
      where m.organization_id = partner_listings.organization_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'admin')
    )
  );

create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  placement public.ad_placement not null default 'booking_sidebar',
  budget_cents integer not null,
  status public.ad_campaign_status not null default 'draft',
  starts_on date not null default current_date,
  ends_on date,
  clicks_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_campaign_budget_check check (budget_cents > 0),
  constraint ad_campaign_clicks_check check (clicks_count >= 0)
);

create index if not exists idx_ad_campaigns_org
  on public.ad_campaigns(organization_id, status, created_at desc);

drop trigger if exists set_ad_campaigns_updated_at on public.ad_campaigns;
create trigger set_ad_campaigns_updated_at
  before update on public.ad_campaigns
  for each row execute function public.set_updated_at();

alter table public.ad_campaigns enable row level security;

-- Policy: membros da organização e administradores gerenciam as campanhas DrVet Ads da própria empresa.
create policy "Org members and admins view ad campaigns"
  on public.ad_campaigns for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.organization_memberships m
      where m.organization_id = ad_campaigns.organization_id
        and m.user_id = (select auth.uid())
    )
  );

create policy "Org owners and admins manage ad campaigns"
  on public.ad_campaigns for all to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.organization_memberships m
      where m.organization_id = ad_campaigns.organization_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.organization_memberships m
      where m.organization_id = ad_campaigns.organization_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'admin')
    )
  );
