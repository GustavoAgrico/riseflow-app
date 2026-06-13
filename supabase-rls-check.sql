-- ── RLS status check ──────────────────────────────────────────────────
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ── Enable RLS on all tables (run if rowsecurity = false) ─────────────
ALTER TABLE public.profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flows      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- ── Example RLS policies (adapt to your schema) ───────────────────────

-- profiles: users can only read/write their own row
CREATE POLICY "profiles_own" ON public.profiles
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- flows: user owns their flows
CREATE POLICY "flows_own" ON public.flows
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- clients: user owns their clients
CREATE POLICY "clients_own" ON public.clients
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- integrations: user owns their integrations
CREATE POLICY "integrations_own" ON public.integrations
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
