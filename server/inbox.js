// Espelho de mensagens RECEBIDAS em conversations/messages — compartilhado
// pelos canais que persistem no próprio proxy (Telegram, Meta). O WhatsApp é
// persistido pela Edge Function; as ENVIADAS são espelhadas pelo
// flowEngine.saveSentMessage (mesmo shape).
const { supabase, isConfigured } = require('./supabaseClient')

const nowIso = () => new Date().toISOString()

async function saveIncomingMessage({ userId, phone, name, text, channel = 'chat' }) {
  if (!isConfigured || !userId || !text) return
  try {
    const { data: conv } = await supabase.from('conversations').upsert({
      user_id: userId,
      contact_phone: phone,
      contact_name: name || phone,
      last_message: text,
      last_message_at: nowIso(),
      updated_at: nowIso(),
    }, { onConflict: 'user_id,contact_phone' }).select('id').single()
    await supabase.from('messages').insert({
      user_id: userId,
      conversation_id: conv?.id,
      contact_phone: phone,
      content: text,
      direction: 'inbound',
      type: 'text',
      external_id: `${channel}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'delivered',
      read: false,
      created_at: nowIso(),
    })
  } catch (e) {
    console.warn(`[${channel}] não espelhou msg recebida:`, e?.message ?? e)
  }
}

module.exports = { saveIncomingMessage }
