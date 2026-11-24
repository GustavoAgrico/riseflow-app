// Agentes de IA — fase 1 (docs/PLANO_AGENTES_FASES_1_2.md).
//   GET  /api/agents                    → equipe da conta (criada no primeiro acesso)
//   GET  /api/agents/:id/messages       → conversa direta com o agente
//   POST /api/agents/:id/messages       { text, idempotency_key } → entra na fila; a resposta
//                                         chega pelo socket ('agent_message', sala da conta)
const { Router } = require('express')
const { supabase, isConfigured } = require('../supabaseClient')
const service = require('../agents/service')

const router = Router()
const MAX_TEXT = 4000

const guard = (req, res, next) => {
  if (!isConfigured) return res.status(503).json({ error: 'Supabase não configurado' })
  next()
}

// Sem a migração supabase/agents_core.sql, devolve 404 para a aba seguir no modo exemplo.
function fail(res, e, fallback) {
  const msg = e?.message || ''
  if (/agents|agent_threads|agent_messages|agent_enqueue/.test(msg) && /exist|find|schema cache/i.test(msg)) {
    return res.status(404).json({ error: 'Agentes ainda não instalados (rode supabase/agents_core.sql).' })
  }
  console.error('[agents]', fallback, msg)
  res.status(500).json({ error: fallback })
}

router.get('/', guard, async (req, res) => {
  try { res.json(await service.listAgents(req.user.sub)) } catch (e) { fail(res, e, 'Erro ao carregar os agentes.') }
})

router.get('/:id/messages', guard, async (req, res) => {
  try {
    const agent = await service.getAgent(req.user.sub, req.params.id)
    if (!agent) return res.status(404).json({ error: 'Agente não encontrado.' })
    const thread = await service.getDirectThread(req.user.sub, agent.id)
    res.json(await service.listMessages(req.user.sub, thread.id))
  } catch (e) { fail(res, e, 'Erro ao carregar a conversa.') }
})

router.post('/:id/messages', guard, async (req, res) => {
  const userId = req.user.sub
  const text = String(req.body?.text || '').trim()
  const key = req.body?.idempotency_key ? String(req.body.idempotency_key).slice(0, 100) : null
  if (!text) return res.status(400).json({ error: 'Escreva uma mensagem.' })
  if (text.length > MAX_TEXT) return res.status(400).json({ error: `A mensagem passa de ${MAX_TEXT} caracteres.` })
  try {
    const agent = await service.getAgent(userId, req.params.id)
    if (!agent) return res.status(404).json({ error: 'Agente não encontrado.' })
    if (await service.countRecentRuns(userId, agent.id) >= agent.max_runs_per_hour) {
      return res.status(429).json({ error: 'Limite de mensagens por hora deste agente atingido.' })
    }
    const thread = await service.getDirectThread(userId, agent.id)
    const { data: msg, error } = await supabase.rpc('agent_enqueue', {
      p_user_id: userId, p_agent_id: agent.id, p_thread_id: thread.id, p_content: text,
      p_author_id: req.user.member_id || userId,
      // A chave do navegador é prefixada pela conta: chaves iguais de contas diferentes não colidem.
      p_idempotency_key: key ? `${userId}:${key}` : null,
    })
    if (error) throw error
    res.status(201).json({ id: msg.id, author_kind: msg.author_kind, content: msg.content, created_at: msg.created_at })
  } catch (e) { fail(res, e, 'Erro ao enviar a mensagem.') }
})

module.exports = router
