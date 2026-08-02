-- Migration: login de membros da equipe + inbox filtrado
-- Rodar manualmente no Supabase Dashboard → SQL Editor

-- 1. Coluna assigned_to em conversations (nome do atendente responsável)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_to TEXT;

-- 2. Membro pode LER conversas atribuídas a ele
CREATE POLICY "conversations_member_read" ON conversations
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = conversations.user_id
        AND tm.email = auth.email()
        AND conversations.assigned_to = tm.name
    )
  );

-- 3. Membro pode ATUALIZAR conversas atribuídas (last_message, unread_count, etc.)
CREATE POLICY "conversations_member_update" ON conversations
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = conversations.user_id
        AND tm.email = auth.email()
        AND conversations.assigned_to = tm.name
    )
  );

-- 4. Membro pode LER mensagens das suas conversas
CREATE POLICY "messages_member_read" ON messages
  FOR SELECT USING (
    user_id = auth.uid()
    OR conversation_id IN (
      SELECT c.id FROM conversations c
      JOIN team_members tm ON tm.user_id = c.user_id
        AND tm.email = auth.email()
        AND c.assigned_to = tm.name
    )
  );

-- 5. Membro pode INSERIR mensagens (responder)
CREATE POLICY "messages_member_insert" ON messages
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR conversation_id IN (
      SELECT c.id FROM conversations c
      JOIN team_members tm ON tm.user_id = c.user_id
        AND tm.email = auth.email()
        AND c.assigned_to = tm.name
    )
  );
