// GET  /api/contacts        → lista contatos importados da agenda do celular
// POST /api/contacts/import → faz upsert dos contatos no Supabase (tabela contacts)
const { Router } = require('express')
const { supabase, isConfigured } = require('../supabaseClient')

const router = Router()

const WA_SERVER = process.env.BAILEYS_URL || process.env.WA_SERVER_URL || 'http://localhost:3334'
const WA_KEY    = process.env.BAILEYS_KEY || process.env.API_KEY || 'riseflow-server-2024'

async function fetchWAContacts() {
  const res = await fetch(`${WA_SERVER}/contacts`, {
    headers: { apikey: WA_KEY, 'User-Agent': 'RiseFlow-Server/1.0' },
  })
  if (!res.ok) throw new Error(`whatsapp-server retornou ${res.status}`)
  return res.json()
}

// Lista contatos: WA server + enriquece com nomes das conversas sincronizadas
router.get('/', async (req, res) => {
  try {
    const waContacts = await fetchWAContacts().catch(() => [])
    // Enriquece com nomes das conversas (já sincronia do histórico do WhatsApp).
    // ⚠️ O servidor usa a service_role key (ignora RLS): sem o filtro por user_id
    // o dono A veria nomes/telefones de contatos do dono B (vazamento de PII).
    if (isConfigured) {
      const { data: convRows } = await supabase
        .from('conversations')
        .select('contact_phone, contact_name')
        .eq('user_id', req.user.sub)
        .not('contact_phone', 'is', null)
      const convNames = {}
      for (const row of convRows || []) {
        if (row.contact_phone && row.contact_name) convNames[row.contact_phone] = row.contact_name
      }
      const enriched = waContacts.map(c => ({
        ...c,
        name: c.name || convNames[c.phone] || null,
      }))
      // Adiciona contatos das conversas que não estão no WA server
      const waPhones = new Set(waContacts.map(c => c.phone))
      for (const [phone, name] of Object.entries(convNames)) {
        if (!waPhones.has(phone)) enriched.push({ jid: `${phone}@s.whatsapp.net`, name, phone })
      }
      return res.json(enriched)
    }
    res.json(waContacts)
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

// Importa contatos para o Supabase
router.post('/import', async (req, res) => {
  if (!isConfigured) return res.status(503).json({ error: 'Supabase não configurado' })
  // Dono vem do token (sub), NUNCA do body. Sem dono não gravamos — evita órfãs.
  const userId = req.user?.sub
  if (!userId) return res.status(401).json({ error: 'Usuário não identificado no token.' })
  try {
    // 1. Contatos do WA server (números sem nome, vindos dos LID mappings)
    const waContacts = await fetchWAContacts().catch(() => [])

    // 2. Nomes das conversas já sincronizadas no Supabase (só as DESTE dono)
    const { data: convRows } = await supabase
      .from('conversations')
      .select('contact_phone, contact_name')
      .eq('user_id', userId)
      .not('contact_phone', 'is', null)
    const convNames = {}
    for (const row of convRows || []) {
      if (row.contact_phone && row.contact_name) {
        convNames[row.contact_phone] = row.contact_name
      }
    }

    // 3. Mescla: nome da conversa tem prioridade sobre null do WA server
    const merged = new Map()
    for (const c of waContacts) {
      const name = c.name || convNames[c.phone] || null
      merged.set(c.jid, { jid: c.jid, name, phone: c.phone })
    }
    // Adiciona contatos das conversas que não vieram do WA server
    for (const [phone, name] of Object.entries(convNames)) {
      const jid = `${phone}@s.whatsapp.net`
      if (!merged.has(jid)) merged.set(jid, { jid, name, phone })
    }

    const rows = Array.from(merged.values())
    if (!rows.length) return res.json({ imported: 0, message: 'Nenhum contato disponível' })

    const upsertRows = rows.map(c => ({
      jid: c.jid,
      name: c.name,
      phone: c.phone,
      user_id: userId,
    }))

    // onConflict por (user_id, jid): o mesmo número pode existir para donos
    // diferentes sem uma sobrescrever a outra. Exige a UNIQUE (user_id, jid)
    // criada em supabase/contacts_unique_constraint.sql.
    const { error, count } = await supabase
      .from('contacts')
      .upsert(upsertRows, { onConflict: 'user_id,jid', ignoreDuplicates: false })
      .select('id', { count: 'exact', head: true })

    if (error) throw error
    res.json({ imported: count ?? upsertRows.length, total: upsertRows.length, withName: rows.filter(c => c.name).length })
  } catch (e) {
    console.error('[contacts/import]', e.message)
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
