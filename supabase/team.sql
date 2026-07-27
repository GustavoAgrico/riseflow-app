-- ─────────────────────────────────────────────────────────────────────────
-- RiseFlow — Equipe (membros + filas de atendimento)
-- Rode este SQL no Supabase → SQL Editor.
-- Idempotente: pode rodar mais de uma vez sem erro.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists team_members (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,   -- dono da conta (tenant)
  name        text not null,
  email       text,
  role        text default 'Atendente',              -- Admin | Supervisor | Atendente
  status      text default 'offline',                -- online | ausente | offline
  conv_limit  integer default 5,                     -- limite de conversas simultâneas
  created_at  timestamptz default now()
);

create table if not exists team_queues (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  name        text not null,
  mode        text default 'Rodízio',                -- Rodízio | Menos ocupado | Manual
  member_ids  jsonb default '[]',                    -- ids de team_members atribuídos
  created_at  timestamptz default now()
);

create index if not exists team_members_user_idx on team_members (user_id);
create index if not exists team_queues_user_idx  on team_queues (user_id);

-- ── RLS ──
alter table team_members enable row level security;
alter table team_queues  enable row level security;

drop policy if exists "team_members_own" on team_members;
create policy "team_members_own" on team_members
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "team_queues_own" on team_queues;
create policy "team_queues_own" on team_queues
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
