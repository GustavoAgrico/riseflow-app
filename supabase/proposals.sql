-- Tabela de propostas / orçamentos
CREATE TABLE IF NOT EXISTS proposals (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  client_name text,
  value       numeric DEFAULT 0,
  status      text DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected')),
  valid_until date,
  items       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposals_user ON proposals(user_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(user_id, status);

ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY proposals_owner ON proposals
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
