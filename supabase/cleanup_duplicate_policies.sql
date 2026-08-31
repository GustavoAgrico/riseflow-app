-- ============================================================================
-- RiseFlow · LIMPEZA de policies RLS duplicadas
-- ----------------------------------------------------------------------------
-- COMO RODAR: Supabase Dashboard → SQL Editor → New query → cole tudo → Run.
-- É IDEMPOTENTE e SEGURO: mantém a policy canônica que dá o acesso correto
-- (dono OU membro, criada por team_access_rls.sql) e remove as ANTIGAS de
-- migrações anteriores que ficaram sobrando com nomes diferentes
-- (ex.: "users can manage own clients", "users_own_logs", "conversations_member_read").
--
-- Por que é seguro: policies são PERMISSIVAS (combinam com OU). A canônica
-- "<tabela>_own" já cobre dono e membro; as antigas eram só-dono (subconjunto),
-- então removê-las NÃO tira acesso de ninguém — só elimina a duplicação.
--
-- PRÉ-REQUISITO: rode ANTES o multitenant_rls.sql e o team_access_rls.sql
-- (eles criam as policies canônicas "<tabela>_own" e as "_team_read").
-- ============================================================================

-- ── 1) Tabelas de DADOS COMPARTILHADOS: manter só "<tabela>_own" ─────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(ARRAY[
        'conversations','messages','clients','contacts','flows','campaigns',
        'activity_logs','notes','niche_config','lead_scores','attendant_config',
        'knowledge_base','templates','schedules','team_queues',
        'flow_executions','campaign_messages'
      ])
      AND policyname <> tablename || '_own'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'removida (duplicada): % em %', r.policyname, r.tablename;
  END LOOP;
END $$;

-- ── 2) integrations e usage: manter "<tabela>_own" + "<tabela>_team_read" ────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(ARRAY['integrations','usage'])
      AND policyname NOT IN (tablename || '_own', tablename || '_team_read')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'removida (duplicada): % em %', r.policyname, r.tablename;
  END LOOP;
END $$;

-- settings / user_preferences / profiles: NÃO tocamos (seguem só do dono).

-- ── 3) VERIFICAÇÃO — deve sobrar 1 policy por tabela (2 em integrations/usage) ─
SELECT tablename, count(*) AS policies, string_agg(policyname, ', ' ORDER BY policyname) AS nomes
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
