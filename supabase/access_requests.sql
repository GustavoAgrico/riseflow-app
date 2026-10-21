-- Solicitações de acesso a plano (aprovadas/recusadas pelo admin por link).
-- Rode no Supabase > SQL Editor. Idempotente.
CREATE TABLE IF NOT EXISTS access_requests (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  name        text,
  phone       text,
  plan_id     text NOT NULL,
  plan_name   text NOT NULL,
  price_cents integer NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  token       text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  decided_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_access_requests_user ON access_requests(user_id, created_at DESC);

-- Só o servidor (service role) lê/escreve: o token de aprovação não pode vazar ao cliente.
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;
