-- ── Run each block in Supabase Dashboard → SQL Editor ────────────────

-- 1. Check conversations count
SELECT count(*) AS conversations FROM public.conversations;

-- 2. Check messages count
SELECT count(*) AS messages FROM public.messages;

-- 3. Check messages joined with conversations
SELECT m.id, m.content, m.direction, m.created_at, c.contact_name
FROM public.messages m
JOIN public.conversations c ON m.conversation_id = c.id
ORDER BY m.created_at DESC
LIMIT 20;

-- 4. Check RLS policies
SELECT tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('conversations', 'messages')
ORDER BY tablename, policyname;

-- 5. Check if unique index exists (needed for upsert onConflict: 'external_id')
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'messages' AND indexname LIKE '%external%';

-- 6. Create the external_id unique index if missing
CREATE UNIQUE INDEX IF NOT EXISTS messages_external_id_uidx
  ON public.messages (external_id)
  WHERE external_id IS NOT NULL;

-- 7. Insert a test message (replace UUID values with real ones from step 3)
-- First get a real conversation_id and user_id:
SELECT id AS conversation_id, user_id FROM public.conversations LIMIT 1;

-- Then insert:
-- INSERT INTO public.messages (conversation_id, user_id, content, direction, status)
-- VALUES ('<conversation_id>', '<user_id>', 'Teste diagnóstico', 'inbound', 'delivered');

-- 8. Verify RLS lets the logged-in user see their own messages
-- (Run in the Supabase "Table Editor" as the authenticated user,
--  or use the anon key with user JWT in the API explorer)
SELECT * FROM public.messages WHERE user_id = auth.uid() LIMIT 5;
