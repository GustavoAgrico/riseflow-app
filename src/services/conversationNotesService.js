// Notas internas da conversa (tabela conversation_notes — ver supabase/conversation_notes.sql).
// Só o time vê: a nota nunca vai para `messages`, então não é enviada ao
// contato nem entra no histórico que a IA usa.
import { supabase } from '@/lib/supabase'

export const isTableMissing = (e) => /does not exist|schema cache|42P01|PGRST205/i.test(`${e?.message || ''} ${e?.code || ''}`)

export async function listConversationNotes(conversationId) {
  const { data, error } = await supabase.from('conversation_notes')
    .select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function getConversationNote(id) {
  const { data, error } = await supabase.from('conversation_notes').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function addConversationNote({ userId, conversationId, content, authorName, authorMemberId, mentions }) {
  const { data, error } = await supabase.from('conversation_notes').insert({
    user_id: userId,
    conversation_id: conversationId,
    content,
    author_name: authorName || null,
    author_member_id: authorMemberId || null,
    mentions: mentions || [],
  }).select().single()
  if (error) throw error
  return data
}

export async function deleteConversationNote(id) {
  const { error } = await supabase.from('conversation_notes').delete().eq('id', id)
  if (error) throw error
}
