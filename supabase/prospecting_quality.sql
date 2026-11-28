-- ─────────────────────────────────────────────────────────────────────────
-- RiseFlow — Prospecção, Fase 1: qualidade dos leads
-- Rode no Supabase → SQL Editor. Idempotente. Pode rodar antes ou depois de
-- organizations.sql (se ela já existir, as tabelas novas ganham organization_id).
--
--   lead_exclusions       lista de exclusão: CNPJ raiz, telefone ou domínio que
--                         nunca mais volta numa busca (descartado, pediu para sair,
--                         já é cliente, manual)
--   lead_searches         histórico de buscas (o quê, onde, quantos, custo)
--   prospecting_profiles  perfil de cliente ideal salvo na conta
--   whatsapp_checks       cache da validação de WhatsApp (evita reconsultar)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.lead_exclusions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('cnpj_root', 'phone', 'domain')),
  value       text not null,
  reason      text not null default 'manual' check (reason in ('descartado', 'opt_out', 'cliente', 'manual')),
  label       text,                         -- nome da empresa, para a pessoa reconhecer na lista
  created_at  timestamptz not null default now(),
  unique (user_id, kind, value)
);
create index if not exists lead_exclusions_user_idx on public.lead_exclusions (user_id, created_at desc);

create table if not exists public.lead_searches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  source      text not null check (source in ('google_maps', 'lista', 'cnpj')),
  query       text,
  location    text,
  requested   integer,
  found       integer not null default 0,
  new_count   integer not null default 0,    -- nem no CRM, nem excluídos, nem repetidos
  excluded    integer not null default 0,
  in_crm      integer not null default 0,
  cost_usd    numeric(10, 4) not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists lead_searches_user_idx on public.lead_searches (user_id, created_at desc);

create table if not exists public.prospecting_profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  profile     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create table if not exists public.whatsapp_checks (
  user_id     uuid not null references auth.users(id) on delete cascade,
  phone       text not null,                -- só dígitos, com DDI (5511…)
  has_whatsapp boolean not null,
  checked_at  timestamptz not null default now(),
  primary key (user_id, phone)
);

-- Acesso só pelo servidor (service role). Sem políticas = bloqueado para anon/authenticated.
alter table public.lead_exclusions      enable row level security;
alter table public.lead_searches        enable row level security;
alter table public.prospecting_profiles enable row level security;
alter table public.whatsapp_checks      enable row level security;

-- Organização (E2), se organizations.sql já foi rodada.
do $$
declare t text;
begin
  if to_regprocedure('public.rf_set_organization_id()') is null then return; end if;
  foreach t in array array['lead_exclusions', 'lead_searches', 'prospecting_profiles', 'whatsapp_checks'] loop
    execute format('alter table public.%I add column if not exists organization_id uuid references public.organizations(id) on delete set null', t);
    execute format('create index if not exists %I on public.%I (organization_id)', t || '_org_idx', t);
    execute format('update public.%I x set organization_id = public.rf_org_of_user(x.user_id) where organization_id is null', t);
    execute format('drop trigger if exists rf_set_org on public.%I', t);
    execute format('create trigger rf_set_org before insert or update of user_id, organization_id on public.%I for each row execute function public.rf_set_organization_id()', t);
  end loop;
end $$;
