// Configuração da ligação por IA por conta (tabela ai_call_settings).
// Sem linha salva, a conta usa o padrão do .env do servidor (elevenlabs.envConfig).
// A chave da ElevenLabs fica cifrada (secretCrypto) e só é decifrada aqui.
const { supabase, isConfigured } = require('./supabaseClient')
const { encryptSecret, decryptSecret } = require('./secretCrypto')
const el = require('./elevenlabs')

const TTL_MS = 60_000
const cache = new Map() // userId → { at, cfg }

const DAYS = { '1-5': 'Segunda a sexta', '1-6': 'Segunda a sábado', '0-6': 'Todos os dias' }
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const ID_RE = /^[\w-]{0,100}$/

async function loadRow(userId) {
  if (!isConfigured) return null
  const { data, error } = await supabase.from('ai_call_settings').select('*').eq('user_id', userId).maybeSingle()
  if (error) {
    if (/ai_call_settings/.test(error.message || '')) return null // migração ainda não rodada
    throw error
  }
  return data || null
}

function fromRow(row) {
  const callDays = DAYS[row.call_days] ? row.call_days : '1-5'
  const callStart = TIME_RE.test(row.call_start || '') ? row.call_start : '09:00'
  const callEnd = TIME_RE.test(row.call_end || '') ? row.call_end : '18:00'
  return {
    apiKey: decryptSecret(row.elevenlabs_api_key) || '',
    agentId: row.agent_id || '',
    phoneNumberId: row.phone_number_id || '',
    businessName: row.business_name || '',
    testNumbers: el.parseNumbers(row.test_numbers),
    callDays, callStart, callEnd,
    window: `${callDays} ${callStart}-${callEnd}`,
    enabled: row.enabled !== false,
    source: 'conta',
  }
}

function fromEnv() {
  const env = el.envConfig()
  const m = env.window.match(/^(\d-\d)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/)
  return { ...env, callDays: m?.[1] || '1-5', callStart: m?.[2] || '09:00', callEnd: m?.[3] || '18:00' }
}

async function getConfig(userId) {
  const hit = cache.get(userId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.cfg
  const row = await loadRow(userId).catch(() => null)
  const cfg = row ? fromRow(row) : fromEnv()
  cache.set(userId, { at: Date.now(), cfg })
  return cfg
}

// O que a tela pode ver: nunca a chave, só se existe e os 4 últimos caracteres.
function publicView(cfg) {
  return {
    configured: el.isConfigured(cfg),
    source: cfg.source,
    apiKeySet: Boolean(cfg.apiKey),
    apiKeyHint: cfg.apiKey ? '••••' + cfg.apiKey.slice(-4) : '',
    agentId: cfg.agentId,
    phoneNumberId: cfg.phoneNumberId,
    businessName: cfg.businessName,
    callDays: cfg.callDays,
    callStart: cfg.callStart,
    callEnd: cfg.callEnd,
    testNumbers: (cfg.testNumbers || []).join(', '),
    enabled: cfg.enabled !== false,
    encrypted: Boolean((process.env.TOKEN_ENC_KEY || '').trim()),
  }
}

// Valida e grava. apiKey: string nova substitui; clearApiKey apaga; ausente mantém a atual.
async function saveConfig(userId, input = {}) {
  const errors = []
  const callDays = String(input.callDays || '1-5')
  const callStart = String(input.callStart || '09:00')
  const callEnd = String(input.callEnd || '18:00')
  const agentId = String(input.agentId || '').trim()
  const phoneNumberId = String(input.phoneNumberId || '').trim()
  const businessName = String(input.businessName || '').trim().slice(0, 80)
  const rawTests = String(input.testNumbers || '').split(',').map(s => s.trim()).filter(Boolean)
  const tests = el.parseNumbers(rawTests.join(','))

  if (!DAYS[callDays]) errors.push('Dias de ligação inválidos.')
  if (!TIME_RE.test(callStart) || !TIME_RE.test(callEnd)) errors.push('Horário inválido (use HH:MM).')
  else if (callStart >= callEnd) errors.push('O horário de início precisa ser antes do fim.')
  if (!ID_RE.test(agentId)) errors.push('ID do agente inválido.')
  if (!ID_RE.test(phoneNumberId)) errors.push('ID do número inválido.')
  if (tests.length !== rawTests.length) errors.push('Há número de teste inválido (use +55DDDNÚMERO).')
  if (errors.length) {
    const e = new Error(errors.join(' '))
    e.status = 400
    throw e
  }

  const current = await loadRow(userId)
  let apiKey = current?.elevenlabs_api_key ?? null
  if (input.clearApiKey) apiKey = null
  else if (typeof input.apiKey === 'string' && input.apiKey.trim()) apiKey = encryptSecret(input.apiKey.trim())

  const { error } = await supabase.from('ai_call_settings').upsert({
    user_id: userId,
    elevenlabs_api_key: apiKey,
    agent_id: agentId || null,
    phone_number_id: phoneNumberId || null,
    business_name: businessName || null,
    call_days: callDays,
    call_start: callStart,
    call_end: callEnd,
    test_numbers: tests.join(', '),
    enabled: input.enabled !== false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) {
    if (/ai_call_settings/.test(error.message || '')) {
      const e = new Error('Rode a migração supabase/ai_call_settings.sql no Supabase antes de salvar.')
      e.status = 503
      throw e
    }
    throw error
  }
  cache.delete(userId)
  return getConfig(userId)
}

module.exports = { getConfig, publicView, saveConfig, DAYS }
