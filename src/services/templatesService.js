// Serviço de templates de mensagem. SQL da tabela: supabase/templates.sql
// Usado pela página /templates e pelo seletor de templates no Chat.
import { supabase } from '@/lib/supabase'

// Linha do banco → formato usado na UI.
export const mapTemplate = r => ({
  id: r.id, name: r.name || '', cat: r.category || 'Saudação', type: r.type || 'Texto',
  msg: r.msg || '', media: r.media_url || '', opts: r.options || '', uses: r.uses || 0,
})

export const listTemplates = async (userId) => {
  if (!userId) return []
  const { data } = await supabase.from('templates').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  return (data ?? []).map(mapTemplate)
}

export const createTemplate = (userId, t) =>
  supabase.from('templates').insert({
    user_id: userId, name: t.name, category: t.cat, type: t.type,
    msg: t.msg, media_url: t.media || null, options: t.opts || null,
  }).select().single()

export const updateTemplate = (id, t) =>
  supabase.from('templates').update({
    name: t.name, category: t.cat, type: t.type,
    msg: t.msg, media_url: t.media || null, options: t.opts || null,
  }).eq('id', id)

export const deleteTemplate = (id) => supabase.from('templates').delete().eq('id', id)

export const incrementTemplateUse = (id, current = 0) =>
  supabase.from('templates').update({ uses: (current || 0) + 1 }).eq('id', id)
