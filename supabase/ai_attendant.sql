-- ═══════════════════════════════════════════════════════════════════════════
-- RiseFlow — IA Attendant: tabelas e migração (2026-07-27)
-- ───────────────────────────────────────────────────────────────────────────
-- Rodar no Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Adicionar colunas gemini_key e groq_key à settings (idempotente)
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS gemini_key    text,
  ADD COLUMN IF NOT EXISTS groq_key      text;

-- 2) Configuração do atendente inteligente (uma por usuário)
CREATE TABLE IF NOT EXISTS public.attendant_config (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled            boolean     DEFAULT false,
  company_name       text        DEFAULT 'Minha Empresa',
  personality        text        DEFAULT 'Você é um atendente profissional e simpático.',
  business_hours     text        DEFAULT '08:00-18:00 Seg-Sex',
  custom_rules       text        DEFAULT '',
  no_answer_action   text        DEFAULT 'transfer', -- 'transfer' | 'check'
  respond_groups     boolean     DEFAULT false,
  max_auto_messages  int         DEFAULT 10,
  response_delay     int         DEFAULT 2,          -- segundos (simula digitação)
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS attendant_config_user_idx ON public.attendant_config (user_id);
CREATE INDEX IF NOT EXISTS attendant_config_enabled_idx ON public.attendant_config (enabled) WHERE enabled = true;
ALTER TABLE public.attendant_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attendant_config_own" ON public.attendant_config;
CREATE POLICY "attendant_config_own" ON public.attendant_config
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3) Base de conhecimento (FAQs para o atendente)
CREATE TABLE IF NOT EXISTS public.knowledge_base (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question   text        NOT NULL,
  answer     text        NOT NULL,
  category   text        DEFAULT 'Geral',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_base_user_idx ON public.knowledge_base (user_id);
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "knowledge_base_own" ON public.knowledge_base;
CREATE POLICY "knowledge_base_own" ON public.knowledge_base
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4) Criar config padrão HABILITADA para o usuário existente
--    (single-tenant: usa o primeiro usuário do auth.users)
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.attendant_config (user_id, enabled, company_name, personality)
    VALUES (
      v_user_id,
      true,
      'RiseFlow',
      'Você é um atendente virtual simpático e profissional. Responda de forma clara e objetiva.'
    )
    ON CONFLICT (user_id) DO UPDATE
      SET enabled = true;
    RAISE NOTICE 'attendant_config habilitado para user_id: %', v_user_id;
  ELSE
    RAISE NOTICE 'Nenhum usuário encontrado em auth.users';
  END IF;
END $$;

-- 5) Verificação
SELECT 'attendant_config' as tabela, count(*) as total FROM public.attendant_config
UNION ALL
SELECT 'attendant_config enabled', count(*) FROM public.attendant_config WHERE enabled = true
UNION ALL
SELECT 'knowledge_base', count(*) FROM public.knowledge_base;
