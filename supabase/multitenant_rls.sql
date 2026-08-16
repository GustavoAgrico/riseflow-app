-- ============================================================================
-- RiseFlow · ETAPA 1 — Isolamento de dados multi-tenant (RLS)
-- ----------------------------------------------------------------------------
-- COMO RODAR: Supabase Dashboard → SQL Editor → New query → cole tudo → Run.
-- É IDEMPOTENTE: pode rodar de novo sem erro. Tabelas inexistentes são puladas.
--
-- PRINCÍPIO: cada linha pertence a um usuário. O frontend usa a ANON key + JWT
-- do usuário → RLS SE APLICA (isolamento). O servidor (proxy/flowEngine) usa a
-- SERVICE ROLE key → IGNORA RLS de propósito (webhook/automação). Ou seja:
-- ligar o RLS NÃO quebra o backend; ele afeta só a leitura direta do frontend.
--
-- ⚠️ RODE A SEÇÃO 1 PRIMEIRO. Linhas com user_id NULL ficam INVISÍVEIS quando o
--    RLS liga. Se a Seção 1d acusar órfãs em tabelas que o frontend lê
--    (conversations/messages/clients/…), faça o backfill (Seção 4) ANTES de ligar.
--
-- ⚠️ EQUIPE: as policies abaixo isolam por DONO (auth.uid() = user_id). Se você
--    usa MEMBROS DE EQUIPE que logam e leem os dados do dono pelo frontend,
--    rode também a SEÇÃO 6 (opcional) depois — senão os membros não enxergam os
--    dados do dono. Na fase de teste (só admin), pode ignorar a Seção 6.
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
SELECT tablename, policyname, cmd
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 1d) PROCURAR LINHAS ÓRFÃS (user_id NULL) — essas somem ao ligar RLS!
--     Confira as contagens. Em tabelas que o FRONTEND lê, backfille antes (Seção 4).
--     (contacts costuma ter órfãs — o flowEngine grava sem user_id — mas o
--      frontend NÃO lê contacts, então não atrapalha.)
DO $$
DECLARE t text; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'conversations','messages','clients','contacts','flows','integrations',
    'campaigns','settings','usage','activity_logs','notes','niche_config',
    'lead_scores','attendant_config','knowledge_base','user_preferences',
    'templates','schedules','team_queues','team_members'
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
-- (profiles e team_members são tratados à parte — ver 2b e 2c.)
-- ============================================================================
DO $$
DECLARE t text; pol text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'conversations',     -- chat (cabeçalho)
    'messages',          -- chat (mensagens)
    'clients',           -- CRM / contatos comerciais
    'contacts',          -- espelho de contatos (server-only; frontend não lê)
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
    'knowledge_base',    -- base de conhecimento (FAQ)
    'user_preferences',  -- onboarding / preferências
    'templates',         -- modelos de mensagem
    'schedules',         -- agendamentos
    'team_queues'        -- filas de atendimento
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

-- 2b) profiles — chaveada por id (é o próprio usuário), NÃO tem user_id.
DO $$ BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "profiles_own" ON public.profiles;
    CREATE POLICY "profiles_own" ON public.profiles FOR ALL
      USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
    RAISE NOTICE 'RLS aplicado: profiles';
  END IF;
END $$;

-- 2c) team_members — o DONO gerencia a equipe; o MEMBRO enxerga só a própria
--     linha (pelo email logado). Escrita (insert/update) só o dono.
DO $$ BEGIN
  IF to_regclass('public.team_members') IS NOT NULL THEN
    ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "team_members_own" ON public.team_members;
    CREATE POLICY "team_members_own" ON public.team_members FOR ALL
      USING      (auth.uid() = user_id OR email = auth.email())
      WITH CHECK (auth.uid() = user_id);
    RAISE NOTICE 'RLS aplicado: team_members';
  END IF;
END $$;


-- ============================================================================
-- SEÇÃO 3 · TABELAS FILHAS (sem user_id próprio) — isolam via tabela-pai
-- ----------------------------------------------------------------------------
-- flow_executions   → pertence ao dono do flow (flow_id → flows.user_id)
-- campaign_messages → pertence ao dono da campanha (campaign_id → campaigns.user_id)
-- ============================================================================
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
-- SEÇÃO 4 · BACKFILL de linhas órfãs
-- ----------------------------------------------------------------------------
-- Diagnóstico de 2026-08-13 no banco de produção: apenas `contacts` tinha
-- órfãs (7 de 7, gravadas pelo flowEngine sem user_id). Como `contacts` é
-- server-only (o frontend NÃO a lê), isso não quebra o app — mas convém
-- taggear ao dono para higiene e para o futuro isolamento de contatos.
--
-- Ambiente é single-tenant (1 usuário). Backfill dos contatos órfãos ao dono:
UPDATE public.contacts
   SET user_id = 'cca5eba3-a63c-4b61-b311-34cc4d2e1364'
 WHERE user_id IS NULL;
--
-- (A causa raiz foi corrigida no código: upsertContact agora grava user_id.)
-- Se no futuro houver órfãs em tabelas que o frontend LÊ, use estes padrões:
-- UPDATE public.clients  SET user_id = 'UUID-DO-DONO' WHERE user_id IS NULL;
-- UPDATE public.messages SET user_id = (SELECT c.user_id FROM public.conversations c
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


-- ============================================================================
-- SEÇÃO 6 · (OPCIONAL) ACESSO DE EQUIPE aos dados do dono
-- ----------------------------------------------------------------------------
-- POR PADRÃO NÃO RODE. Rode SÓ quando membros de equipe forem ao ar e
-- precisarem LER os dados do dono pelo frontend (chat, CRM, etc.).
-- Cria um helper e AMPLIA as policies para "dono OU membro da conta".
-- O helper é SECURITY DEFINER (lê team_members ignorando RLS → sem recursão).
--
-- Para ativar: descomente TODO o bloco abaixo e rode.
-- ============================================================================
/*
create or replace function public.has_account_access(owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select owner = auth.uid()
      or exists (select 1 from public.team_members tm
                 where tm.user_id = owner and tm.email = auth.email());
$$;

-- Amplia as policies das tabelas de DADOS COMPARTILHADOS (dono OU membro).
-- (Deixe de fora settings/usage/user_preferences se quiser que fiquem só do dono.)
DO $$
DECLARE t text; pol text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'conversations','messages','clients','contacts','flows','campaigns',
    'activity_logs','notes','niche_config','lead_scores','attendant_config',
    'knowledge_base','templates','schedules','team_queues'
  ] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      pol := t || '_own';
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL '
        || 'USING (public.has_account_access(user_id)) '
        || 'WITH CHECK (public.has_account_access(user_id))',
        pol, t);
    END IF;
  END LOOP;
END $$;
*/
