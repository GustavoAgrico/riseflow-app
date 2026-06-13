-- ── Run in Supabase Dashboard → SQL Editor ────────────────────────────
-- Tabelas do MOTOR de execução de funis (server/flowEngine.js).
-- Idempotente: cria se não existir e completa colunas/índices que faltarem.

-- Execuções de funil (uma por contato que entrou num funil).
CREATE TABLE IF NOT EXISTS public.flow_executions (
  id              uuid default gen_random_uuid() primary key,
  flow_id         uuid references public.flows(id) on delete cascade,
  contact_jid     text not null,
  current_node_id text,
  status          text default 'running',   -- running | waiting_reply | completed | failed
  variables       jsonb default '{}'::jsonb,
  started_at      timestamptz default now(),
  completed_at    timestamptz
);

ALTER TABLE public.flow_executions
  ADD COLUMN IF NOT EXISTS current_node_id text,
  ADD COLUMN IF NOT EXISTS status          text default 'running',
  ADD COLUMN IF NOT EXISTS variables       jsonb default '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS completed_at    timestamptz;

CREATE INDEX IF NOT EXISTS flow_executions_jid_idx    ON public.flow_executions(contact_jid);
CREATE INDEX IF NOT EXISTS flow_executions_status_idx ON public.flow_executions(status);
CREATE INDEX IF NOT EXISTS flow_executions_waiting_idx
  ON public.flow_executions(contact_jid, status) WHERE status = 'waiting_reply';

-- Contatos (espelho local p/ detectar primeiro contato e guardar tags).
CREATE TABLE IF NOT EXISTS public.contacts (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references auth.users(id) on delete cascade,
  jid             text not null,
  name            text,
  phone           text,
  tags            text[] default '{}',
  first_seen_at   timestamptz default now(),
  last_message_at timestamptz
);

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS tags            text[] default '{}',
  ADD COLUMN IF NOT EXISTS first_seen_at   timestamptz default now(),
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz;

CREATE INDEX IF NOT EXISTS contacts_jid_idx     ON public.contacts(jid);
CREATE INDEX IF NOT EXISTS contacts_user_id_idx ON public.contacts(user_id);

-- RLS: o frontend só enxerga as próprias linhas.
-- O servidor (flowEngine) usa a SERVICE ROLE KEY, que ignora RLS — por isso o
-- motor consegue ler funis ativos e escrever execuções de qualquer usuário.
ALTER TABLE public.flow_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "flow_executions_own" ON public.flow_executions;
CREATE POLICY "flow_executions_own" ON public.flow_executions
  FOR ALL USING (
    flow_id IN (SELECT id FROM public.flows WHERE user_id = auth.uid())
  );

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contacts_own" ON public.contacts;
CREATE POLICY "contacts_own" ON public.contacts
  FOR ALL USING (auth.uid() = user_id);

-- Verificação
SELECT 'flow_executions' AS tabela, count(*) FROM public.flow_executions
UNION ALL
SELECT 'contacts', count(*) FROM public.contacts;
