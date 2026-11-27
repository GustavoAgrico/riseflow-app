-- ─────────────────────────────────────────────────────────────────────────
-- RiseFlow — E2: Organizações (fundação)
-- Rode no Supabase → SQL Editor. Idempotente: pode rodar mais de uma vez.
--
-- O que faz (só ACRESCENTA, não muda nenhuma consulta existente):
--   1. cria organizations (1 por dono de conta) e organization_members
--      (papéis owner/admin/manager/agent/viewer);
--   2. espelha a equipe atual (team_members) nos membros, e mantém espelhada
--      por gatilho (Admin→admin, Supervisor→manager, Atendente→agent);
--   3. acrescenta organization_id em TODA tabela pública que tem user_id (uuid),
--      preenche as linhas existentes e passa a preencher sozinho em cada
--      insert/update a partir do user_id. O valor mandado pelo navegador é
--      IGNORADO: o dono continua sendo o user_id validado pelo servidor.
--
-- O preenchimento das linhas antigas desliga os gatilhos da tabela só durante o
-- UPDATE, para não mexer em updated_at (a ordem das conversas fica igual).
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- ── 1. Tabelas ──────────────────────────────────────────────────────────
create table if not exists public.organizations (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null unique references auth.users(id) on delete cascade,
  name           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.organization_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid references auth.users(id) on delete set null,   -- preenchido quando a pessoa tem login
  team_member_id   uuid references public.team_members(id) on delete set null,
  email            text,
  role             text not null default 'agent'
                   check (role in ('owner', 'admin', 'manager', 'agent', 'viewer')),
  status           text not null default 'active'
                   check (status in ('active', 'invited', 'removed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists organization_members_owner_uniq
  on public.organization_members (organization_id) where role = 'owner';
create unique index if not exists organization_members_team_uniq
  on public.organization_members (team_member_id) where team_member_id is not null;
create index if not exists organization_members_user_idx  on public.organization_members (user_id);
create index if not exists organization_members_org_idx   on public.organization_members (organization_id, status);
create index if not exists organization_members_email_idx on public.organization_members (lower(email));

-- ── 2. Funções ──────────────────────────────────────────────────────────
create or replace function public.rf_role_from_team(r text) returns text
language sql immutable as $$
  select case lower(trim(coalesce(r, '')))
    when 'owner' then 'admin'          -- dono é só o da organização
    when 'admin' then 'admin'
    when 'administrador' then 'admin'
    when 'supervisor' then 'manager'
    when 'gerente' then 'manager'
    when 'manager' then 'manager'
    when 'viewer' then 'viewer'
    when 'visualizador' then 'viewer'
    else 'agent'
  end
$$;

-- Garante a organização de um dono (cria se faltar) e devolve o id.
create or replace function public.rf_ensure_organization(p_owner uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_owner is null then return null; end if;
  select id into v_id from public.organizations where owner_user_id = p_owner;
  if v_id is not null then return v_id; end if;

  insert into public.organizations (owner_user_id, name)
  select u.id, coalesce(nullif(u.raw_user_meta_data->>'company', ''),
                        nullif(u.raw_user_meta_data->>'full_name', ''),
                        split_part(u.email, '@', 1))
  from auth.users u where u.id = p_owner
  on conflict (owner_user_id) do nothing;

  select id into v_id from public.organizations where owner_user_id = p_owner;
  if v_id is not null then
    insert into public.organization_members (organization_id, user_id, email, role, status)
    select v_id, u.id, u.email, 'owner', 'active' from auth.users u where u.id = p_owner
    on conflict do nothing;
  end if;
  return v_id;
end $$;

-- Organização dona de uma linha. Nas tabelas de negócio user_id é SEMPRE o dono
-- da conta (membros entram com o id do dono — ver /api/auth/login), então não se
-- deduz nada pela equipe: dados antigos de quem virou membro não vão para a equipe.
create or replace function public.rf_org_of_user(p_user uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.organizations where owner_user_id = p_user
$$;

-- Gatilho das tabelas de negócio: organization_id sempre derivado do user_id.
create or replace function public.rf_set_organization_id() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if new.user_id is null then
    new.organization_id := null;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id and old.organization_id is not null then
    new.organization_id := old.organization_id;      -- ninguém troca a organização na mão
    return new;
  end if;
  v_org := public.rf_org_of_user(new.user_id);
  if v_org is null then v_org := public.rf_ensure_organization(new.user_id); end if;
  new.organization_id := v_org;   -- user_id fora de auth.users → fica null (não quebra o insert)
  return new;
end $$;

-- Espelha team_members → organization_members.
create or replace function public.rf_sync_team_member() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_uid uuid;
begin
  if tg_op = 'DELETE' then
    update public.organization_members
       set status = 'removed', updated_at = now()
     where team_member_id = old.id;
    return old;
  end if;

  v_org := public.rf_ensure_organization(new.user_id);
  if v_org is null then return new; end if;
  if new.email is not null and new.email <> '' then
    select id into v_uid from auth.users where lower(email) = lower(new.email) and id <> new.user_id limit 1;
  end if;

  update public.organization_members
     set organization_id = v_org,
         email = new.email,
         role = public.rf_role_from_team(new.role),
         user_id = coalesce(v_uid, user_id),
         status = case when coalesce(v_uid, user_id) is null then 'invited' else 'active' end,
         updated_at = now()
   where team_member_id = new.id;
  if not found then
    insert into public.organization_members (organization_id, user_id, team_member_id, email, role, status)
    values (v_org, v_uid, new.id, new.email, public.rf_role_from_team(new.role),
            case when v_uid is null then 'invited' else 'active' end);
  end if;
  return new;
end $$;

-- Funções só para o servidor (service role) e gatilhos — nada exposto via RPC.
revoke all on function public.rf_ensure_organization(uuid) from public, anon, authenticated;
revoke all on function public.rf_org_of_user(uuid)        from public, anon, authenticated;
revoke all on function public.rf_set_organization_id()    from public, anon, authenticated;
revoke all on function public.rf_sync_team_member()       from public, anon, authenticated;
grant execute on function public.rf_ensure_organization(uuid) to service_role;
grant execute on function public.rf_org_of_user(uuid)        to service_role;

-- ── 3. Organizações e membros a partir dos dados atuais ─────────────────
do $$
declare r record;
begin
  -- Donos de conta: todo login que NÃO é só membro da equipe de outra pessoa…
  for r in
    select u.id from auth.users u
    where not exists (
      select 1 from public.team_members tm
      where lower(tm.email) = lower(u.email) and tm.user_id <> u.id
    )
  loop
    perform public.rf_ensure_organization(r.id);
  end loop;
  -- …e todo dono que já tem equipe.
  for r in select distinct user_id as id from public.team_members where user_id is not null loop
    perform public.rf_ensure_organization(r.id);
  end loop;

  -- Equipe atual → membros.
  insert into public.organization_members (organization_id, user_id, team_member_id, email, role, status)
  select o.id, u.id, tm.id, tm.email, public.rf_role_from_team(tm.role),
         case when u.id is null then 'invited' else 'active' end
  from public.team_members tm
  join public.organizations o on o.owner_user_id = tm.user_id
  left join lateral (
    select au.id from auth.users au
    where tm.email is not null and lower(au.email) = lower(tm.email) and au.id <> tm.user_id
    limit 1
  ) u on true
  on conflict do nothing;
end $$;

drop trigger if exists rf_sync_team_member_aiu on public.team_members;
create trigger rf_sync_team_member_aiu after insert or update on public.team_members
  for each row execute function public.rf_sync_team_member();
drop trigger if exists rf_sync_team_member_bd on public.team_members;
create trigger rf_sync_team_member_bd before delete on public.team_members
  for each row execute function public.rf_sync_team_member();

-- ── 4. organization_id em toda tabela com user_id ───────────────────────
do $$
declare t record;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'user_id' and c.data_type = 'uuid'
      and c.table_name not in ('organizations', 'organization_members')
    order by c.table_name
  loop
    execute format('alter table public.%I add column if not exists organization_id uuid references public.organizations(id) on delete set null', t.table_name);
    execute format('create index if not exists %I on public.%I (organization_id)', left(t.table_name, 50) || '_org_idx', t.table_name);

    -- Quem gravou dados mas ainda não tem organização vira dono de uma.
    execute format($q$
      select count(public.rf_ensure_organization(s.user_id))
      from (select distinct user_id from public.%I where user_id is not null and organization_id is null) s
      where public.rf_org_of_user(s.user_id) is null
    $q$, t.table_name);

    -- Linhas antigas, sem disparar gatilhos (updated_at fica como está).
    execute format('alter table public.%I disable trigger user', t.table_name);
    execute format($q$
      update public.%I x set organization_id = public.rf_org_of_user(x.user_id)
      where x.organization_id is null and x.user_id is not null
    $q$, t.table_name);
    execute format('alter table public.%I enable trigger user', t.table_name);

    -- Daqui pra frente, preenchido sozinho.
    execute format('drop trigger if exists rf_set_org on public.%I', t.table_name);
    execute format('create trigger rf_set_org before insert or update of user_id, organization_id on public.%I for each row execute function public.rf_set_organization_id()', t.table_name);
  end loop;
end $$;

-- ── 5. RLS (o app lê pelo servidor; aqui só fecha o acesso direto) ──────
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;

drop policy if exists organization_members_self on public.organization_members;
create policy organization_members_self on public.organization_members
  for select using (user_id = auth.uid());

drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read on public.organizations
  for select using (
    owner_user_id = auth.uid()
    or exists (select 1 from public.organization_members m
               where m.organization_id = organizations.id and m.user_id = auth.uid() and m.status = 'active')
  );

-- ── Conferência (rode depois; tudo deve dar 0 em "sem_org") ─────────────
-- select 'organizations' t, count(*) from organizations
-- union all select 'members', count(*) from organization_members;
--
-- do $$ declare t record; n bigint; begin
--   for t in select table_name from information_schema.columns
--            where table_schema='public' and column_name='organization_id'
--              and table_name not in ('organization_members') loop
--     execute format('select count(*) from public.%I where user_id is not null and organization_id is null', t.table_name) into n;
--     raise notice '% sem_org=%', t.table_name, n;
--   end loop; end $$;
