// Captação de leads do Meta Lead Ads (formulários do tráfego pago).
//
// Quando alguém preenche um formulário de anúncio, a Meta envia um evento
// `leadgen` no webhook da página (tratado em metaClient.handleWebhookEvent).
// Aqui buscamos os dados completos do lead na Graph API e salvamos no CRM
// (tabela clients), marcando a origem (campanha/anúncio) em source/source_meta.
//
// Requisito de permissão: `leads_retrieval` (App Review da Meta). Sem ela, o
// GET do lead falha e o lead não é salvo — o resto do webhook segue normal.
const axios = require('axios')
const { supabase, isConfigured } = require('./supabaseClient')

const GRAPH = 'https://graph.facebook.com/v21.0'

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

/* Upsert manual no CRM (não há unique em user_id,phone).
   Reaproveita o lead se já existir pelo telefone ou e-mail; senão, cria. */
async function upsertClient({ userId, name, phone, email, source, sourceMeta }) {
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

  const tags = Array.from(new Set([...(existing?.tags || []), 'lead pago']))

  if (existing) {
    const patch = { name, source, source_meta: sourceMeta, tags }
    if (phone) patch.phone = phone
    if (email) patch.email = email
    await supabase.from('clients').update(patch).eq('id', existing.id)
    return { id: existing.id, created: false }
  }

  const { data, error } = await supabase.from('clients').insert({
    user_id: userId, name, phone, email,
    stage: 'lead', status: 'active',
    source, source_meta: sourceMeta, tags,
  }).select('id').single()
  if (error) throw error
  return { id: data?.id, created: true }
}

/* Busca o lead na Graph e persiste no CRM.
   Chamado (fire-and-forget) pelo metaClient ao receber um evento `leadgen`. */
async function ingestLead({ leadgenId, pageToken, userId, adId, formId, createdTime }) {
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
  const phone = normalizePhone(fields.phone_number || fields.phone || fields.telefone || '')
  const email = fields.email || null

  const sourceMeta = {
    leadgen_id: leadgenId,
    ad_id: adId || null,
    form_id: formId || null,
    created_time: createdTime || null,
    fields, // guarda TODOS os campos do formulário (inclusive perguntas customizadas)
  }

  try {
    const { id, created } = await upsertClient({
      userId, name, phone, email, source: 'meta_lead_ad', sourceMeta,
    })
    console.log(`[meta-leads] lead ${created ? 'criado' : 'atualizado'} (${id}): ${name} · ${phone || email || 's/ contato'} · user=${userId}`)
  } catch (err) {
    console.error('[meta-leads] falha ao salvar lead no CRM:', err?.message ?? err)
  }
}

module.exports = { ingestLead }
