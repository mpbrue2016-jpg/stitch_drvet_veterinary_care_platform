-- Fase 1: Perfis com role/email, updated_at em todas as tabelas e auditoria de RLS (incluindo perfil admin).

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'user_role'
  ) then
    create type public.user_role as enum ('tutor', 'veterinarian', 'partner', 'admin');
  end if;
end
$$;

alter table public.profiles
  add column if not exists email text check (email is null or char_length(email) <= 320),
  add column if not exists role public.user_role not null default 'tutor';

create index if not exists profiles_role_idx on public.profiles (role);

-- Atualiza trigger de criação automática de perfil quando um usuário se registra no Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email, role)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), ''), 120),
    new.email,
    'tutor'
  )
  on conflict (id) do update
  set email = coalesce(excluded.email, public.profiles.email),
      display_name = case
        when public.profiles.display_name = '' then excluded.display_name
        else public.profiles.display_name
      end;
  return new;
end;
$$;

-- Helper seguro para verificar se o usuário autenticado possui perfil global 'admin'.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Atualiza add_veterinarian para também promover o perfil de tutor para veterinarian ao vinculá-lo a uma clínica.
create or replace function public.add_veterinarian(
  target_organization uuid,
  target_user uuid,
  target_registration_number text,
  target_registration_region text,
  target_specialty text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or (
       not public.is_admin()
       and not public.has_organization_role(
         target_organization,
         array['owner', 'admin']::public.organization_role[]
       )
     ) then
    raise exception 'Not authorized to add a veterinarian'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = target_user) then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;

  if char_length(btrim(target_registration_number)) not between 1 and 32
     or target_registration_region !~ '^[A-Z]{2}$'
     or (target_specialty is not null and char_length(target_specialty) > 120) then
    raise exception 'Invalid veterinarian registration data'
      using errcode = '22023';
  end if;

  insert into public.organization_memberships (organization_id, user_id, role)
  values (target_organization, target_user, 'veterinarian')
  on conflict (organization_id, user_id) do update
  set role = 'veterinarian';

  insert into public.veterinarian_profiles (
    user_id,
    organization_id,
    registration_number,
    registration_region,
    specialty
  )
  values (
    target_user,
    target_organization,
    btrim(target_registration_number),
    target_registration_region,
    nullif(btrim(target_specialty), '')
  );

  update public.profiles
  set role = 'veterinarian'
  where id = target_user
    and role = 'tutor';
end;
$$;

-- Garante colunas updated_at e triggers em todas as tabelas que ainda não possuíam.
alter table public.organizations
  add column if not exists updated_at timestamptz not null default now();

alter table public.organization_memberships
  add column if not exists updated_at timestamptz not null default now();

alter table public.veterinarian_profiles
  add column if not exists updated_at timestamptz not null default now();

alter table public.professional_availability
  add column if not exists updated_at timestamptz not null default now();

alter table public.vaccination_records
  add column if not exists updated_at timestamptz not null default now();

alter table public.exam_orders
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

drop trigger if exists organization_memberships_set_updated_at on public.organization_memberships;
create trigger organization_memberships_set_updated_at
  before update on public.organization_memberships
  for each row execute function public.set_updated_at();

drop trigger if exists veterinarian_profiles_set_updated_at on public.veterinarian_profiles;
create trigger veterinarian_profiles_set_updated_at
  before update on public.veterinarian_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists professional_availability_set_updated_at on public.professional_availability;
create trigger professional_availability_set_updated_at
  before update on public.professional_availability
  for each row execute function public.set_updated_at();

drop trigger if exists vaccination_records_set_updated_at on public.vaccination_records;
create trigger vaccination_records_set_updated_at
  before update on public.vaccination_records
  for each row execute function public.set_updated_at();

drop trigger if exists exam_orders_set_updated_at on public.exam_orders;
create trigger exam_orders_set_updated_at
  before update on public.exam_orders
  for each row execute function public.set_updated_at();

drop trigger if exists prescription_drafts_set_updated_at on public.prescription_drafts;
create trigger prescription_drafts_set_updated_at
  before update on public.prescription_drafts
  for each row execute function public.set_updated_at();

-- Corrige bug de qualificação na policy de inserção de veterinarian_profiles.
drop policy if exists "Organization owners can register veterinarians" on public.veterinarian_profiles;

-- Policy: apenas donos/admins da mesma organização (ou admin global) podem cadastrar veterinários que já possuam vínculo 'veterinarian' naquela organização.
create policy "Organization owners can register veterinarians"
  on public.veterinarian_profiles for insert to authenticated
  with check (
    public.is_admin()
    or (
      public.has_organization_role(
        veterinarian_profiles.organization_id,
        array['owner', 'admin']::public.organization_role[]
      )
      and exists (
        select 1
        from public.organization_memberships membership
        where membership.organization_id = veterinarian_profiles.organization_id
          and membership.user_id = veterinarian_profiles.user_id
          and membership.role = 'veterinarian'
      )
    )
  );

-- Policies adicionais para suporte a leitura de nomes na equipe/agendamento e acesso total do perfil admin.

-- Policy: administradores globais podem consultar todos os perfis de usuário.
create policy "Admins can read all profiles"
  on public.profiles for select to authenticated
  using (public.is_admin());

-- Policy: membros de uma organização e usuários autenticados visualizando veterinários aprovados podem ler o nome de exibição do profissional.
create policy "Authenticated users can read approved veterinarian profiles summary"
  on public.profiles for select to authenticated
  using (
    exists (
      select 1
      from public.veterinarian_profiles vp
      where vp.user_id = profiles.id
        and (
          vp.status = 'approved'
          or public.has_organization_role(
            vp.organization_id,
            array['owner', 'admin', 'veterinarian', 'staff', 'billing']::public.organization_role[]
          )
        )
    )
  );

-- Policy: usuários autenticados podem consultar dados públicos de credenciamento de veterinários aprovados durante o agendamento.
create policy "Authenticated users can read approved veterinarians"
  on public.veterinarian_profiles for select to authenticated
  using (status = 'approved');

-- Policy: administradores globais podem gerenciar organizações.
create policy "Admins can manage all organizations"
  on public.organizations for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Policy: administradores globais podem consultar e gerenciar vínculos organizacionais.
create policy "Admins can manage all memberships"
  on public.organization_memberships for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Policy: administradores globais podem gerenciar todos os perfis de veterinários.
create policy "Admins can manage all veterinarian profiles"
  on public.veterinarian_profiles for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Policy: administradores globais podem consultar e gerenciar todos os pets.
create policy "Admins can manage all pets"
  on public.pets for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Policy: administradores globais podem consultar e gerenciar toda a disponibilidade publicada.
create policy "Admins can manage all availability"
  on public.professional_availability for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Policy: administradores globais podem consultar todos os agendamentos.
create policy "Admins can read all appointments"
  on public.appointments for select to authenticated
  using (public.is_admin());

-- Policy: administradores globais podem consultar todos os prontuários clínicos.
create policy "Admins can read all clinical records"
  on public.clinical_records for select to authenticated
  using (public.is_admin());

-- Policy: administradores globais podem consultar todos os registros de vacinação.
create policy "Admins can read all vaccination records"
  on public.vaccination_records for select to authenticated
  using (public.is_admin());

-- Policy: administradores globais podem consultar todos os pedidos e resultados de exames.
create policy "Admins can read all exam orders"
  on public.exam_orders for select to authenticated
  using (public.is_admin());

-- Policy: administradores globais podem consultar rascunhos de receita.
create policy "Admins can read all prescription drafts"
  on public.prescription_drafts for select to authenticated
  using (public.is_admin());

grant usage on type public.user_role to authenticated;
