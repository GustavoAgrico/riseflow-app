// Desempenho da equipe para o Monitor do time. Funções puras.
// Nota 0–100 por pessoa: o que mais pesa é cliente esperando (tempo e quantidade);
// respostas do dia e vendas do mês somam pontos. Motivos legíveis explicam a nota.

const isOpenConv = (s) => !['closed', 'resolved', 'done', 'finished', 'encerrada'].includes(String(s || '').toLowerCase())
const minsSince = (t, now) => (t ? Math.max(0, Math.round((now - new Date(t).getTime()) / 60000)) : 0)

export const LEVELS = {
  otimo: { label: 'Excelente', color: '#22C55E' },
  bom: { label: 'Bom', color: '#3B82F6' },
  atencao: { label: 'Atenção', color: '#EAB308' },
  critico: { label: 'Crítico', color: '#EF4444' },
}
export const levelOf = (score) => (score >= 80 ? 'otimo' : score >= 60 ? 'bom' : score >= 40 ? 'atencao' : 'critico')

export function fmtWait(min) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

// member: { id, name, status }. convs: conversas da conta. sentToday: { [nome]: n }. wins: { [nome]: { count, value } }.
export function memberStats(member, { convs = [], sentToday = {}, wins = {}, now = Date.now() } = {}) {
  const mine = convs.filter(c => isOpenConv(c.status) && c.assigned_to === member.name)
  const waitingConvs = mine.filter(c => Number(c.unread_count) > 0)
  const waiting = waitingConvs.reduce((a, c) => a + (Number(c.unread_count) || 0), 0)
  const oldestWait = waitingConvs.reduce((a, c) => Math.max(a, minsSince(c.last_message_at, now)), 0)
  const sent = Number(sentToday[member.name]) || 0
  const won = wins[member.name] || { count: 0, value: 0 }

  let score = 70
  score += Math.min(15, sent)
  score += Math.min(15, won.count * 5)
  if (waitingConvs.length) {
    score -= Math.min(35, Math.round(oldestWait / 4))
    score -= Math.min(20, waiting * 2)
    if (member.status === 'offline') score -= 10
  }
  score = Math.max(0, Math.min(100, Math.round(score)))

  const reasons = []
  if (waitingConvs.length) {
    reasons.push({ tone: oldestWait >= 30 ? 'bad' : 'warn', text: `${waitingConvs.length === 1 ? '1 cliente esperando' : `${waitingConvs.length} clientes esperando`} há ${fmtWait(oldestWait)}` })
    if (member.status === 'offline') reasons.push({ tone: 'bad', text: 'Está offline com clientes esperando' })
  }
  if (member.status === 'online' && mine.length > 0 && sent === 0) reasons.push({ tone: 'warn', text: 'Nenhuma resposta enviada hoje' })
  if (sent > 0) reasons.push({ tone: 'good', text: `${sent} resposta${sent === 1 ? '' : 's'} hoje` })
  if (won.count > 0) reasons.push({ tone: 'good', text: `${won.count} venda${won.count === 1 ? '' : 's'} no mês` })

  return { active: mine.length, waiting, waitingConvs: waitingConvs.length, oldestWait, sent, wonCount: won.count, wonValue: won.value, score, level: levelOf(score), reasons, convs: mine }
}

// Quem precisa de atenção do gestor, do pior para o melhor.
export const needsAttention = (rows) => rows.filter(r => r.level === 'atencao' || r.level === 'critico').sort((a, b) => a.score - b.score)

// Mensagens prontas para o "Chamar", conforme o motivo.
export function nudgeTemplates(row) {
  const first = String(row?.name || '').split(' ')[0] || 'oi'
  const t = []
  if (row?.waitingConvs) t.push(`${first}, tem ${row.waitingConvs === 1 ? 'um cliente' : `${row.waitingConvs} clientes`} esperando resposta há ${fmtWait(row.oldestWait)}. Consegue ver agora?`)
  if (row?.status === 'offline' && row?.waitingConvs) t.push(`${first}, você está offline e tem cliente aguardando. Pode voltar ou prefere que eu redistribua?`)
  if (row?.level === 'otimo' || row?.wonCount) t.push(`Mandou muito bem hoje, ${first}! 🎉 Continue assim.`)
  t.push(`${first}, vamos priorizar os leads quentes do Piloto de Vendas agora?`)
  t.push(`${first}, me chama quando puder — quero alinhar o atendimento rapidinho.`)
  return [...new Set(t)].slice(0, 4)
}

// Respostas enviadas hoje por atendente, a partir das mensagens (sender_name).
export function sentTodayByName(messages, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const out = {}
  for (const m of messages || []) {
    const d = String(m.direction || '').toLowerCase()
    if (!(d === 'outbound' || d === 'sent' || d === 'out')) continue
    if (!m.sender_name || new Date(m.created_at).getTime() < start) continue
    out[m.sender_name] = (out[m.sender_name] || 0) + 1
  }
  return out
}

export function winsByName(clients) {
  const out = {}
  for (const c of clients || []) {
    if (!c.assigned_to) continue
    const w = out[c.assigned_to] || { count: 0, value: 0 }
    w.count += 1; w.value += Number(c.value) || 0
    out[c.assigned_to] = w
  }
  return out
}
