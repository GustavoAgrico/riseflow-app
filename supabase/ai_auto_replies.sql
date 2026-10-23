-- ─────────────────────────────────────────────────────────────────────────
-- RiseFlow · Contador persistente de respostas automáticas da IA (anti-loop)
--
-- COMO RODAR:
--   1. Acesse o Supabase Dashboard → seu projeto.
--   2. Vá em "SQL Editor" → "New query".
--   3. Cole todo este arquivo e clique em "Run".
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_auto_replies (
  user_id uuid references auth.users not null,
  contact_phone text not null,
  count int not null default 0,
  last_at timestamptz not null default now(),
  primary key (user_id, contact_phone)
);

ALTER TABLE ai_auto_replies ENABLE ROW LEVEL SECURITY;

-- Usuário só acessa os próprios contadores (o servidor usa service role e ignora RLS)
DROP POLICY IF EXISTS "users_own_ai_auto_replies" ON ai_auto_replies;
CREATE POLICY "users_own_ai_auto_replies" ON ai_auto_replies FOR ALL USING (auth.uid() = user_id);
