-- ── Run in Supabase Dashboard → SQL Editor ────────────────────────────

-- 1. Add flow_data column to flows table
ALTER TABLE public.flows
  ADD COLUMN IF NOT EXISTS flow_data  jsonb    DEFAULT '{"nodes":[],"edges":[]}',
  ADD COLUMN IF NOT EXISTS channel    text     DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2. Ensure RLS is ON
ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;

-- 3. RLS policy (users own their flows)
DROP POLICY IF EXISTS "flows_own" ON public.flows;
CREATE POLICY "flows_own" ON public.flows
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'flows' AND table_schema = 'public'
ORDER BY ordinal_position;
