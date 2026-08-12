-- ═══════════════════════════════════════════════════════════════════════════
-- RiseFlow — SCHEMA COMPLETO E INDEPENDENTE (alta performance)
-- ───────────────────────────────────────────────────────────────────────────
-- Provisiona TODAS as 23 tabelas que o app usa, do zero, num único arquivo.
-- Inclui: tipos corretos, FKs, índices compostos por padrão de query real,
-- RLS por usuário, triggers de updated_at, auto-provisão no signup,
-- Realtime do chat, deduplicação de mensagens e tuning de autovacuum.
--
-- COMO RODAR: Supabase Dashboard → SQL Editor → cole tudo → Run.
-- 100% idempotente: seguro em banco novo OU já existente (CREATE IF NOT EXISTS
-- + ALTER ADD COLUMN IF NOT EXISTS + DROP POLICY IF EXISTS). Pode rodar de novo.
--
-- Tabelas reconstruídas a partir do uso real no código (não tinham schema no
-- repo): conversations, messages, profiles, integrations, niche_config,
-- attendant_config, knowledge_base, user_preferences, clients (base).
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ── Função de trigger compartilhada: mantém updated_at sempre atual ──────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) profiles — plano do usuário (1:1 com auth.users)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  plan       text default 'free',
  full_name  text,
  created_at timestamptz default now()
);
alter table public.profiles add column if not exists plan text default 'free';
alter table public.profiles enable row level security;
drop policy if exists "profiles_own" on public.profiles;
create policy "profiles_own" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- ───────────────────────────────────────────────────────────────────────────
-- 2) user_preferences — estado de onboarding
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

-- ───────────────────────────────────────────────────────────────────────────
-- 3) usage — uso/limites de plano
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.usage (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references auth.users(id) on delete cascade,
  plan           text default 'free',
  messages_sent  int default 0,
  messages_limit int default 50,
  created_at     timestamptz default now()
);
alter table public.usage enable row level security;
drop policy if exists "usage_own" on public.usage;
create policy "usage_own" on public.usage
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 4) settings — chaves de API + provider WhatsApp + prefs de notificação
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.settings (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null unique references auth.users(id) on delete cascade,
  openai_key         text,
  anthropic_key      text,
  gemini_key         text,
  groq_key           text,
  notification_prefs jsonb,
  wa_provider        text default 'evolution',
  wa_phone_number_id text,
  wa_access_token    text,
  webhook_url        text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
alter table public.settings add column if not exists gemini_key         text;
alter table public.settings add column if not exists groq_key           text;
alter table public.settings add column if not exists notification_prefs jsonb;
alter table public.settings add column if not exists wa_provider        text default 'evolution';
alter table public.settings add column if not exists wa_phone_number_id text;
alter table public.settings add column if not exists wa_access_token    text;
alter table public.settings add column if not exists webhook_url        text;
alter table public.settings enable row level security;
drop policy if exists "settings_own" on public.settings;
create policy "settings_own" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop trigger if exists settings_updated_at on public.settings;
create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 5) clients — contatos / CRM (sincroniza com o Funil via `stage`)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.clients (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  phone        text,
  email        text,
  company      text,
  value        numeric default 0,
  stage        text default 'lead',          -- lead | qual | prop | neg | closed | lost
  tags         text[] default '{}',
  status       text default 'active',
  last_message text,
  created_at   timestamptz default now()
);
alter table public.clients add column if not exists stage        text default 'lead';
alter table public.clients add column if not exists value        numeric default 0;
alter table public.clients add column if not exists company      text;
alter table public.clients add column if not exists email        text;
alter table public.clients add column if not exists tags         text[] default '{}';
alter table public.clients add column if not exists last_message text;
create index if not exists clients_user_created_idx on public.clients (user_id, created_at desc);
create index if not exists clients_user_phone_idx   on public.clients (user_id, phone);
create index if not exists clients_user_stage_idx   on public.clients (user_id, stage);
alter table public.clients enable row level security;
drop policy if exists "clients_own" on public.clients;
create policy "clients_own" on public.clients
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 6) conversations — threads do chat (1 por contato)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  contact_name    text,
  contact_phone   text,
  contact_channel text default 'whatsapp',
  last_message    text,
  last_message_at timestamptz default now(),
  unread_count    int default 0,
  ai_auto_reply   boolean default false,
  status          text default 'active',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
alter table public.conversations add column if not exists ai_auto_reply boolean default false;
alter table public.conversations add column if not exists unread_count  int default 0;
alter table public.conversations add column if not exists updated_at    timestamptz default now();
-- updated_at automático (writers do servidor e Edge Function fazem upsert com ela)
drop trigger if exists conversations_updated_at on public.conversations;
create trigger conversations_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();
-- Chave de upsert por (usuário, telefone) — usada no sync e no webhook
do $$ begin
  alter table public.conversations add constraint conversations_user_phone_unique unique (user_id, contact_phone);
exception when duplicate_object then null; when duplicate_table then null; end $$;
create index if not exists conversations_user_last_idx on public.conversations (user_id, last_message_at desc);
alter table public.conversations enable row level security;
drop policy if exists "conversations_own" on public.conversations;
create policy "conversations_own" on public.conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 7) messages — mensagens (tabela de maior crescimento)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete cascade,
  content         text,
  direction       text,                 -- inbound | outbound
  status          text default 'sent',  -- sent | delivered | read
  channel         text default 'whatsapp',
  external_id     text,                 -- id da Evolution/Cloud p/ casar status e dedup
  contact_phone   text,                 -- denormalizado: consultas de histórico por telefone
  created_at      timestamptz default now()
);
alter table public.messages add column if not exists external_id text;
alter table public.messages add column if not exists contact_phone text;
create index if not exists messages_contact_phone_idx on public.messages (contact_phone);
-- Dedup idempotente das mensagens recebidas (webhook e polling)
create unique index if not exists messages_external_id_uidx
  on public.messages (external_id) where external_id is not null;
-- Padrão de query real: mensagens de uma conversa em ordem cronológica
create index if not exists messages_conv_created_idx on public.messages (conversation_id, created_at);
create index if not exists messages_user_idx         on public.messages (user_id);
alter table public.messages enable row level security;
drop policy if exists "messages_own" on public.messages;
create policy "messages_own" on public.messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 8) notes — anotações por contato
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
-- 9) flows — funis de automação (dois builders: flow_data e nodes/edges)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.flows (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null default 'Novo Funil',
  description  text,
  channel      text default 'whatsapp',
  status       text default 'paused',                          -- active | paused
  nodes        jsonb default '[]'::jsonb,
  edges        jsonb default '[]'::jsonb,
  trigger_type text,
  flow_data    jsonb default '{"nodes":[],"edges":[]}'::jsonb,
  triggers     int default 0,
  conversions  int default 0,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
alter table public.flows add column if not exists nodes        jsonb default '[]'::jsonb;
alter table public.flows add column if not exists edges        jsonb default '[]'::jsonb;
alter table public.flows add column if not exists trigger_type text;
alter table public.flows add column if not exists flow_data    jsonb default '{"nodes":[],"edges":[]}'::jsonb;
create index if not exists flows_user_idx   on public.flows (user_id);
create index if not exists flows_status_idx on public.flows (status);
alter table public.flows enable row level security;
drop policy if exists "flows_own" on public.flows;
create policy "flows_own" on public.flows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop trigger if exists flows_updated_at on public.flows;
create trigger flows_updated_at before update on public.flows
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 10) flow_executions — motor de execução (server usa SERVICE ROLE)
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
-- 11) contacts — espelho local de contatos (flowEngine: 1º contato / tags)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.contacts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  jid             text not null,
  name            text,
  phone           text,
  tags            text[] default '{}',
  first_seen_at   timestamptz default now(),
  last_message_at timestamptz
);
create index if not exists contacts_jid_idx     on public.contacts (jid);
create index if not exists contacts_user_id_idx on public.contacts (user_id);
alter table public.contacts enable row level security;
drop policy if exists "contacts_own" on public.contacts;
create policy "contacts_own" on public.contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 12) integrations — canais conectados (whatsapp, ai, etc.)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.integrations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  type         text not null,               -- whatsapp | ai | instagram | ...
  status       text default 'disconnected', -- connected | disconnected
  config       jsonb default '{}'::jsonb,
  connected_at timestamptz,
  created_at   timestamptz default now()
);
do $$ begin
  alter table public.integrations add constraint integrations_user_type_unique unique (user_id, type);
exception when duplicate_object then null; when duplicate_table then null; end $$;
alter table public.integrations enable row level security;
drop policy if exists "integrations_own" on public.integrations;
create policy "integrations_own" on public.integrations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 13) niche_config — config de nicho p/ qualificação de leads por IA
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.niche_config (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null unique references auth.users(id) on delete cascade,
  niche                   text,
  ideal_customer          text,
  disqualify_criteria     text,
  qualification_questions jsonb default '[]'::jsonb,
  min_score               int default 70,
  created_at              timestamptz default now()
);
alter table public.niche_config add column if not exists min_score int default 70;
alter table public.niche_config enable row level security;
drop policy if exists "niche_config_own" on public.niche_config;
create policy "niche_config_own" on public.niche_config
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 14) attendant_config — atendente inteligente (IA)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.attendant_config (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references auth.users(id) on delete cascade,
  enabled               boolean default false,
  personality           text,
  company_name          text,
  business_hours        text default '08:00-18:00 Seg-Sex',
  custom_rules          text,
  no_answer_action      text default 'transfer',
  response_delay        int default 2,
  max_auto_messages     int default 10,
  respond_outside_hours boolean default false,
  respond_groups        boolean default false,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);
alter table public.attendant_config enable row level security;
drop policy if exists "attendant_config_own" on public.attendant_config;
create policy "attendant_config_own" on public.attendant_config
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop trigger if exists attendant_config_updated_at on public.attendant_config;
create trigger attendant_config_updated_at before update on public.attendant_config
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 15) knowledge_base — FAQs do atendente
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.knowledge_base (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  question   text not null,
  answer     text not null,
  created_at timestamptz default now()
);
create index if not exists knowledge_base_user_idx on public.knowledge_base (user_id);
alter table public.knowledge_base enable row level security;
drop policy if exists "knowledge_base_own" on public.knowledge_base;
create policy "knowledge_base_own" on public.knowledge_base
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 16) lead_scores — pontuação de leads (histórico por contato)
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
-- 17) templates — modelos de mensagem
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
-- 18) campaigns + 19) campaign_messages — disparo em massa
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

-- ───────────────────────────────────────────────────────────────────────────
-- 20) schedules — mensagens agendadas / recorrentes
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
-- 21) team_members + 22) team_queues — equipe e filas
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
-- 23) activity_logs — auditoria
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  action      text not null,
  category    text default 'system',
  description text default '',
  metadata    jsonb default '{}'::jsonb,
  ip          text,
  page        text,
  created_at  timestamptz default now()
);
create index if not exists activity_logs_user_date_idx on public.activity_logs (user_id, created_at desc);
create index if not exists activity_logs_category_idx   on public.activity_logs (category);
alter table public.activity_logs enable row level security;
drop policy if exists "activity_logs_own" on public.activity_logs;
create policy "activity_logs_own" on public.activity_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- REALTIME + RPC (chat)
-- ═══════════════════════════════════════════════════════════════════════════
-- Sem isto o postgres_changes NÃO dispara (causa de "chat não sincroniza").
do $$ begin alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.conversations;
  exception when duplicate_object then null; end $$;
-- Entrega dados completos em UPDATE/DELETE (não só INSERT)
alter table public.messages      replica identity full;
alter table public.conversations replica identity full;

-- Incremento atômico de não-lidas (chamado pelo webhook ao receber mensagem)
create or replace function public.increment_unread(conv_id uuid)
returns void language sql as $$
  update public.conversations
  set unread_count = coalesce(unread_count, 0) + 1
  where id = conv_id;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- AUTO-PROVISÃO no signup — cria usage + profiles automaticamente
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.usage (user_id)    values (new.id) on conflict (user_id) do nothing;
  insert into public.profiles (id)       values (new.id) on conflict (id)      do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created_usage on auth.users;  -- legado (usage_table.sql)
drop trigger if exists on_auth_user_created       on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════════════════
-- TUNING DE AUTOVACUUM — tabelas de alta escrita (mensagens / logs / campanhas)
-- Vacuum/analyze mais agressivos mantêm os índices enxutos e o planner preciso.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.messages          set (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
alter table public.activity_logs      set (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
alter table public.campaign_messages  set (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — lista as tabelas criadas
-- ═══════════════════════════════════════════════════════════════════════════
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles','user_preferences','usage','settings','clients','conversations',
    'messages','notes','flows','flow_executions','contacts','integrations',
    'niche_config','attendant_config','knowledge_base','lead_scores','templates',
    'campaigns','campaign_messages','schedules','team_members','team_queues','activity_logs'
  )
order by table_name;
