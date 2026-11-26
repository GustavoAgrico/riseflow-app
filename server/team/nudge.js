// Recado do gestor para alguém da equipe (Monitor do time e agentes).
// Aparece na tela da pessoa (socket na sala da conta, filtrado pelo memberId no navegador)
// e fica no sino da conta para quem estiver offline.
const { supabase } = require('../supabaseClient')
const { emitToUser } = require('../realtime')

const lastNudge = new Map() // `${owner}:${memberId}` → hora (evita disparos repetidos)
const clean = (s, max) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)
const fail = (msg, status) => Object.assign(new Error(msg), { status, expected: true })

async function findMember(userId, { memberId, name }) {
  let q = supabase.from('team_members').select('id,name,status').eq('user_id', userId)
  if (memberId) q = q.eq('id', memberId)
  else q = q.ilike('name', `%${clean(name, 60).replace(/[%,()*]/g, ' ')}%`)
  const { data, error } = await q.limit(3)
  if (error) throw error
  if (!data?.length) throw fail('Pessoa não encontrada na sua equipe.', 404)
  if (data.length > 1 && !memberId) throw fail(`Mais de uma pessoa parecida: ${data.map(m => m.name).join(', ')}. Diga o nome completo.`, 409)
  return data[0]
}

async function sendNudge(userId, { memberId, name, message, from = 'Gestor' }) {
  const text = clean(message, 400)
  if (!text) throw fail('Escreva o recado.', 400)
  const member = await findMember(userId, { memberId, name })
  const key = `${userId}:${member.id}`
  if (Date.now() - (lastNudge.get(key) || 0) < 10000) throw fail('Aguarde alguns segundos antes de chamar de novo.', 429)
  lastNudge.set(key, Date.now())
  const sender = clean(from, 60) || 'Gestor'
  await supabase.from('notifications').insert({ user_id: userId, type: 'team', title: `📣 ${sender} chamou ${member.name}`, message: text }).then(() => {}, () => {})
  emitToUser(userId, 'team_nudge', { memberId: member.id, memberName: member.name, message: text, from: sender, at: new Date().toISOString() })
  return { sent: true, member: member.name, delivered: member.status === 'online' ? 'agora' : 'quando entrar' }
}

// Situação de cada pessoa: conversas abertas, clientes esperando e a maior espera.
async function teamOverview(userId) {
  const [{ data: members }, { data: convs }] = await Promise.all([
    supabase.from('team_members').select('id,name,role,status').eq('user_id', userId),
    supabase.from('conversations').select('assigned_to,unread_count,status,last_message_at').eq('user_id', userId),
  ])
  const open = (convs || []).filter(c => !['closed', 'resolved', 'done', 'finished', 'encerrada'].includes(String(c.status || '').toLowerCase()))
  const now = Date.now()
  const people = (members || []).map(m => {
    const mine = open.filter(c => c.assigned_to === m.name)
    const waiting = mine.filter(c => Number(c.unread_count) > 0)
    const oldest = waiting.reduce((a, c) => Math.max(a, Math.round((now - new Date(c.last_message_at || now).getTime()) / 60000)), 0)
    return { member_id: m.id, name: m.name, role: m.role, status: m.status || 'offline', open_conversations: mine.length, waiting_conversations: waiting.length, oldest_wait_minutes: oldest }
  }).sort((a, b) => b.oldest_wait_minutes - a.oldest_wait_minutes)
  return { people, unassigned: open.filter(c => !c.assigned_to).length }
}

module.exports = { sendNudge, teamOverview, findMember }
