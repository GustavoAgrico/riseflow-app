-- ── Chat tables for RiseFlow ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.conversations (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  contact_name      text NOT NULL,
  contact_phone     text NOT NULL,
  contact_channel   text DEFAULT 'whatsapp',
  last_message      text,
  last_message_at   timestamptz DEFAULT now(),
  unread_count      integer DEFAULT 0,
  status            text DEFAULT 'active',
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id   uuid REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  user_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content           text NOT NULL,
  direction         text DEFAULT 'inbound',  -- 'inbound' | 'outbound'
  status            text DEFAULT 'sent',     -- 'sending' | 'sent' | 'delivered' | 'read' | 'error'
  channel           text DEFAULT 'whatsapp',
  external_id       text,                    -- Evolution API message ID
  created_at        timestamptz DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS conversations_last_message_at_idx ON public.conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS messages_user_id_idx ON public.messages(user_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON public.messages(created_at);

-- ── Row Level Security ─────────────────────────────────────────────────
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_own" ON public.conversations;
CREATE POLICY "conversations_own" ON public.conversations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "messages_own" ON public.messages;
CREATE POLICY "messages_own" ON public.messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Enable Realtime ────────────────────────────────────────────────────
-- Run in Supabase Dashboard → Database → Replication:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

-- ── Sample data (replace 'YOUR-USER-ID' with your actual auth.users id) ─
-- INSERT INTO public.conversations (user_id, contact_name, contact_phone, contact_channel, last_message, last_message_at, unread_count)
-- VALUES
--   ('YOUR-USER-ID', 'Ana Paula Silva',  '5511999990001', 'whatsapp',  'Oi! Vi o produto no Instagram',        now() - interval '10 minutes', 3),
--   ('YOUR-USER-ID', 'Carlos Eduardo',   '5521999990002', 'whatsapp',  'Quando chega meu pedido?',              now() - interval '45 minutes', 1),
--   ('YOUR-USER-ID', 'Marina Rodrigues', '5531999990003', 'instagram', 'Obrigada pelo atendimento!',            now() - interval '2 hours',    0),
--   ('YOUR-USER-ID', 'Roberto Santos',   '5541999990004', 'whatsapp',  'Quero saber mais sobre o plano Pro',    now() - interval '3 hours',    2);
