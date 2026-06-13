import { supabase } from '@/lib/supabase'

export const notesService = {
  async getNotes(contactId) {
    const { data, error } = await supabase.from('notes').select('*').eq('contact_id', contactId).order('pinned', { ascending: false }).order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },
  async addNote(userId, contactId, content, type = 'note') {
    const { data, error } = await supabase.from('notes').insert({ user_id: userId, contact_id: contactId, content, type }).select().single()
    if (error) throw error
    try { await supabase.from('notes').insert({ user_id: userId, contact_id: contactId, content: 'Nota adicionada: ' + content.slice(0, 50), type: 'activity' }) } catch (e) { console.warn('[Notes] atividade não registrada:', e?.message ?? e) }
    return data
  },
  async updateNote(noteId, content) {
    const { error } = await supabase.from('notes').update({ content, updated_at: new Date().toISOString() }).eq('id', noteId)
    if (error) throw error
  },
  async deleteNote(noteId) {
    const { error } = await supabase.from('notes').delete().eq('id', noteId)
    if (error) throw error
  },
  async togglePin(noteId, pinned) {
    const { error } = await supabase.from('notes').update({ pinned: !pinned }).eq('id', noteId)
    if (error) throw error
  }
}
