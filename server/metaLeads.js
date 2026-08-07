// Captação de leads do Meta Lead Ads (formulários do tráfego pago).
//
// Quando alguém preenche um formulário de anúncio, a Meta envia um evento
// `leadgen` no webhook da página (tratado em metaClient.handleWebhookEvent).
// Aqui buscamos os dados completos do lead na Graph API e salvamos no CRM
// (tabela clients), marcando:
//   - o NICHO/CAMPANHA como tag (nome da campanha do anúncio) → filtra no CRM;
//   - channel + tag (colunas que a tela de Clientes exibe);
//   - source/source_meta com o rastreio completo do anúncio.
// Emite 'new_lead' no Socket.io para o CRM atualizar em tempo real.
//
// Requisito de permissão: `leads_retrieval` (App Review da Meta). Sem ela, o
// GET do lead falha e o lead não é salvo — o resto do webhook segue normal.
const axios = require('axios')
const { supabase, isConfigured } = require('./supabaseClient')

const GRAPH = 'https://graph.facebook.com/v21.0'

// Socket.io injetado pelo index.js — usado para avisar o CRM em tempo real.
let io = null
function setIo(socketIo) { io = socketIo }

/* Extrai só os dígitos do telefone (o Lead Ads costuma trazer +55 11 9...). */
function normalizePhone(p) {
  const d = String(p || '').replace(/\D/g, '')
  return d || null
}

/* Monta o nome a partir dos campos padrão do formulário. */
function pickName(f) {
  return (
    f.full_name ||
    f.name ||
    [f.first_name, f.last_name].filter(Boolean).join(' ') ||
    'Lead sem nome'
  )
}

/* Nome da campanha (o "nicho") a partir do ad_id — vira tag para filtrar no CRM.
   Cai para o nome do anúncio se a campanha não vier. Best-effort: se falhar,
   o lead ainda é salvo, só sem o rótulo de nicho. */
async function fetchNicheLabel(adId, token) {
  if (!adId || !token) return null
  try {
    const { data } = await axios.get(`${GRAPH}/${adId}`, {
      params: { fields: 'name,campaign{name}', access_token: token },
      timeout: 10_000,
    })
    return data.campaign?.name || data.name || null
  } catch (err) {
    console.warn('[meta-leads] não obteve nome da campanha/anúncio:',
      err.response?.data?.error?.message ?? err.message)
    return null
  }
}

/* Upsert no CRM. Dedup por telefone/e-mail. Marca canal, tag e o nicho/campanha.
   Nunca "rebaixa" um contato existente (mantém a tag/stage dele); só agrega as
   tags de nicho. Se o insert completo falhar (coluna ausente no banco), NÃO
   perde o lead pago — reinsere com o conjunto mínimo garantido. */
async function upsertClient({ userId, name, phone, email, channel, nicheLabel, source, sourceMeta }) {
  let existing = null

  if (phone) {
    const { data } = await supabase
      .from('clients').select('id, tags')
      .eq('user_id', userId).eq('phone', phone).limit(1)
    existing = data?.[0] || null
  }
  if (!existing && email) {
    const { data } = await supabase
      .from('clients').select('id, tags')
      .eq('user_id', userId).eq('email', email).limit(1)
    existing = data?.[0] || null
  }

  const nicheTags = ['lead pago', nicheLabel].filter(Boolean)

  if (existing) {
    const tags = Array.from(new Set([...(existing.tags || []), ...nicheTags]))
    const patch = { name, source, source_meta: sourceMeta, tags }
    if (phone) patch.phone = phone
    if (email) patch.email = email
    await supabase.from('clients').update(patch).eq('id', existing.id)
    return { id: existing.id, created: false }
  }

  // Insert completo: colunas que o CRM exibe (channel/tag) + rastreio (source).
  const full = {
    user_id: userId, name, phone, email,
    channel: channel || 'facebook',
    tag: 'Lead Quente',
    stage: 'lead', status: 'active',
    tags: nicheTags,
    source, source_meta: sourceMeta,
  }
  let res = await supabase.from('clients').insert(full).select('id').single()
  if (res.error) {
    // Defesa contra schema divergente (SQL manual): não perde o lead pago.
    console.warn('[meta-leads] insert completo falhou, reinserindo mínimo:', res.error.message)
    res = await supabase.from('clients')
      .insert({ user_id: userId, name, phone, email, status: 'active' })
      .select('id').single()
  }
  if (res.error) throw res.error
  return { id: res.data?.id, created: true }
}

/* Busca o lead na Graph e persiste no CRM.
   Chamado (fire-and-forget) pelo metaClient ao receber um evento `leadgen`. */
async function ingestLead({ leadgenId, pageToken, userId, adId, formId, createdTime, channel }) {
  if (!isConfigured || !userId || !leadgenId || !pageToken) return

  let fields = {}
  try {
    const { data } = await axios.get(`${GRAPH}/${leadgenId}`, {
      params: { fields: 'field_data,ad_id,form_id,created_time', access_token: pageToken },
      timeout: 15_000,
    })
    // field_data: [{ name:'full_name', values:['João'] }, { name:'email', values:['...'] }, ...]
    for (const item of data.field_data || []) {
      fields[item.name] = (item.values && item.values[0]) || ''
    }
    adId = data.ad_id || adId
    formId = data.form_id || formId
    createdTime = data.created_time || createdTime
  } catch (err) {
    console.warn('[meta-leads] falha ao buscar lead', leadgenId,
      err.response?.data?.error?.message ?? err.message,
      '(permissão leads_retrieval liberada?)')
    return
  }

  const name = pickName(fields)
  const phone = normalizePhone(
    fields.phone_number || fields.phone || fields.telefone || fields.whatsapp_number || ''
  )
  const email = fields.email || null
  const nicheLabel = await fetchNicheLabel(adId, pageToken)

  const sourceMeta = {
    leadgen_id: leadgenId,
    ad_id: adId || null,
    form_id: formId || null,
    campaign: nicheLabel || null,
    created_time: createdTime || null,
    fields, // guarda TODOS os campos do formulário (inclusive perguntas customizadas)
  }

  try {
    const { id, created } = await upsertClient({
      userId, name, phone, email,
      channel: channel || 'facebook',
      nicheLabel, source: 'meta_lead_ad', sourceMeta,
    })
    console.log(`[meta-leads] lead ${created ? 'criado' : 'atualizado'} (${id}): ${name} · ${phone || email || 's/ contato'} · nicho=${nicheLabel || '—'} · user=${userId}`)
    // Tempo real: o CRM atualiza na hora e mostra um toast de novo lead.
    io?.emit('new_lead', {
      id, name, phone, email,
      channel: channel || 'facebook',
      niche: nicheLabel || null,
      created,
    })
  } catch (err) {
    console.error('[meta-leads] falha ao salvar lead no CRM:', err?.message ?? err)
  }
}

module.exports = { ingestLead, setIo }
