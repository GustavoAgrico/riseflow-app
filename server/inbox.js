// Espelho de mensagens RECEBIDAS em conversations/messages — compartilhado
// pelos canais que persistem no próprio proxy (Telegram, Meta). O WhatsApp é
// persistido pela Edge Function; as ENVIADAS são espelhadas pelo
// flowEngine.saveSentMessage (mesmo shape).
const { supabase, isConfigured } = require('./supabaseClient')

const nowIso = () => new Date().toISOString()

async function saveIncomingMessage({ userId, phone, name, text, channel = 'chat', mediaUrl = null, type = 'text' }) {
  if (!isConfigured || !userId || (!text && !mediaUrl)) return
  const mediaType = mediaUrl && ['image', 'audio', 'video', 'document'].includes(type) ? type : 'text'
  const preview = text || (mediaType === 'image' ? '📷 Imagem' : mediaType === 'audio' ? '🎵 Áudio' : mediaType === 'video' ? '🎬 Vídeo' : mediaType === 'document' ? '📄 Documento' : '')
  try {
    const { data: conv } = await supabase.from('conversations').upsert({
      user_id: userId,
      contact_phone: phone,
      contact_name: name || phone,
      last_message: preview,
      last_message_at: nowIso(),
      updated_at: nowIso(),
    }, { onConflict: 'user_id,contact_phone' }).select('id').single()
    await supabase.from('messages').insert({
      user_id: userId,
      conversation_id: conv?.id,
      contact_phone: phone,
      content: preview,
      direction: 'inbound',
      type: mediaType,
      media_url: mediaUrl || null,
      external_id: `${channel}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'delivered',
      read: false,
      created_at: nowIso(),
    })
  } catch (e) {
    console.warn(`[${channel}] não espelhou msg recebida:`, e?.message ?? e)
  }
  // Piloto de Vendas: ficha, nota de intenção e organização do lead (não responde ao cliente).
  // Carregado aqui dentro para evitar dependência circular; nunca derruba o recebimento.
  if (text) {
    require('./sales/pilot').onInbound({ userId, phone, name, text, channel: channel === 'chat' ? 'whatsapp' : channel })
      .catch((err) => console.warn('[piloto-vendas]', err?.message ?? err))
  }
}

// ── Histórico do pareamento ───────────────────────────────────────────────────
// O celular manda as conversas recentes logo após escanear o QR. Viram conversas e
// mensagens no Chat SEM acionar IA, funis, Piloto de Vendas ou notificações (é passado).
// Sem duplicar: external_id = wa-<id da mensagem>. Não sobrescreve conversa mais nova.
const LABEL = { image: '📷 Imagem', audio: '🎵 Áudio', video: '🎬 Vídeo', document: '📄 Documento' }
const digitsOf = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')

function groupHistory(messages) {
  const byPhone = new Map()
  for (const m of messages || []) {
    const phone = digitsOf(m.jid)
    if (phone.length < 8 || !m.id || !m.timestamp) continue
    const content = m.text || LABEL[m.messageType] || ''
    if (!content) continue
    const list = byPhone.get(phone) || []
    list.push({ ...m, phone, content, at: new Date(Number(m.timestamp) * 1000).toISOString() })
    byPhone.set(phone, list)
  }
  for (const list of byPhone.values()) list.sort((a, b) => a.at.localeCompare(b.at))
  return byPhone
}

async function importHistory({ userId, messages }) {
  if (!isConfigured || !userId) return { conversations: 0, messages: 0 }
  const byPhone = groupHistory(messages)
  if (!byPhone.size) return { conversations: 0, messages: 0 }
  const phones = [...byPhone.keys()]

  const { data: existing } = await supabase.from('conversations').select('id, contact_phone, contact_name, last_message_at')
    .eq('user_id', userId).in('contact_phone', phones)
  const convByPhone = new Map((existing || []).map(c => [c.contact_phone, c]))

  let newConvs = 0
  for (const [phone, list] of byPhone) {
    const last = list[list.length - 1]
    const name = list.find(m => m.name)?.name || list.find(m => !m.fromMe && m.pushName)?.pushName || null
    const conv = convByPhone.get(phone)
    if (!conv) {
      const { data, error } = await supabase.from('conversations').insert({
        user_id: userId, contact_phone: phone, contact_name: name || phone,
        last_message: last.content.slice(0, 500), last_message_at: last.at, updated_at: nowIso(), unread_count: 0,
      }).select('id, contact_phone, contact_name, last_message_at').single()
      if (error) {
        // Corrida com uma mensagem ao vivo criando a mesma conversa: relê.
        const { data: again } = await supabase.from('conversations').select('id, contact_phone, contact_name, last_message_at').eq('user_id', userId).eq('contact_phone', phone).maybeSingle()
        if (again) convByPhone.set(phone, again)
        continue
      }
      convByPhone.set(phone, data); newConvs += 1
    } else {
      const patch = {}
      if (!conv.last_message_at || last.at > conv.last_message_at) Object.assign(patch, { last_message: last.content.slice(0, 500), last_message_at: last.at })
      if (name && (!conv.contact_name || /^\+?\d+$/.test(conv.contact_name))) patch.contact_name = name
      if (Object.keys(patch).length) await supabase.from('conversations').update(patch).eq('id', conv.id).eq('user_id', userId)
    }
  }

  // Mensagens que ainda não existem (pelo id do WhatsApp).
  const all = [...byPhone.values()].flat()
  const ids = all.map(m => `wa-${m.id}`)
  const have = new Set()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('messages').select('external_id').eq('user_id', userId).in('external_id', ids.slice(i, i + 200))
    for (const r of data || []) have.add(r.external_id)
  }
  const rows = all.filter(m => !have.has(`wa-${m.id}`) && convByPhone.get(m.phone)).map(m => ({
    user_id: userId, conversation_id: convByPhone.get(m.phone).id, contact_phone: m.phone,
    content: m.content.slice(0, 4000), direction: m.fromMe ? 'outbound' : 'inbound',
    type: m.messageType && m.messageType !== 'text' ? m.messageType : 'text',
    external_id: `wa-${m.id}`, status: m.fromMe ? 'sent' : 'delivered', read: true, created_at: m.at,
  }))
  let inserted = 0
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('messages').insert(rows.slice(i, i + 500))
    if (error) { console.warn('[history] falha ao gravar mensagens:', error.message); break }
    inserted += Math.min(500, rows.length - i)
  }
  return { conversations: byPhone.size, newConversations: newConvs, messages: inserted }
}

module.exports = { saveIncomingMessage, importHistory, groupHistory }
