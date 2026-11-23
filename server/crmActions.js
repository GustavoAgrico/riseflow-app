// Ações de CRM executadas pelo servidor em nome do dono da conta.
// Usadas pelos nós "Criar tarefa" / "Mover etapa" do builder (flowEngine.js)
// e pelas ferramentas da IA (aiAttendant.js).
//
// Service role ignora RLS: TODA query aqui filtra por user_id manualmente.
const { supabase, isConfigured } = require('./supabaseClient')

const DEFAULT_STAGES = [
  { key: 'lead', label: 'Novo Lead', kind: 'open' },
  { key: 'qual', label: 'Qualificado', kind: 'open' },
  { key: 'prop', label: 'Proposta', kind: 'open' },
  { key: 'neg', label: 'Negociação', kind: 'open' },
  { key: 'closed', label: 'Fechado', kind: 'won' },
  { key: 'lost', label: 'Perdido', kind: 'lost' },
]

const digitsOf = (s) => String(s ?? '').replace(/\D/g, '')
// Canais com prefixo (tg/fb/ig) usam o identificador inteiro; WhatsApp, os dígitos.
const isChannelId = (s) => /^(tg|fb|ig)/.test(String(s ?? ''))

/* Compara telefones pelos 8 últimos dígitos (tolera DDI, DDD, 9º dígito e máscara). */
function samePhone(a, b) {
  if (isChannelId(a) || isChannelId(b)) return String(a) === String(b)
  const da = digitsOf(a), db = digitsOf(b)
  if (da.length < 8 || db.length < 8) return da && da === db
  return da.slice(-8) === db.slice(-8)
}

async function getStages(userId) {
  const { data } = await supabase.from('pipeline_stages')
    .select('key, label, kind, position').eq('user_id', userId).order('position', { ascending: true })
  return data && data.length ? data : DEFAULT_STAGES
}

/* Acha a etapa pela chave ou pelo nome ("Proposta", "proposta", "prop"). */
function resolveStage(stages, wanted) {
  const w = String(wanted ?? '').trim().toLowerCase()
  if (!w) return null
  return stages.find(s => s.key.toLowerCase() === w)
    || stages.find(s => String(s.label).toLowerCase() === w)
    || stages.find(s => String(s.label).toLowerCase().includes(w))
    || null
}

async function findClientByPhone(userId, phone) {
  if (!userId || !phone) return null
  if (isChannelId(phone)) {
    const { data } = await supabase.from('clients').select('*').eq('user_id', userId).eq('phone', phone).limit(1)
    return data?.[0] ?? null
  }
  const d = digitsOf(phone)
  if (!d) return null
  const { data: exact } = await supabase.from('clients').select('*').eq('user_id', userId).ilike('phone', `%${d.slice(-8)}%`).limit(5)
  const hit = (exact || []).find(c => samePhone(c.phone, d))
  if (hit) return hit
  // Telefone gravado com máscara ("(11) 9999-8888"): compara os dígitos aqui.
  const { data: all } = await supabase.from('clients').select('*').eq('user_id', userId).not('phone', 'is', null).limit(5000)
  return (all || []).find(c => samePhone(c.phone, d)) ?? null
}

/* Cliente da conversa; cria um lead novo se o contato ainda não está no CRM. */
async function ensureClient(userId, { phone, name }) {
  const found = await findClientByPhone(userId, phone)
  if (found) return found
  const row = {
    user_id: userId,
    name: name || (isChannelId(phone) ? 'Contato' : `+${digitsOf(phone)}`),
    phone: isChannelId(phone) ? phone : digitsOf(phone),
    stage: 'lead',
    status: 'active',
  }
  const { data, error } = await supabase.from('clients').insert(row).select('*').single()
  if (error) throw error
  return data
}

/* "hoje", "amanhã", "+3", "3" (dias) ou data ISO → 'YYYY-MM-DD' (horário de Brasília). */
function resolveDueDate(input, now = new Date()) {
  const raw = String(input ?? '').trim().toLowerCase()
  const brt = new Date(now.getTime() - 3 * 3600_000) // UTC-3
  const iso = (d) => d.toISOString().slice(0, 10)
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  if (raw === 'hoje') return iso(brt)
  if (raw === 'amanha' || raw === 'amanhã') return iso(new Date(brt.getTime() + 86_400_000))
  const m = /^\+?(\d{1,3})$/.exec(raw)
  if (m) return iso(new Date(brt.getTime() + Number(m[1]) * 86_400_000))
  return null
}

async function createTask(userId, { phone, name, title, due }) {
  if (!userId) throw new Error('Conta não identificada')
  const t = String(title ?? '').trim()
  if (!t) throw new Error('Tarefa sem título')
  const client = await ensureClient(userId, { phone, name })
  const { data, error } = await supabase.from('crm_tasks').insert({
    user_id: userId, client_id: client.id, title: t.slice(0, 300), due_date: resolveDueDate(due), done: false,
  }).select('*').single()
  if (error) throw error
  return { task: data, client }
}

async function moveStage(userId, { phone, name, stage }) {
  if (!userId) throw new Error('Conta não identificada')
  const stages = await getStages(userId)
  const target = resolveStage(stages, stage)
  if (!target) throw new Error(`Etapa "${stage}" não existe. Etapas: ${stages.map(s => s.label).join(', ')}`)
  const client = await ensureClient(userId, { phone, name })
  if (client.stage === target.key) return { client, stage: target, changed: false }
  // won_at é preenchido pelo gatilho clients_set_won_at quando a etapa é "ganho".
  const { data, error } = await supabase.from('clients').update({ stage: target.key })
    .eq('id', client.id).eq('user_id', userId).select('*').single()
  if (error) throw error
  try { require('./realtime').emitSalesUpdate(userId, 'clients') } catch { /* sem socket */ }
  return { client: data, stage: target, changed: true }
}

/* Reunião na agenda (tabela meetings, que também alimenta o feed iCal). */
async function scheduleMeeting(userId, { phone, name, title, date, time, duration, notes }) {
  if (!userId) throw new Error('Conta não identificada')
  const day = resolveDueDate(date)
  if (!day) throw new Error('Data inválida (use AAAA-MM-DD, "hoje", "amanhã" ou +N dias)')
  if (time && !/^\d{1,2}:\d{2}$/.test(String(time))) throw new Error('Horário inválido (use HH:MM)')
  const client = await ensureClient(userId, { phone, name })
  const { data, error } = await supabase.from('meetings').insert({
    user_id: userId,
    title: String(title || `Reunião com ${client.name}`).slice(0, 200),
    description: notes ? String(notes).slice(0, 1000) : null,
    date: day,
    time: time ? String(time).padStart(5, '0') : null,
    duration: Number(duration) > 0 ? Math.min(Number(duration), 480) : 60,
    client_name: client.name,
    client_id: client.id,
  }).select('*').single()
  if (error) throw error
  return { meeting: data, client }
}

module.exports = {
  isConfigured: () => isConfigured,
  DEFAULT_STAGES, samePhone, resolveStage, resolveDueDate, getStages,
  findClientByPhone, ensureClient, createTask, moveStage, scheduleMeeting,
}
