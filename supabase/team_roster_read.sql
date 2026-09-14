-- ============================================================================
-- RiseFlow · Cargos que dão acesso — LEITURA do roster pelos membros
-- ----------------------------------------------------------------------------
-- COMO RODAR: Supabase Dashboard → SQL Editor → New query → cole tudo → Run.
-- É IDEMPOTENTE: pode rodar de novo sem erro.
--
-- PRÉ-REQUISITO: rode ANTES o supabase/team_access_rls.sql (cria o helper
-- has_account_access(owner)).
--
-- O QUE FAZ: permite que um MEMBRO da conta (Admin/Supervisor) LEIA a lista de
-- membros e filas do DONO — para acompanhar a equipe e a presença em tempo real
-- na tela "Equipes". A ESCRITA (adicionar, remover, cargos, filas) continua
-- EXCLUSIVA do dono: a policy "_own" (FOR ALL, auth.uid() = user_id) segue valendo
-- e o Postgres combina as policies de SELECT com OR.
--
-- Sem recursão: has_account_access é SECURITY DEFINER e lê team_members ignorando
-- a RLS por dentro.
-- ============================================================================

-- team_members: membro da conta pode LER o roster do dono
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team_members_team_read" ON public.team_members;
CREATE POLICY "team_members_team_read" ON public.team_members
  FOR SELECT USING (public.has_account_access(user_id));

-- team_queues: idem (o helper aceita dono OU membro). Reforça a leitura mesmo
-- que a policy operacional não esteja aplicada nesta tabela.
ALTER TABLE public.team_queues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team_queues_team_read" ON public.team_queues;
CREATE POLICY "team_queues_team_read" ON public.team_queues
  FOR SELECT USING (public.has_account_access(user_id));

-- Verificação
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('team_members', 'team_queues')
ORDER BY tablename, policyname;
