// Lógica compartilhada da ligação por IA, usada pelo botão do CRM
// (routes/aiCalls.js) e pela fila automática (aiCallQueue.js):
//   dial()        → liga para o lead pela ElevenLabs e grava em ai_calls
//   refreshCall() → atualiza status/transcrição e, no fim, qualifica a conversa
const { supabase } = require('./supabaseClient')
const { emitSalesUpdate } = require('./realtime')
const { chatComplete } = require('./aiProvider')
const el = require('./elevenlabs')

// queued → dialing → initiated → in-progress → processing → done | failed (ou canceled na fila)
const ACTIVE = ['queued', 'dialing', 'initiated', 'in-progress', 'processing']
const FINAL = new Set(['done', 'failed', 'canceled'])
const qualifying = new Set() // ids sendo qualificados (evita dupla qualificação)

const now = () => new Date().toISOString()
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || ''
const questionsText = (q) => (Array.isArray(q) ? q : [])
  .map(x => (typeof x === 'string' ? x : x?.question || x?.text || '')).filter(Boolean).join(' | ')

function httpError(status, message) {
  const e = new Error(message)
  e.status = status
  return e
}

async function loadNiche(userId) {
  const { data } = await supabase.from('niche_config').select('*').eq('user_id', userId).maybeSingle()
  return data || null
}

// Liga para o lead. Com rowId, atualiza a linha da fila; sem, cria uma nova.
async function dial(userId, client, rowId = null) {
  const toNumber = el.toE164(client.phone)
  if (!toNumber) throw httpError(400, 'O lead não tem um telefone válido.')
  const allowed = el.testNumbers()
  if (allowed.length && !allowed.includes(toNumber)) {
    throw httpError(403, 'Modo teste: este número não está em AI_CALLS_TEST_NUMBERS.')
  }

  const niche = await loadNiche(userId)
  const call = await el.startOutboundCall({
    toNumber,
    dynamicVariables: {
      lead_name: firstName(client.name),
      lead_company: client.company || '',
      business_name: process.env.AI_CALLS_BUSINESS_NAME || 'nossa empresa',
      niche: niche?.niche || '',
      ideal_customer: niche?.ideal_customer || '',
      questions: questionsText(niche?.qualification_questions),
    },
  })

  const fields = {
    to_number: toNumber, conversation_id: call.conversationId, call_sid: call.callSid,
    status: 'initiated', error: null, updated_at: now(),
  }
  const q = rowId
    ? supabase.from('ai_calls').update(fields).eq('id', rowId).eq('user_id', userId)
    : supabase.from('ai_calls').insert({ user_id: userId, client_id: client.id, ...fields })
  const { data: row, error } = await q.select().single()
  if (error) throw error
  console.log(`[ai-calls] ligação iniciada ${row.id} (conversa ${call.conversationId})`)
  return row
}

// Qualifica a transcrição com a IA do dono, no mesmo formato de lead_scores.
async function qualifyCall(userId, row) {
  const niche = await loadNiche(userId)
  const { data: client } = row.client_id
    ? await supabase.from('clients').select('id, name, company, stage').eq('id', row.client_id).eq('user_id', userId).maybeSingle()
    : { data: null }
  const transcript = (row.transcript || []).map(t => `${t.role === 'agent' ? 'Agente' : 'Lead'}: ${t.message}`).join('\n')

  const systemPrompt = `Você é um analista de vendas. Uma assistente virtual ligou para um lead e esta é a transcrição. Avalie se o lead é qualificado${niche?.niche ? ` para o nicho: ${niche.niche}` : ''}.

Cliente ideal: ${niche?.ideal_customer || '—'}
Critérios de desqualificação: ${niche?.disqualify_criteria || '—'}

Lead: ${client?.name || '—'}, Empresa: ${client?.company || '—'}

Transcrição da ligação:
${transcript}

Responda SOMENTE em JSON:
{
  "score": 0-100,
  "qualified": true/false,
  "temperature": "hot/warm/cold",
  "reasons": ["razão 1", "razão 2"],
  "missing_info": ["info que falta para qualificar melhor"],
  "suggested_action": "próxima ação recomendada",
  "summary": "resumo em 2 frases"
}`

  const ai = await chatComplete({
    userId, provider: niche?.provider || 'OpenAI GPT-4o-mini', systemPrompt,
    userMessage: 'Analise a ligação e responda apenas com o JSON.', temperature: 0.3, maxTokens: 700,
  })
  if (!ai.success) throw new Error('Qualificação falhou: ' + ai.error)
  const m = String(ai.response).match(/\{[\s\S]*\}/)
  let parsed = null
  try { parsed = m ? JSON.parse(m[0]) : null } catch { parsed = null }
  if (!parsed) throw new Error('Qualificação falhou: resposta da IA não é JSON.')

  const score = Math.max(0, Math.min(100, Number(parsed.score) || 0))
  const qualified = score >= Number(niche?.min_score ?? 70)
  const temperature = ['hot', 'warm', 'cold'].includes(parsed.temperature) ? parsed.temperature : 'cold'

  if (row.client_id) {
    await supabase.from('lead_scores').insert({
      contact_id: row.client_id, user_id: userId, score, qualified, temperature,
      reasons: parsed.reasons ?? [], missing_info: parsed.missing_info ?? [],
      suggested_action: parsed.suggested_action ?? '', summary: parsed.summary ?? '',
    })
    // Mesmo comportamento da auto-qualificação: lead novo qualificado vai para "Qualificado".
    if (qualified && (client?.stage || 'lead') === 'lead') {
      await supabase.from('clients').update({ stage: 'qual' }).eq('id', row.client_id).eq('user_id', userId)
      emitSalesUpdate(userId, 'clients')
    }
  }
  return { score, qualified, temperature, summary: parsed.summary || null }
}

// Lê a conversa na ElevenLabs, grava o andamento e qualifica quando terminar.
async function refreshCall(userId, row) {
  if ((FINAL.has(row.status) && (row.score != null || row.error || row.status === 'canceled')) || !row.conversation_id) return row

  const conv = await el.getConversation(row.conversation_id)
  const patch = { ...el.mapConversation(conv), updated_at: now() }
  if (!patch.summary) delete patch.summary
  if (!patch.error) delete patch.error

  const leadSpoke = (patch.transcript || []).some(t => t.role === 'user')
  if (patch.status === 'done' && leadSpoke && row.score == null && !qualifying.has(row.id)) {
    qualifying.add(row.id)
    try {
      const q = await qualifyCall(userId, { ...row, ...patch })
      patch.score = q.score
      patch.qualified = q.qualified
      patch.temperature = q.temperature
      if (q.summary) patch.summary = q.summary
    } catch (e) {
      patch.error = e.message
    } finally {
      qualifying.delete(row.id)
    }
  } else if (patch.status === 'done' && !leadSpoke && !patch.error) {
    patch.error = patch.call_result === 'voicemail' ? 'Caiu na caixa postal.' : 'O lead não falou na ligação.'
  }

  const { data: updated, error } = await supabase.from('ai_calls').update(patch).eq('id', row.id).eq('user_id', userId).select().single()
  if (error) throw error
  return updated
}

module.exports = { ACTIVE, FINAL, dial, refreshCall, httpError }
