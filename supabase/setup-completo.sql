-- ═══════════════════════════════════════════════════════════════════════════
-- RiseFlow — SETUP COMPLETO das tabelas FALTANTES no banco (2026-07-03)
-- ───────────────────────────────────────────────────────────────────────────
-- Diagnóstico: o banco (upcaknwpvnofirszehth) tem 13 das 23 tabelas do app.
-- Este arquivo cria as 10 que FALTAM — inclusive `schedules`, causa do erro
-- "Could not find the table public.schedules" na tela de Agendamentos:
--
--   user_preferences, notes, flow_executions, lead_scores, templates,
--   campaigns, campaign_messages, schedules, team_members, team_queues
--
-- RLS multi-tenant (Etapa 1): policy FOR ALL com USING/WITH CHECK
-- auth.uid() = user_id — frontend (anon key) fica isolado por usuário;
-- o servidor (service role) ignora RLS de propósito.
--
-- COMO RODAR: Supabase Dashboard → SQL Editor → New query → cole tudo → Run.
-- 100% idempotente: pode rodar de novo sem erro (CREATE IF NOT EXISTS +
-- DROP POLICY IF EXISTS). Não toca nas 13 tabelas que já existem.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- Função de trigger compartilhada (já deve existir; recriar é seguro)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) schedules — mensagens agendadas / recorrentes  ← corrige a tela
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.schedules (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text,
  phone          text not null,
  msg            text,
  send_date      date not null,
  send_time      text default '09:00',
  type           text default 'unica',
  freq           text default 'diario',
  end_date       date,
  status         text default 'agendado',  -- agendado | enviado | cancelado | falhou
  business_hours boolean default false,
  last_sent_at   timestamptz,
  created_at     timestamptz default now()
);
create index if not exists schedules_user_status_idx on public.schedules (user_id, status);
create index if not exists schedules_user_date_idx   on public.schedules (user_id, send_date);
alter table public.schedules enable row level security;
drop policy if exists "schedules_own" on public.schedules;
create policy "schedules_own" on public.schedules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 2) templates — modelos de mensagem
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  category   text default 'Saudação',
  type       text default 'Texto',
  msg        text,
  media_url  text,
  options    text,
  uses       int default 0,
  created_at timestamptz default now()
);
create index if not exists templates_user_idx on public.templates (user_id);
alter table public.templates enable row level security;
drop policy if exists "templates_own" on public.templates;
create policy "templates_own" on public.templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 3) campaigns + 4) campaign_messages — disparo em massa
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.campaigns (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text not null,
  message          text,
  media_url        text,
  message_type     text default 'text',
  audience_type    text default 'all',
  audience_filter  jsonb default '{}'::jsonb,
  status           text default 'draft',
  scheduled_at     timestamptz,
  interval_seconds int default 3,
  total            int default 0,
  sent             int default 0,
  delivered        int default 0,
  read             int default 0,
  replied          int default 0,
  created_at       timestamptz default now()
);
create index if not exists campaigns_user_idx on public.campaigns (user_id, created_at desc);
alter table public.campaigns enable row level security;
drop policy if exists "campaigns_own" on public.campaigns;
create policy "campaigns_own" on public.campaigns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.campaign_messages (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid references public.campaigns(id) on delete cascade,
  contact_id      uuid,
  contact_name    text,
  contact_company text,
  phone           text not null,
  status          text default 'pending',  -- pending | sent | failed
  sent_at         timestamptz,
  error           text
);
create index if not exists campaign_messages_campaign_idx on public.campaign_messages (campaign_id, status);
alter table public.campaign_messages enable row level security;
drop policy if exists "campaign_messages_own" on public.campaign_messages;
create policy "campaign_messages_own" on public.campaign_messages
  for all using (campaign_id in (select id from public.campaigns where user_id = auth.uid()))
  with check (campaign_id in (select id from public.campaigns where user_id = auth.uid()));
-- alta escrita: vacuum/analyze mais agressivos
alter table public.campaign_messages set (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);

-- ───────────────────────────────────────────────────────────────────────────
-- 5) team_members + 6) team_queues — equipe e filas
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.team_members (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  email      text,
  role       text default 'Atendente',
  status     text default 'offline',
  conv_limit int default 5,
  created_at timestamptz default now()
);
create index if not exists team_members_user_idx on public.team_members (user_id);
alter table public.team_members enable row level security;
drop policy if exists "team_members_own" on public.team_members;
create policy "team_members_own" on public.team_members
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.team_queues (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  mode       text default 'Rodízio',
  member_ids jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);
create index if not exists team_queues_user_idx on public.team_queues (user_id);
alter table public.team_queues enable row level security;
drop policy if exists "team_queues_own" on public.team_queues;
create policy "team_queues_own" on public.team_queues
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 7) notes — anotações por contato
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  contact_id text not null,
  content    text not null,
  type       text default 'note',
  pinned     boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists notes_contact_idx on public.notes (contact_id);
alter table public.notes enable row level security;
drop policy if exists "notes_own" on public.notes;
create policy "notes_own" on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop trigger if exists notes_updated_at on public.notes;
create trigger notes_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 8) flow_executions — motor de funis (server usa SERVICE ROLE)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.flow_executions (
  id              uuid primary key default gen_random_uuid(),
  flow_id         uuid references public.flows(id) on delete cascade,
  contact_jid     text not null,
  current_node_id text,
  status          text default 'running',   -- running | waiting_reply | completed | failed
  variables       jsonb default '{}'::jsonb,
  started_at      timestamptz default now(),
  completed_at    timestamptz
);
create index if not exists flow_executions_jid_idx    on public.flow_executions (contact_jid);
create index if not exists flow_executions_status_idx on public.flow_executions (status);
create index if not exists flow_executions_waiting_idx
  on public.flow_executions (contact_jid, status) where status = 'waiting_reply';
alter table public.flow_executions enable row level security;
drop policy if exists "flow_executions_own" on public.flow_executions;
create policy "flow_executions_own" on public.flow_executions
  for all using (flow_id in (select id from public.flows where user_id = auth.uid()));

-- ───────────────────────────────────────────────────────────────────────────
-- 9) lead_scores — pontuação de leads (histórico por contato)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.lead_scores (
  id               uuid primary key default gen_random_uuid(),
  contact_id       uuid,
  user_id          uuid references auth.users(id) on delete cascade,
  score            int,
  qualified        boolean,
  temperature      text,
  reasons          jsonb default '[]'::jsonb,
  missing_info     jsonb default '[]'::jsonb,
  suggested_action text,
  summary          text,
  scored_at        timestamptz default now()
);
create index if not exists lead_scores_contact_idx on public.lead_scores (contact_id, scored_at desc);
create index if not exists lead_scores_user_idx    on public.lead_scores (user_id, score desc);
alter table public.lead_scores enable row level security;
drop policy if exists "lead_scores_own" on public.lead_scores;
create policy "lead_scores_own" on public.lead_scores
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 10) user_preferences — estado de onboarding
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.user_preferences (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null unique references auth.users(id) on delete cascade,
  onboarding_completed boolean default false,
  onboarded_at         timestamptz,
  created_at           timestamptz default now()
);
alter table public.user_preferences enable row level security;
drop policy if exists "user_preferences_own" on public.user_preferences;
create policy "user_preferences_own" on public.user_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — deve retornar as 10 tabelas recém-criadas
-- ═══════════════════════════════════════════════════════════════════════════
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'schedules','templates','campaigns','campaign_messages','team_members',
    'team_queues','notes','flow_executions','lead_scores','user_preferences'
  )
order by table_name;
