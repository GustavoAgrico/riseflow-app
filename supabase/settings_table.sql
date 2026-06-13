-- ─── Settings table (API keys por usuário) ──────────────────────────────────
-- Rodar no SQL Editor do Supabase Dashboard

CREATE TABLE IF NOT EXISTS settings (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  openai_key         text,
  anthropic_key      text,
  notification_prefs jsonb,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  UNIQUE (user_id)
);

-- Migração para bancos já existentes (idempotente)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS notification_prefs jsonb;

-- Row Level Security
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_own_select"
  ON settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "settings_own_insert"
  ON settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "settings_own_update"
  ON settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "settings_own_delete"
  ON settings FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS settings_updated_at ON settings;
CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_settings_updated_at();

-- Índice para lookup rápido por user_id
CREATE INDEX IF NOT EXISTS settings_user_id_idx ON settings (user_id);
