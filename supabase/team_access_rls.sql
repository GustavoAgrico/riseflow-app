-- ============================================================================
-- RiseFlow · ETAPA 2 — ACESSO DE EQUIPE aos dados do dono (RLS Section 6)
-- ----------------------------------------------------------------------------
-- COMO RODAR: Supabase Dashboard → SQL Editor → New query → cole tudo → Run.
-- É IDEMPOTENTE: pode rodar de novo sem erro.
--
-- PRÉ-REQUISITO: rode ANTES o supabase/multitenant_rls.sql (Seções 1–5).
--
-- O QUE FAZ: cria o helper has_account_access(owner) e AMPLIA as policies para
-- "dono OU membro da conta". Assim o MEMBRO de equipe (que loga com o próprio
-- e-mail e lê pelo frontend com ownerUserId) enxerga os dados do DONO em tempo
-- real — o mesmo dashboard, chat, CRM, funis, campanhas, agendamentos, etc.
--
-- SEGURANÇA:
--   • Dados operacionais → leitura E escrita para o membro (ele opera a conta).
--   • integrations e usage → SÓ LEITURA para o membro (vê status/plano no
--     dashboard; NÃO altera). Tokens ficam criptografados no banco.
--   • settings e user_preferences → continuam SÓ DO DONO (segredos/API keys e
--     preferências pessoais). O membro nunca lê nem escreve.
--
-- Quem faz "membro"? A tabela team_members: uma linha com user_id = DONO e
-- email = e-mail do membro. O helper casa auth.email() do membro logado.
-- ============================================================================

-- ── Helper: SECURITY DEFINER lê team_members ignorando RLS (sem recursão) ────
create or replace function public.has_account_access(owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select owner = auth.uid()
      or exists (select 1 from public.team_members tm
                 where tm.user_id = owner and tm.email = auth.email());
$$;


-- ── 1) DADOS OPERACIONAIS: dono OU membro (leitura + escrita) ────────────────
-- Substitui a policy "<t>_own" por uma que também aceita membros da conta.
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
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL '
        || 'USING (public.has_account_access(user_id)) '
        || 'WITH CHECK (public.has_account_access(user_id))',
        pol, t);
      RAISE NOTICE 'acesso de equipe (RW): %', t;
    ELSE
      RAISE NOTICE 'tabela % nao existe — pulada', t;
    END IF;
  END LOOP;
END $$;


-- ── 2) TABELAS FILHAS: dono OU membro, via tabela-pai ───────────────────────
DO $$ BEGIN
  IF to_regclass('public.flow_executions') IS NOT NULL THEN
    ALTER TABLE public.flow_executions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "flow_executions_own" ON public.flow_executions;
    CREATE POLICY "flow_executions_own" ON public.flow_executions FOR ALL
      USING      (flow_id IN (SELECT id FROM public.flows WHERE public.has_account_access(user_id)))
      WITH CHECK (flow_id IN (SELECT id FROM public.flows WHERE public.has_account_access(user_id)));
    RAISE NOTICE 'acesso de equipe (RW): flow_executions';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.campaign_messages') IS NOT NULL THEN
    ALTER TABLE public.campaign_messages ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "campaign_messages_own" ON public.campaign_messages;
    CREATE POLICY "campaign_messages_own" ON public.campaign_messages FOR ALL
      USING      (campaign_id IN (SELECT id FROM public.campaigns WHERE public.has_account_access(user_id)))
      WITH CHECK (campaign_id IN (SELECT id FROM public.campaigns WHERE public.has_account_access(user_id)));
    RAISE NOTICE 'acesso de equipe (RW): campaign_messages';
  END IF;
END $$;


-- ── 3) integrations e usage: membro SÓ LÊ (não altera) ──────────────────────
-- Mantém a policy "_own" do dono (FOR ALL) e ADICIONA uma policy de SELECT
-- para membros. No SELECT, o Postgres combina as policies com OR.
DO $$
DECLARE t text; pol text;
BEGIN
  FOREACH t IN ARRAY ARRAY['integrations','usage'] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      pol := t || '_team_read';
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT '
        || 'USING (public.has_account_access(user_id))',
        pol, t);
      RAISE NOTICE 'acesso de equipe (somente leitura): %', t;
    END IF;
  END LOOP;
END $$;

-- settings e user_preferences: NADA aqui de propósito → seguem só do dono.


-- ── 4) VERIFICAÇÃO ──────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, policyname;
