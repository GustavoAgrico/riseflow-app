-- Rodar no Supabase Dashboard > SQL Editor
-- Adiciona as colunas do pipeline do CRM à tabela clients (sincroniza CRM <-> Funil).
-- A coluna `stage` usa os ids do pipeline: lead, qual, prop, neg, closed, lost.
-- Idempotente — pode rodar múltiplas vezes sem erro.

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS stage        text DEFAULT 'lead';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS value        numeric DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS company      text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS email        text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS tags         text[] DEFAULT '{}';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS last_message text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS assigned_to  text;

CREATE INDEX IF NOT EXISTS clients_user_created_idx ON public.clients (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS clients_user_phone_idx   ON public.clients (user_id, phone);
CREATE INDEX IF NOT EXISTS clients_user_stage_idx   ON public.clients (user_id, stage);

-- Contatos antigos sem etapa entram como "Novo Lead"
UPDATE public.clients SET stage = 'lead' WHERE stage IS NULL;
