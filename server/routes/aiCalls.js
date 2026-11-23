// Ligação por IA disparada pelo botão do CRM (a fila automática está em aiCallQueue.js).
// Chaves, agente, número e modo teste vêm da configuração da conta (aiCallSettings).
//   POST /api/ai-calls               { client_id }  → liga agora
//   GET  /api/ai-calls?client_id=                   → ligações do lead
//   POST /api/ai-calls/:id/refresh                  → atualiza status/transcrição e qualifica no fim
// Lógica de discar e qualificar: aiCallService.js. Tabela: supabase/ai_calls.sql.
const { Router } = require('express')
const { supabase, isConfigured } = require('../supabaseClient')
const { ACTIVE, dial, refreshCall } = require('../aiCallService')

const router = Router()

const MAX_CALLS_PER_HOUR = 20
const recentCalls = new Map() // userId → timestamps das últimas ligações (limite simples em memória)

const guard = (req, res, next) => {
  if (!isConfigured) return res.status(503).json({ error: 'Supabase não configurado' })
  next()
}

function hitRateLimit(userId) {
  const now = Date.now()
  const list = (recentCalls.get(userId) || []).filter(t => now - t < 3600_000)
  if (list.length >= MAX_CALLS_PER_HOUR) { recentCalls.set(userId, list); return true }
  list.push(now)
  recentCalls.set(userId, list)
  return false
}

router.post('/', guard, async (req, res) => {
  const userId = req.user?.sub
  const clientId = req.body?.client_id
  if (!clientId) return res.status(400).json({ error: 'Informe o lead (client_id).' })
  try {
    const { data: client, error: cErr } = await supabase
      .from('clients').select('id, name, company, phone').eq('id', clientId).eq('user_id', userId).maybeSingle()
    if (cErr) throw cErr
    if (!client) return res.status(404).json({ error: 'Lead não encontrado.' })

    // Evita ligação dupla (clique repetido ou lead já na fila) enquanto a anterior está em andamento.
    const { data: open } = await supabase
      .from('ai_calls').select('id').eq('user_id', userId).eq('client_id', clientId)
      .in('status', ACTIVE)
      .gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString())
      .limit(1)
    if (open?.length) return res.status(409).json({ error: 'Já existe uma ligação na fila ou em andamento para este lead.' })

    if (hitRateLimit(userId)) return res.status(429).json({ error: `Limite de ${MAX_CALLS_PER_HOUR} ligações por hora atingido.` })

    const row = await dial(userId, client)
    res.status(201).json(row)
  } catch (e) {
    console.error('[ai-calls] erro ao iniciar ligação:', e?.message)
    const status = e?.status === 422 ? 400 : (e?.status >= 400 && e?.status < 500 ? e.status : 500)
    res.status(status).json({ error: e?.message ?? 'Erro ao iniciar a ligação.' })
  }
})

router.get('/', async (req, res) => {
  if (!isConfigured) return res.status(503).json({ error: 'Supabase não configurado' })
  try {
    let q = supabase.from('ai_calls').select('*').eq('user_id', req.user?.sub).order('created_at', { ascending: false }).limit(20)
    if (req.query.client_id) q = q.eq('client_id', req.query.client_id)
    const { data, error } = await q
    if (error) throw error
    res.json(data || [])
  } catch (e) {
    res.status(500).json({ error: e?.message ?? 'Erro ao listar ligações.' })
  }
})

router.post('/:id/refresh', guard, async (req, res) => {
  const userId = req.user?.sub
  try {
    const { data: row, error } = await supabase.from('ai_calls').select('*').eq('id', req.params.id).eq('user_id', userId).maybeSingle()
    if (error) throw error
    if (!row) return res.status(404).json({ error: 'Ligação não encontrada.' })
    res.json(await refreshCall(userId, row))
  } catch (e) {
    console.error('[ai-calls] erro ao atualizar ligação:', e?.message)
    res.status(500).json({ error: e?.message ?? 'Erro ao atualizar a ligação.' })
  }
})

module.exports = router
