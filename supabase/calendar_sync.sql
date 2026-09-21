-- Migração: sincronização de calendário + push notifications
-- Rodar manualmente no dashboard do Supabase.

-- 1. Coluna calendar_token na tabela settings (para feed iCal por URL)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS calendar_token text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_calendar_token ON settings (calendar_token) WHERE calendar_token IS NOT NULL;

-- 2. Tabela push_subscriptions (Web Push API)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  keys_p256dh text,
  keys_auth text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_own" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions (user_id);
