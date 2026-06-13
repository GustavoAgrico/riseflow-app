-- ─── WhatsApp provider columns em settings ──────────────────────────────────
-- CAUSA RAIZ do "Chat não envia pela Cloud API": estas colunas não existiam,
-- então salvar a config falhava e getWaSettings() sempre caía na Evolution.
-- Rodar UMA VEZ no Supabase Dashboard → SQL Editor. Idempotente.

ALTER TABLE settings ADD COLUMN IF NOT EXISTS wa_provider        text DEFAULT 'evolution';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS wa_phone_number_id text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS wa_access_token    text;

-- Garante que linhas antigas tenham um provider explícito
UPDATE settings SET wa_provider = 'evolution' WHERE wa_provider IS NULL;
