// Cliente mínimo da ElevenLabs Agents Platform para ligações de saída.
// O número Twilio é importado no painel da ElevenLabs (Phone Numbers), então o
// RiseFlow não guarda credencial do Twilio: só a chave da ElevenLabs, o agente e
// o id do número importado.
//   POST /v1/convai/twilio/outbound-call      → inicia a ligação
//   GET  /v1/convai/conversations/:id          → status, transcrição e análise

const BASE = 'https://api.elevenlabs.io/v1/convai'

const cfg = () => ({
  apiKey: process.env.ELEVENLABS_API_KEY || '',
  agentId: process.env.ELEVENLABS_AGENT_ID || '',
  phoneNumberId: process.env.ELEVENLABS_PHONE_NUMBER_ID || '',
})

function isConfigured() {
  const c = cfg()
  return Boolean(c.apiKey && c.agentId && c.phoneNumberId)
}

// Modo teste: se AI_CALLS_TEST_NUMBERS estiver preenchido, só esses números
// (separados por vírgula, formato +55...) podem receber ligação.
function testNumbers() {
  return (process.env.AI_CALLS_TEST_NUMBERS || '')
    .split(',').map(s => s.trim()).filter(Boolean).map(toE164).filter(Boolean)
}

// Telefone do CRM → E.164. Aceita "+55 (24) 99823-1501", "5524998231501" e "24998231501".
function toE164(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return null
  let full = digits
  if (!String(raw).trim().startsWith('+') && (digits.length === 10 || digits.length === 11)) full = '55' + digits
  if (full.length < 12 || full.length > 15) return null
  return '+' + full
}

async function request(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'xi-api-key': cfg().apiKey, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  })
  const text = await res.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = { raw: text } }
  if (!res.ok) {
    const detail = Array.isArray(body?.detail)
      ? body.detail.map(d => `${(d.loc || []).join('.')}: ${d.msg}`).join('; ')
      : (body?.detail?.message || body?.detail || body?.message || text)
    const err = new Error(`ElevenLabs ${res.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
    err.status = res.status
    throw err
  }
  return body
}

// dynamicVariables: valores simples (string/número/boolean) usados como {{nome}} no prompt do agente.
async function startOutboundCall({ toNumber, dynamicVariables = {} }) {
  const c = cfg()
  const vars = Object.fromEntries(
    Object.entries(dynamicVariables).map(([k, v]) => [k, v == null ? '' : String(v)])
  )
  const body = await request('/twilio/outbound-call', {
    method: 'POST',
    body: JSON.stringify({
      agent_id: c.agentId,
      agent_phone_number_id: c.phoneNumberId,
      to_number: toNumber,
      conversation_initiation_client_data: { dynamic_variables: vars },
      telephony_call_config: { ringing_timeout_secs: 45 },
    }),
  })
  if (!body?.success) throw new Error(body?.message || 'A ElevenLabs não iniciou a ligação.')
  return { conversationId: body.conversation_id || null, callSid: body.callSid || null, message: body.message }
}

async function getConversation(conversationId) {
  return request('/conversations/' + encodeURIComponent(conversationId))
}

// Resposta da ElevenLabs → campos da tabela ai_calls.
function mapConversation(conv) {
  const meta = conv?.metadata || {}
  const transcript = (conv?.transcript || [])
    .filter(t => t && t.message)
    .map(t => ({ role: t.role, message: t.message, t: t.time_in_call_secs ?? null }))
  return {
    status: conv?.status || 'processing',
    call_result: meta.phone_call?.call_result || null,
    duration_secs: Number.isFinite(meta.call_duration_secs) ? meta.call_duration_secs : null,
    cost_usd: Number.isFinite(meta.cost_fiat) ? meta.cost_fiat : null,
    transcript,
    summary: conv?.analysis?.transcript_summary || null,
    error: meta.error?.reason || null,
  }
}

module.exports = { isConfigured, testNumbers, toE164, startOutboundCall, getConversation, mapConversation }
