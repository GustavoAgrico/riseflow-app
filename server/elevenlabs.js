// Cliente mínimo da ElevenLabs Agents Platform para ligações de saída.
// O número Twilio é importado no painel da ElevenLabs (Phone Numbers), então o
// RiseFlow não guarda credencial do Twilio: só a chave da ElevenLabs, o agente e
// o id do número importado.
//   POST /v1/convai/twilio/outbound-call      → inicia a ligação
//   GET  /v1/convai/conversations/:id          → status, transcrição e análise
//   GET  /v1/convai/agents | /phone-numbers    → listas para a tela de configuração
// Todas as funções recebem a configuração da conta (aiCallSettings.getConfig);
// sem ela, usam o padrão do .env (envConfig).

const BASE = 'https://api.elevenlabs.io/v1/convai'
const DEFAULT_WINDOW = '1-5 09:00-18:00'

// Telefone do CRM → E.164. Aceita "+55 (24) 99823-1501", "5524998231501" e "24998231501".
function toE164(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return null
  let full = digits
  if (!String(raw).trim().startsWith('+') && (digits.length === 10 || digits.length === 11)) full = '55' + digits
  if (full.length < 12 || full.length > 15) return null
  return '+' + full
}

// "a, b" → ['+55…', …] (inválidos descartados)
const parseNumbers = (str) => String(str || '').split(',').map(s => s.trim()).filter(Boolean).map(toE164).filter(Boolean)

function envConfig() {
  return {
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    agentId: process.env.ELEVENLABS_AGENT_ID || '',
    phoneNumberId: process.env.ELEVENLABS_PHONE_NUMBER_ID || '',
    businessName: process.env.AI_CALLS_BUSINESS_NAME || '',
    testNumbers: parseNumbers(process.env.AI_CALLS_TEST_NUMBERS),
    window: process.env.AI_CALLS_WINDOW || DEFAULT_WINDOW,
    enabled: true,
    source: 'servidor',
  }
}

const isConfigured = (cfg = envConfig()) => Boolean(cfg.apiKey && cfg.agentId && cfg.phoneNumberId)
// Modo teste: com números na lista, só eles podem receber ligação.
const testNumbers = (cfg = envConfig()) => cfg.testNumbers || []

async function request(cfg, path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'xi-api-key': cfg.apiKey, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    signal: opts.signal || AbortSignal.timeout(30_000),
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
async function startOutboundCall({ cfg = envConfig(), toNumber, dynamicVariables = {} }) {
  const vars = Object.fromEntries(
    Object.entries(dynamicVariables).map(([k, v]) => [k, v == null ? '' : String(v)])
  )
  const body = await request(cfg, '/twilio/outbound-call', {
    method: 'POST',
    body: JSON.stringify({
      agent_id: cfg.agentId,
      agent_phone_number_id: cfg.phoneNumberId,
      to_number: toNumber,
      conversation_initiation_client_data: { dynamic_variables: vars },
      telephony_call_config: { ringing_timeout_secs: 45 },
    }),
  })
  if (!body?.success) throw new Error(body?.message || 'A ElevenLabs não iniciou a ligação.')
  return { conversationId: body.conversation_id || null, callSid: body.callSid || null, message: body.message }
}

const getConversation = (conversationId, cfg = envConfig()) =>
  request(cfg, '/conversations/' + encodeURIComponent(conversationId))

async function listAgents(cfg) {
  const body = await request(cfg, '/agents?page_size=100')
  return (body?.agents || []).map(a => ({ id: a.agent_id, name: a.name || a.agent_id }))
}

async function listPhoneNumbers(cfg) {
  const body = await request(cfg, '/phone-numbers')
  const list = Array.isArray(body) ? body : (body?.phone_numbers || [])
  return list.map(p => ({
    id: p.phone_number_id,
    number: p.phone_number,
    label: p.label || '',
    provider: p.provider || '',
    agentId: p.assigned_agent?.agent_id || '',
    agentName: p.assigned_agent?.agent_name || '',
  }))
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

module.exports = {
  DEFAULT_WINDOW, toE164, parseNumbers, envConfig, isConfigured, testNumbers,
  startOutboundCall, getConversation, listAgents, listPhoneNumbers, mapConversation,
}
