-- ── Run in Supabase Dashboard → SQL Editor ────────────────────────────
-- Tabela `flows` — schema REAL usado pelo app (FlowBuilder/ReactFlow):
--   flow_data jsonb = { nodes, edges }  (NÃO colunas separadas)
--   status text     = 'active' | 'paused'
-- Idempotente: cria se não existir e completa colunas que faltarem.

CREATE TABLE IF NOT EXISTS public.flows (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references auth.users(id) on delete cascade not null,
  name         text not null default 'Novo Funil',
  description  text,
  channel      text default 'whatsapp',
  status       text default 'paused',                          -- 'active' | 'paused'
  -- Builder novo (/flows-novo): colunas separadas nodes/edges
  nodes        jsonb default '[]'::jsonb,
  edges        jsonb default '[]'::jsonb,
  trigger_type text,
  -- Builder antigo (FlowBuilder): mantém flow_data por compatibilidade
  flow_data    jsonb default '{"nodes":[],"edges":[]}'::jsonb, -- { nodes:[...], edges:[...] }
  triggers     integer default 0,                              -- nº de disparos (métricas)
  conversions  integer default 0,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- Caso a tabela já exista sem alguma coluna:
ALTER TABLE public.flows
  ADD COLUMN IF NOT EXISTS description  text,
  ADD COLUMN IF NOT EXISTS channel      text default 'whatsapp',
  ADD COLUMN IF NOT EXISTS status       text default 'paused',
  ADD COLUMN IF NOT EXISTS nodes        jsonb default '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS edges        jsonb default '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS trigger_type text,
  ADD COLUMN IF NOT EXISTS flow_data    jsonb default '{"nodes":[],"edges":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS triggers     integer default 0,
  ADD COLUMN IF NOT EXISTS conversions  integer default 0,
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz default now();

-- RLS: cada usuário só enxerga/edita os próprios flows.
ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "flows_own" ON public.flows;
CREATE POLICY "flows_own" ON public.flows
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS flows_user_id_idx ON public.flows(user_id);
CREATE INDEX IF NOT EXISTS flows_status_idx  ON public.flows(status);

-- Verificação
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'flows' AND table_schema = 'public'
ORDER BY ordinal_position;
