-- ── Run this in Supabase Dashboard → SQL Editor ───────────────────────

-- 1. Unique constraint for conversation upsert (user + phone)
--    (Postgres não suporta IF NOT EXISTS em ADD CONSTRAINT; usamos DO/EXCEPTION)
DO $$ BEGIN
  ALTER TABLE public.conversations
    ADD CONSTRAINT conversations_user_phone_unique UNIQUE (user_id, contact_phone);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

-- 2. Unique index for message dedup (external_id from Evolution API)
--    Partial index: only applies when external_id is not null
CREATE UNIQUE INDEX IF NOT EXISTS messages_external_id_uidx
  ON public.messages (external_id)
  WHERE external_id IS NOT NULL;

-- 3. Enable Realtime for both tables
--    (Run these separately if they fail due to publication already existing)
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
