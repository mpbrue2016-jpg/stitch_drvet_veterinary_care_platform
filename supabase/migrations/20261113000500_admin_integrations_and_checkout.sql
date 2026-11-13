-- Fase 5 (Expansão Stitch): Painel Master Admin, RBAC, Integrações (Asaas/Mercado Pago/LiveKit/ERP) e Checkout de Teleconsulta.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'integration_provider') then
    create type public.integration_provider as enum ('asaas', 'mercado_pago', 'livekit', 'bling', 'omie');
  end if;
  if not exists (select 1 from pg_type where typname = 'integration_environment') then
    create type public.integration_environment as enum ('sandbox', 'production');
  end if;
end
$$;

create table if not exists public.integration_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  provider public.integration_provider not null,
  environment public.integration_environment not null default 'sandbox',
  webhook_endpoint text not null,
  active boolean not null default false,
  last_status text not null default 'pending_test',
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_webhook_len check (char_length(webhook_endpoint) between 1 and 500)
);

create unique index if not exists idx_integration_configs_scope_provider
  on public.integration_configs (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), provider);

drop trigger if exists set_integration_configs_updated_at on public.integration_configs;
create trigger set_integration_configs_updated_at
  before update on public.integration_configs
  for each row execute function public.set_updated_at();

alter table public.integration_configs enable row level security;

-- Policy: apenas administradores globais ou owners/admins da própria organização visualizam metadados de integrações (sem segredos).
create policy "Admins and org owners view integration configs"
  on public.integration_configs for select to authenticated
  using (
    public.is_admin()
    or (
      organization_id is not null
      and exists (
        select 1 from public.organization_memberships m
        where m.organization_id = integration_configs.organization_id
          and m.user_id = (select auth.uid())
          and m.role in ('owner', 'admin')
      )
    )
  );

-- Policy: apenas administradores globais ou owners/admins da própria organização gerenciam integrações.
create policy "Admins and org owners manage integration configs"
  on public.integration_configs for all to authenticated
  using (
    public.is_admin()
    or (
      organization_id is not null
      and exists (
        select 1 from public.organization_memberships m
        where m.organization_id = integration_configs.organization_id
          and m.user_id = (select auth.uid())
          and m.role in ('owner', 'admin')
      )
    )
  )
  with check (
    public.is_admin()
    or (
      organization_id is not null
      and exists (
        select 1 from public.organization_memberships m
        where m.organization_id = integration_configs.organization_id
          and m.user_id = (select auth.uid())
          and m.role in ('owner', 'admin')
      )
    )
  );

-- RPC para painel Master Admin listar usuários e papéis RBAC.
create or replace function public.admin_list_users()
returns setof public.profiles
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito ao administrador global.';
  end if;

  return query
  select *
  from public.profiles
  order by created_at desc
  limit 200;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;

-- RPC para painel Master Admin atualizar o papel RBAC de um usuário com proteção contra autorrebaixamento.
create or replace function public.admin_update_user_role(
  target_user uuid,
  next_role public.user_role
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito ao administrador global.';
  end if;

  if target_user = auth.uid() and next_role <> 'admin' then
    raise exception 'Não é permitido remover seu próprio acesso de administrador.';
  end if;

  update public.profiles
  set role = next_role
  where id = target_user
  returning * into updated_profile;

  if not found then
    raise exception 'Usuário não encontrado.';
  end if;

  return updated_profile;
end;
$$;

grant execute on function public.admin_update_user_role(uuid, public.user_role) to authenticated;

-- RPC transacional para calcular desconto (cupom parceiro ou Clube DrVet) e registrar pagamento de teleconsulta.
create or replace function public.create_teleconsultation_payment(
  target_appointment uuid,
  target_method public.payment_method default 'pix',
  target_coupon text default null
)
returns public.payment_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  apt public.appointments;
  pet_row public.pets;
  base_amount integer := 18000;
  discount_pct integer := 0;
  club_pct integer := 0;
  coupon_pct integer := 0;
  discount_val integer := 0;
  net_val integer := 18000;
  created_order public.payment_orders;
begin
  if actor_id is null then
    raise exception 'Autenticação necessária.';
  end if;

  select * into apt
  from public.appointments
  where id = target_appointment;

  if not found or (apt.tutor_id <> actor_id and not public.is_admin()) then
    raise exception 'Consulta não encontrada ou sem permissão de pagamento.';
  end if;

  if apt.status = 'cancelled' then
    raise exception 'Não é possível pagar uma consulta cancelada.';
  end if;

  if exists (
    select 1 from public.payment_orders
    where appointment_id = target_appointment
      and status = 'paid'
  ) then
    raise exception 'Esta consulta já possui pagamento confirmado.';
  end if;

  select * into pet_row from public.pets where id = apt.pet_id;

  select coalesce(max(discount_percent), 0) into club_pct
  from public.pet_subscriptions
  where pet_id = apt.pet_id
    and status = 'active';

  if target_coupon is not null and btrim(target_coupon) <> '' then
    select coalesce(max(discount_percent), 0) into coupon_pct
    from public.partner_listings
    where upper(coupon_code) = upper(btrim(target_coupon))
      and active = true;

    if coupon_pct = 0 then
      raise exception 'Cupom informado não encontrado ou inativo.';
    end if;
  end if;

  discount_pct := greatest(club_pct, coupon_pct);
  discount_val := round((base_amount * discount_pct)::numeric / 100.0)::integer;
  net_val := greatest(0, base_amount - discount_val);

  insert into public.payment_orders (
    user_id,
    organization_id,
    appointment_id,
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
    apt.tutor_id,
    apt.organization_id,
    apt.id,
    case when apt.kind = 'teleconsultation' then 'teleconsultation'::public.payment_kind else 'pharmacy'::public.payment_kind end,
    'Atendimento Veterinário — ' || coalesce(pet_row.name, 'Pet'),
    base_amount,
    discount_val,
    net_val,
    target_method,
    'paid',
    'PAY-' || upper(substr(replace(apt.id::text, '-', ''), 1, 8)),
    now()
  )
  returning * into created_order;

  return created_order;
end;
$$;

grant execute on function public.create_teleconsultation_payment(uuid, public.payment_method, text) to authenticated;
