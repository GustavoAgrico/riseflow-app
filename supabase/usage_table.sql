-- ─────────────────────────────────────────────────────────────────────────
-- RiseFlow · Tabela de uso / limites de plano
--
-- COMO RODAR:
--   1. Acesse o Supabase Dashboard → seu projeto.
--   2. Vá em "SQL Editor" → "New query".
--   3. Cole todo este arquivo e clique em "Run".
--   4. (Opcional) Para popular usuários já existentes que não têm registro:
--        INSERT INTO usage (user_id)
--        SELECT id FROM auth.users
--        ON CONFLICT (user_id) DO NOTHING;
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS usage (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users unique not null,
  plan text default 'free',
  messages_sent int default 0,
  messages_limit int default 50,
  created_at timestamp default now()
);

ALTER TABLE usage ENABLE ROW LEVEL SECURITY;

-- Usuário só acessa o próprio registro
DROP POLICY IF EXISTS "users_own_usage" ON usage;
CREATE POLICY "users_own_usage" ON usage FOR ALL USING (auth.uid() = user_id);

-- Trigger: cria registro automaticamente quando um novo usuário se cadastra
CREATE OR REPLACE FUNCTION create_usage_for_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO usage (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_usage ON auth.users;
CREATE TRIGGER on_auth_user_created_usage
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_usage_for_new_user();
