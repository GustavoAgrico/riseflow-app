-- ============================================================================
-- RiseFlow · ETAPA 1 — Isolamento de dados multi-tenant (RLS)
-- ----------------------------------------------------------------------------
-- COMO RODAR: Supabase Dashboard → SQL Editor → New query → cole tudo → Run.
-- É IDEMPOTENTE: pode rodar de novo sem erro. Tabelas inexistentes são puladas.
--
-- PRINCÍPIO: cada linha pertence a um usuário (user_id = auth.uid()).
--   - Frontend usa a ANON key + JWT do usuário  → RLS SE APLICA (isolamento).
--   - Servidor (proxy/flowEngine) usa a SERVICE ROLE key → IGNORA RLS de
--     propósito, para escrever em nome de qualquer usuário (webhook/automação).
--
-- ⚠️ ANTES DE LIGAR: rode a SEÇÃO 1 (diagnóstico). Linhas com user_id NULL
--    ficam INVISÍVEIS quando o RLS liga. Faça o backfill (SEÇÃO 4) antes.
-- ============================================================================


-- ============================================================================
-- SEÇÃO 1 · DIAGNÓSTICO (só leitura — rode primeiro e leia o resultado)
-- ============================================================================

-- 1a) Quais tabelas têm RLS ligado hoje?
SELECT tablename, rowsecurity AS rls_ligado
FROM pg_tables WHERE schemaname = 'public'
ORDER BY tablename;

-- 1b) Quais tabelas têm a coluna user_id (isolamento direto)?
SELECT table_name
FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'user_id'
ORDER BY table_name;

-- 1c) Políticas existentes (para ver o que já está aplicado)
SELECT tablename, policyname, cmd, qual
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 1d) PROCURAR LINHAS ÓRFÃS (user_id NULL) — essas somem ao ligar RLS!
--     Rode este bloco e confira que todas as contagens são 0 antes de aplicar.
DO $$
DECLARE t text; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','conversations','messages','clients','contacts','flows',
    'integrations','campaigns','settings','usage','activity_logs','notes',
    'niche_config','lead_scores','attendant_config','knowledge_base','user_preferences'
  ] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id IS NULL', t) INTO n;
      IF n > 0 THEN RAISE NOTICE 'ÓRFÃS em %: % linha(s) com user_id NULL', t, n; END IF;
    END IF;
  END LOOP;
END $$;


-- ============================================================================
-- SEÇÃO 2 · LIGAR RLS + POLÍTICA "dono" — tabelas com user_id DIRETO
-- ----------------------------------------------------------------------------
-- Para cada tabela: habilita RLS e cria a policy FOR ALL
--   USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id).
-- O loop pula tabelas que não existem no seu banco (RAISE NOTICE).
-- ============================================================================
DO $$
DECLARE t text; pol text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles',          -- perfil do usuário
    'conversations',     -- chat (cabeçalho)
    'messages',          -- chat (mensagens)
    'clients',           -- CRM / contatos comerciais
    'contacts',          -- espelho de contatos do WhatsApp
    'flows',             -- funis
    'integrations',      -- conexões (WhatsApp/IG/FB/Email/Telegram/AI)
    'campaigns',         -- campanhas de disparo
    'settings',          -- chaves de API por usuário
    'usage',             -- uso / limites de plano
    'activity_logs',     -- auditoria
    'notes',             -- anotações por contato
    'niche_config',      -- config de nicho / qualificação
    'lead_scores',       -- pontuação de leads
    'attendant_config',  -- config do atendente IA
    'knowledge_base',    -- base de conhecimento (FAQ) do atendente
    'user_preferences'   -- onboarding / preferências
  ] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      pol := t || '_own';
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL '
        || 'USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
        pol, t);
      RAISE NOTICE 'RLS aplicado: %', t;
    ELSE
      RAISE NOTICE 'tabela % nao existe — pulada', t;
    END IF;
  END LOOP;
END $$;


-- ============================================================================
-- SEÇÃO 3 · TABELAS FILHAS (sem user_id próprio) — isolam via tabela-pai
-- ----------------------------------------------------------------------------
-- flow_executions  → pertence ao dono do flow (flow_id → flows.user_id)
-- campaign_messages → pertence ao dono da campanha (campaign_id → campaigns.user_id)
-- ============================================================================

-- flow_executions
DO $$ BEGIN
  IF to_regclass('public.flow_executions') IS NOT NULL THEN
    ALTER TABLE public.flow_executions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "flow_executions_own" ON public.flow_executions;
    CREATE POLICY "flow_executions_own" ON public.flow_executions FOR ALL
      USING      (flow_id IN (SELECT id FROM public.flows WHERE user_id = auth.uid()))
      WITH CHECK (flow_id IN (SELECT id FROM public.flows WHERE user_id = auth.uid()));
    RAISE NOTICE 'RLS aplicado: flow_executions';
  END IF;
END $$;

-- campaign_messages
DO $$ BEGIN
  IF to_regclass('public.campaign_messages') IS NOT NULL THEN
    ALTER TABLE public.campaign_messages ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "campaign_messages_own" ON public.campaign_messages;
    CREATE POLICY "campaign_messages_own" ON public.campaign_messages FOR ALL
      USING      (campaign_id IN (SELECT id FROM public.campaigns WHERE user_id = auth.uid()))
      WITH CHECK (campaign_id IN (SELECT id FROM public.campaigns WHERE user_id = auth.uid()));
    RAISE NOTICE 'RLS aplicado: campaign_messages';
  END IF;
END $$;


-- ============================================================================
-- SEÇÃO 4 · (OPCIONAL) BACKFILL de linhas órfãs
-- ----------------------------------------------------------------------------
-- Só rode se a SEÇÃO 1d acusou linhas com user_id NULL E você sabe a quem
-- pertencem. Exemplo (DESCOMENTE e ajuste o UUID do dono):
--
-- UPDATE public.clients  SET user_id = 'UUID-DO-DONO' WHERE user_id IS NULL;
-- UPDATE public.messages SET user_id = (SELECT user_id FROM public.conversations c
--                                       WHERE c.id = messages.conversation_id)
--   WHERE user_id IS NULL;
-- ============================================================================


-- ============================================================================
-- SEÇÃO 5 · VERIFICAÇÃO FINAL (rode depois — confirme o resultado)
-- ============================================================================
SELECT tablename, rowsecurity AS rls_ligado
FROM pg_tables WHERE schemaname = 'public'
ORDER BY rls_ligado, tablename;          -- as com false aparecem primeiro

SELECT tablename, policyname, cmd
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, policyname;
