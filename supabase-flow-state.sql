-- ── Run in Supabase Dashboard → SQL Editor ────────────────────────────
-- Estado do FlowBuilder por conversa (bot 24/7 com sequência stateful).
-- O webhook lê/escreve estas colunas via service role (ignora RLS).

-- 1. Colunas de estado do flow em conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS flow_id      uuid,                 -- flow ativo nesta conversa (null = nenhum)
  ADD COLUMN IF NOT EXISTS flow_node_id text,                 -- id do nó "Aguardar resposta" onde pausou
  ADD COLUMN IF NOT EXISTS flow_vars    jsonb DEFAULT '{}';   -- respostas/variáveis capturadas (uso futuro)

-- 2. Verificação
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'conversations' AND table_schema = 'public'
  AND column_name IN ('flow_id', 'flow_node_id', 'flow_vars')
ORDER BY column_name;
