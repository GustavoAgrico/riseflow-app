// Motor de execução de funis.
// É acionado pelo webhook a cada mensagem nova (MESSAGES_UPSERT). Para cada
// mensagem ele: (1) retoma execuções aguardando resposta; ou (2) avalia os
// gatilhos dos funis ativos e inicia uma execução. As ações dos nós são
// executadas em sequência por runFlow(), parando em "Aguardar resposta".
//
// Os tipos de nó seguem o builder novo (src/pages/Flows/nodes/):
//   gatilhos: triggerKeyword | triggerFirstContact | triggerSchedule | triggerTag
//   ações:    actionSendText | actionSendFile | actionWaitReply |
//             actionApplyTag | actionTransfer | actionWebhook | actionSendEmail
const axios = require('axios')
const { supabase, isConfigured } = require('./supabaseClient')
const { baileys } = require('./baileysClient')
const { sendMailForUser } = require('./emailClient')

/* ─── Utilidades ─────────────────────────────────────────────────────── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const nowIso = () => new Date().toISOString()
const jidToNumber = (jid) => String(jid || '').split('@')[0].split(':')[0]
const HANDOFF_TAG = 'atendimento-humano'

// getDay(): 0=Dom … 6=Sáb — alinhado às abreviações do TriggerSchedule.
const DAY_ABBR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/* Substitui {{nome}} {{telefone}} {{data}} e quaisquer {{variaveis}} salvas. */
function applyVars(text, vars = {}, ctx = {}) {
  if (!text) return ''
  return String(text)
    .replace(/\{\{\s*nome\s*\}\}/gi, ctx.contact?.name || ctx.pushName || '')
    .replace(/\{\{\s*telefone\s*\}\}/gi, ctx.contact?.phone || jidToNumber(ctx.jid))
    .replace(/\{\{\s*data\s*\}\}/gi, new Date().toLocaleDateString('pt-BR'))
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars?.[k] != null ? String(vars[k]) : ''))
}

/* Aresta de saída de um nó (handle opcional p/ nós com múltiplas saídas). */
function nextNodeId(edges = [], nodeId, handle = null) {
  const edge = edges.find(
    (e) => e.source === nodeId && (handle == null || e.sourceHandle === handle)
  )
  return edge?.target ?? null
}

/* ─── Avaliação de gatilhos ──────────────────────────────────────────── */
function keywordMatches(data = {}, text = '') {
  const raw = data.keywords ?? data.keyword ?? ''
  const list = String(raw).split(',').map((s) => s.trim()).filter(Boolean)
  if (!list.length || !text) return false
  const ignoreCase = data.ignoreCase !== false // padrão: ignora maiúsc./minúsc.
  const hay = ignoreCase ? text.toLowerCase() : text
  return list.some((k) => {
    const needle = ignoreCase ? k.toLowerCase() : k
    return data.exactMatch ? hay.trim() === needle : hay.includes(needle)
  })
}

function scheduleMatches(data = {}, now = new Date()) {
  const days = Array.isArray(data.days) ? data.days : []
  if (days.length && !days.includes(DAY_ABBR[now.getDay()])) return false
  const cur = now.getHours() * 60 + now.getMinutes()
  const [sH, sM] = String(data.start || '00:00').split(':').map(Number)
  const [eH, eM] = String(data.end || '23:59').split(':').map(Number)
  return cur >= sH * 60 + sM && cur <= eH * 60 + eM
}

/* Retorna o nó de gatilho que dispara para esta mensagem, ou null. */
function findMatchingTrigger(flow, ctx) {
  for (const node of flow.nodes || []) {
    const t = node.type
    const d = node.data || {}
    if (t === 'triggerKeyword' && keywordMatches(d, ctx.text)) return node
    if (t === 'triggerFirstContact' && ctx.isFirstContact) return node
    if (t === 'triggerSchedule' && scheduleMatches(d, ctx.now)) return node
    // triggerTag dispara quando a tag é aplicada, não por mensagem recebida.
  }
  return null
}

/* ─── Acesso ao banco ────────────────────────────────────────────────── */
async function getActiveFlows() {
  const { data, error } = await supabase.from('flows').select('*').eq('status', 'active')
  if (error) throw error
  return data || []
}

async function getFlow(id) {
  const { data, error } = await supabase.from('flows').select('*').eq('id', id).single()
  if (error) return null
  return data
}

async function getContactByJid(jid) {
  const { data } = await supabase
    .from('contacts').select('*').eq('jid', jid)
    .order('first_seen_at', { ascending: true }).limit(1)
  return data?.[0] ?? null
}

/* Detecta primeiro contato e mantém o espelho local atualizado. */
async function upsertContact(jid, pushName) {
  const existing = await getContactByJid(jid)
  if (existing) {
    await supabase.from('contacts')
      .update({ last_message_at: nowIso(), name: existing.name || pushName || null })
      .eq('id', existing.id)
    return { contact: { ...existing, name: existing.name || pushName || null }, isFirstContact: false }
  }
  const { data } = await supabase.from('contacts')
    .insert({ jid, name: pushName || null, phone: jidToNumber(jid), last_message_at: nowIso() })
    .select().single()
  return { contact: data, isFirstContact: true }
}

async function getWaitingExecution(jid) {
  const { data } = await supabase
    .from('flow_executions').select('*')
    .eq('contact_jid', jid).eq('status', 'waiting_reply')
    .order('started_at', { ascending: false }).limit(1)
  return data?.[0] ?? null
}

const updateExecution = (id, patch) =>
  supabase.from('flow_executions').update(patch).eq('id', id)

const completeExecution = (id) =>
  updateExecution(id, { status: 'completed', completed_at: nowIso() })

// Marca a execução como 'failed' e guarda a mensagem de erro em variables._error
// (não há coluna dedicada `error`; usamos o JSON já existente para não exigir
// migração). Trunca em 500 chars para não inflar a linha.
const failExecution = (id, errorMsg, vars = {}) =>
  updateExecution(id, {
    status: 'failed',
    completed_at: nowIso(),
    variables: { ...vars, _error: String(errorMsg ?? '').slice(0, 500) },
  })

async function startExecution(flow, triggerNode, ctx) {
  const { data, error } = await supabase.from('flow_executions')
    .insert({
      flow_id: flow.id, contact_jid: ctx.jid, current_node_id: triggerNode.id,
      status: 'running', variables: {}, started_at: nowIso(),
    })
    .select().single()
  if (error) throw error
  return data
}

/* ─── Ações dos nós ──────────────────────────────────────────────────── */
/* Espelha a mensagem enviada em conversations/messages para aparecer no chat
   da UI (a Edge Function ignora eventos fromMe, então ninguém mais salva).
   userId = dono do funil (flow.user_id). Falha aqui não interrompe o funil. */
async function saveSentMessage(ctx, text) {
  if (!ctx.userId || !text) return
  const phone = jidToNumber(ctx.jid)
  try {
    const { data: conv } = await supabase.from('conversations').upsert({
      user_id: ctx.userId,
      contact_phone: phone,
      contact_name: ctx.contact?.name || ctx.pushName || phone,
      last_message: text,
      last_message_at: nowIso(),
      updated_at: nowIso(),
    }, { onConflict: 'user_id,contact_phone' }).select('id').single()
    await supabase.from('messages').insert({
      user_id: ctx.userId,
      conversation_id: conv?.id,
      contact_phone: phone,
      content: text,
      direction: 'sent',
      type: 'text',
      external_id: `flow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'sent',
      read: true,
      created_at: nowIso(),
    })
  } catch (e) {
    console.warn('[flowEngine] não espelhou msg enviada:', e?.message ?? e)
  }
}

async function sendText(ctx, text) {
  if (!text) return
  const number = jidToNumber(ctx.jid)
  // Roteamento por canal pelo prefixo do contato: "tg…" = Telegram,
  // "fb…"/"ig…" = Meta (Messenger/Instagram), senão WhatsApp (Baileys).
  // require tardio: evita ciclo (canal → aiAttendant → flowEngine).
  if (require('./telegramClient').isTelegramNumber(number)) {
    await require('./telegramClient').sendTextTo(number, text, ctx.userId || null)
  } else if (require('./metaClient').isMetaNumber(number)) {
    await require('./metaClient').sendTextTo(number, text, ctx.userId || null)
  } else {
    await baileys.post('/send/text', { number, text })
  }
  await saveSentMessage(ctx, text)
}

async function sendMedia(ctx, data = {}) {
  const media = data.url // o servidor só consegue enviar por URL pública
  if (!media) {
    console.warn('[flowEngine] actionSendFile sem URL pública — nó ignorado.')
    return
  }
  const number = jidToNumber(ctx.jid)
  const ft = String(data.fileType || '')
  if (ft.startsWith('image')) {
    await baileys.post('/send/image', { number, url: media, caption: data.caption || '' })
  } else {
    // vídeo/documento/outros → enviados como documento (anexo por URL).
    await baileys.post('/send/document', { number, url: media, filename: data.fileName || 'arquivo' })
  }
  await saveSentMessage(ctx, data.caption || `📎 ${data.fileName || 'Arquivo'}`)
}

async function applyTags(contact, tags = []) {
  if (!contact || !tags.length) return
  const merged = Array.from(new Set([...(contact.tags || []), ...tags]))
  await supabase.from('contacts').update({ tags: merged }).eq('id', contact.id)
  contact.tags = merged
}

async function transferToHuman(contact, assignTo) {
  // Marca o contato como em atendimento humano (o operador filtra por essa tag).
  if (contact) {
    const merged = Array.from(new Set([...(contact.tags || []), HANDOFF_TAG]))
    await supabase.from('contacts').update({ tags: merged }).eq('id', contact.id)
    contact.tags = merged
  }
  // Best-effort: se existir uma tabela `conversations` com assigned_to, atualiza.
  try {
    if (assignTo && contact?.jid) {
      await supabase.from('conversations').update({ assigned_to: assignTo }).eq('contact_jid', contact.jid)
    }
  } catch (_) { /* tabela pode não existir — ok */ }
}

/* Envia um email pela config SMTP do dono do funil. Falha não interrompe o funil.
   `to` aceita endereço literal ou {{variavel}} (ex.: capturada por "Aguardar resposta"). */
async function sendEmailAction(ctx, data = {}, vars = {}) {
  const to = applyVars(data.to, vars, ctx).trim()
  const subject = applyVars(data.subject, vars, ctx).trim()
  const body = applyVars(data.body, vars, ctx)
  if (!to || !subject) {
    console.warn('[flowEngine] actionSendEmail sem destinatário/assunto — nó ignorado.')
    return
  }
  try {
    const html = data.asHtml ? body : undefined
    const text = data.asHtml ? undefined : body
    await sendMailForUser(ctx.userId, { to, subject, text, html })
  } catch (e) {
    console.warn('[flowEngine] falha ao enviar email:', e?.message ?? e)
  }
}

async function callWebhook(data = {}, vars = {}, ctx = {}) {
  if (!data.url) return undefined
  const method = String(data.method || 'POST').toUpperCase()
  const headers = {}
  for (const h of data.headers || []) {
    if (h?.key) headers[h.key] = applyVars(h.value, vars, ctx)
  }
  let body
  if (method === 'POST' && data.body) {
    const raw = applyVars(data.body, vars, ctx)
    try { body = JSON.parse(raw) } catch { body = raw }
  }
  try {
    const resp = await axios({ url: data.url, method, headers, data: body, timeout: 10_000 })
    return resp.data
  } catch (e) {
    console.warn('[flowEngine] callWebhook falhou:', e?.message ?? e)
    return undefined
  }
}

function computeDeadline(data = {}) {
  const v = Number(data.waitValue) || 24
  const unit = data.waitUnit || 'hours'
  const ms = unit === 'minutes' ? v * 60_000 : unit === 'days' ? v * 86_400_000 : v * 3_600_000
  return new Date(Date.now() + ms).toISOString()
}

/* ─── Loop de execução ───────────────────────────────────────────────── */
// Executa os nós em sequência a partir de startNodeId. Para em actionWaitReply
// (persistindo status 'waiting_reply') ou ao chegar no fim (status 'completed').
async function runFlow(flow, execution, startNodeId, ctx) {
  const nodes = flow.nodes || []
  const edges = flow.edges || []
  let variables = { ...(execution.variables || {}) }
  let currentId = startNodeId
  let steps = 0

  try {
    while (currentId && steps < 100) {
      steps++
      const node = nodes.find((n) => n.id === currentId)
      if (!node) break
      const type = node.type || ''
      const data = node.data || {}

      // Gatilho: ponto de partida, sem ação — apenas avança.
      if (type.startsWith('trigger')) { currentId = nextNodeId(edges, currentId); continue }

      await updateExecution(execution.id, { current_node_id: currentId, variables })

      if (type === 'actionSendText') {
        const delay = Math.min(Number(data.delay) || 0, 60)
        if (delay) await sleep(delay * 1000)
        await sendText(ctx, applyVars(data.text, variables, ctx))
        currentId = nextNodeId(edges, currentId)
      } else if (type === 'actionSendFile') {
        const delay = Math.min(Number(data.delay) || 0, 60)
        if (delay) await sleep(delay * 1000)
        await sendMedia(ctx, { ...data, caption: applyVars(data.caption, variables, ctx) })
        currentId = nextNodeId(edges, currentId)
      } else if (type === 'actionWaitReply') {
        // Para a execução: retoma quando o contato responder (ou no timeout).
        variables = { ...variables, _waitNode: currentId, _saveAs: data.saveAs || null, _waitUntil: computeDeadline(data) }
        await updateExecution(execution.id, { status: 'waiting_reply', variables, current_node_id: currentId })
        return
      } else if (type === 'actionApplyTag') {
        await applyTags(ctx.contact, data.tags || [])
        currentId = nextNodeId(edges, currentId)
      } else if (type === 'actionTransfer') {
        if (data.notice) await sendText(ctx, applyVars(data.notice, variables, ctx))
        await transferToHuman(ctx.contact, data.assignTo)
        await completeExecution(execution.id)
        return
      } else if (type === 'actionWebhook') {
        const result = await callWebhook(data, variables, ctx)
        if (data.waitResponse && result !== undefined) variables = { ...variables, webhook: result }
        currentId = nextNodeId(edges, currentId)
      } else if (type === 'actionSendEmail') {
        const delay = Math.min(Number(data.delay) || 0, 60)
        if (delay) await sleep(delay * 1000)
        await sendEmailAction(ctx, data, variables)
        currentId = nextNodeId(edges, currentId)
      } else {
        currentId = nextNodeId(edges, currentId)
      }
    }

    await completeExecution(execution.id)
  } catch (e) {
    console.error('[flowEngine] runFlow falhou no nó', currentId, ':', e?.message ?? e)
    try { await failExecution(execution.id, e?.message ?? e, variables) } catch {}
  }
}

/* Retoma uma execução que aguardava resposta: salva a resposta e segue p/ 'replied'. */
async function resumeWaiting(execution, flow, ctx) {
  const vars = { ...(execution.variables || {}) }
  const waitNode = vars._waitNode
  if (vars._saveAs) vars[vars._saveAs] = ctx.text
  delete vars._waitNode; delete vars._saveAs; delete vars._waitUntil
  const next = nextNodeId(flow.edges || [], waitNode, 'replied')
  await updateExecution(execution.id, { status: 'running', variables: vars, current_node_id: next })
  await runFlow(flow, { ...execution, variables: vars }, next, { ...ctx, userId: flow.user_id })
}

/* ─── Entrada principal (chamada pelo webhook) ───────────────────────── */
async function handleIncomingMessage({ jid, text, pushName, fromMe }) {
  if (!isConfigured) return            // sem Supabase: motor desativado
  if (fromMe) return                   // ignora mensagens enviadas por nós
  if (!jid || jid.endsWith('@g.us')) return // ignora grupos

  try {
    const { contact, isFirstContact } = await upsertContact(jid, pushName)
    const ctx = { jid, text: text || '', contact, isFirstContact, pushName, now: new Date() }

    // 1) Contato já está num funil aguardando resposta? Retoma.
    const waiting = await getWaitingExecution(jid)
    if (waiting) {
      const flow = await getFlow(waiting.flow_id)
      if (flow) { await resumeWaiting(waiting, flow, ctx); return }
      await completeExecution(waiting.id) // funil sumiu — encerra a execução órfã
    }

    // 2) Avalia gatilhos dos funis ativos (um funil por mensagem).
    const flows = await getActiveFlows()
    for (const flow of flows) {
      const trigger = findMatchingTrigger(flow, ctx)
      if (!trigger) continue
      const execution = await startExecution(flow, trigger, ctx)
      await runFlow(flow, execution, trigger.id, { ...ctx, userId: flow.user_id })
      break
    }
  } catch (e) {
    console.error('[flowEngine] erro ao processar mensagem:', e?.message ?? e)
  }
}

/* Varre execuções aguardando resposta cujo timeout expirou e segue p/ 'timeout'. */
async function sweepTimeouts() {
  if (!isConfigured) return
  try {
    const { data } = await supabase.from('flow_executions').select('*').eq('status', 'waiting_reply')
    const now = Date.now()
    for (const exec of data || []) {
      const until = exec.variables?._waitUntil
      if (!until || new Date(until).getTime() > now) continue
      const flow = await getFlow(exec.flow_id)
      if (!flow) { await completeExecution(exec.id); continue }
      const vars = { ...(exec.variables || {}) }
      const waitNode = vars._waitNode
      delete vars._waitNode; delete vars._saveAs; delete vars._waitUntil
      const next = nextNodeId(flow.edges || [], waitNode, 'timeout')
      const contact = await getContactByJid(exec.contact_jid)
      const ctx = { jid: exec.contact_jid, text: '', contact, isFirstContact: false, now: new Date(), userId: flow.user_id }
      await updateExecution(exec.id, { status: 'running', variables: vars, current_node_id: next })
      await runFlow(flow, { ...exec, variables: vars }, next, ctx)
    }
  } catch (e) {
    console.error('[flowEngine] erro no sweep de timeouts:', e?.message ?? e)
  }
}

// Verifica timeouts de "Aguardar resposta" a cada 60s.
if (isConfigured) {
  setInterval(() => sweepTimeouts().catch(() => {}), 60_000).unref?.()
}

/* Verifica sem mutação se algum funil ativo dispararia para esta mensagem.
   Usado pelo aiAttendant para ceder o controle ao engine quando há match.
   Não chama upsertContact — só lê o banco para não criar efeitos colaterais. */
async function hasMatchingFlow(jid, text) {
  if (!isConfigured) return false
  try {
    const existing = await getContactByJid(jid)
    const isFirstContact = existing == null
    const ctx = { jid, text: text || '', isFirstContact, now: new Date() }
    const flows = await getActiveFlows()
    return flows.some((flow) => findMatchingTrigger(flow, ctx) !== null)
  } catch {
    return false
  }
}

// sendText/getWaitingExecution/hasMatchingFlow também são usados pelo aiAttendant.js
module.exports = { handleIncomingMessage, sweepTimeouts, sendText, getWaitingExecution, hasMatchingFlow }
