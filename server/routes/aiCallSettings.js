// Configurações → Ligações com IA.
//   GET  /api/ai-call-settings              → configuração (sem a chave, só se existe e o final)
//   PUT  /api/ai-call-settings              → salva (dono ou Admin)
//   GET  /api/ai-call-settings/resources    → agentes e números da conta ElevenLabs (dono ou Admin)
//   POST /api/ai-call-settings/test         { phone } → ligação de teste (dono ou Admin)
const { Router } = require('express')
const { supabase, isConfigured } = require('../supabaseClient')
const el = require('../elevenlabs')
const { getConfig, publicView, saveConfig } = require('../aiCallSettings')
const { dial } = require('../aiCallService')

const router = Router()

const guard = (req, res, next) => {
  if (!isConfigured) return res.status(503).json({ error: 'Supabase não configurado' })
  next()
}

// Membros de equipe têm sub = dono e member_id no token; só o dono ou cargo Admin altera.
async function requireAdmin(req, res, next) {
  const memberId = req.user?.member_id
  if (!memberId) return next()
  try {
    const { data } = await supabase.from('team_members').select('role').eq('id', memberId).eq('user_id', req.user.sub).maybeSingle()
    if (/admin/i.test(data?.role || '')) return next()
  } catch { /* cai no 403 */ }
  res.status(403).json({ error: 'Só o dono da conta ou um Admin pode alterar as ligações com IA.' })
}

const fail = (res, e, fallback) => res.status(e?.status >= 400 && e?.status < 600 ? e.status : 500).json({ error: e?.message ?? fallback })

router.get('/', guard, async (req, res) => {
  try { res.json(publicView(await getConfig(req.user.sub))) } catch (e) { fail(res, e, 'Erro ao carregar a configuração.') }
})

router.put('/', guard, requireAdmin, async (req, res) => {
  try {
    const cfg = await saveConfig(req.user.sub, req.body || {})
    console.log(`[ai-call-settings] configuração salva (${req.user.sub})`)
    res.json(publicView(cfg))
  } catch (e) { fail(res, e, 'Erro ao salvar a configuração.') }
})

router.get('/resources', guard, requireAdmin, async (req, res) => {
  try {
    const cfg = await getConfig(req.user.sub)
    if (!cfg.apiKey) return res.status(400).json({ error: 'Salve a chave da ElevenLabs primeiro.' })
    const [agents, numbers] = await Promise.allSettled([el.listAgents(cfg), el.listPhoneNumbers(cfg)])
    res.json({
      agents: agents.status === 'fulfilled' ? agents.value : [],
      numbers: numbers.status === 'fulfilled' ? numbers.value : [],
      errors: [agents, numbers].filter(r => r.status === 'rejected').map(r => r.reason?.message),
    })
  } catch (e) { fail(res, e, 'Erro ao consultar a ElevenLabs.') }
})

router.post('/test', guard, requireAdmin, async (req, res) => {
  const phone = el.toE164(req.body?.phone)
  if (!phone) return res.status(400).json({ error: 'Informe um telefone válido (+55DDDNÚMERO).' })
  try {
    const row = await dial(req.user.sub, { id: null, name: 'Teste', company: 'Empresa de teste', phone })
    res.status(201).json(row)
  } catch (e) {
    console.error('[ai-call-settings] ligação de teste falhou:', e?.message)
    fail(res, e, 'Erro ao fazer a ligação de teste.')
  }
})

module.exports = router
