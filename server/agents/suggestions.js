// "Ações sugeridas": os agentes olham os dados da conta e propõem ações concretas.
// Nada roda sozinho: cada sugestão lista o que será feito e só executa quando o usuário clica
// em "Aprovar e fazer" (POST /api/agents/suggestions/run). O servidor recalcula a sugestão pelo
// id — o navegador nunca escolhe ferramenta nem entrada.
const { supabase } = require('../supabaseClient')
const { emitToUser } = require('../realtime')
const service = require('./service')
const { TOOLS } = require('./tools/catalog')
const { validate } = require('./tools/executor')
const { buildToolContext } = require('./toolContext')
const pageContext = require('./pageContext')

const MAX_ITEMS = 8
const ran = new Map() // `${userId}:${id}` → hora (não repete a mesma sugestão por 30 min)
const RAN_TTL = 30 * 60_000
const today = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
const first = (n) => String(n || '').split(' ')[0] || 'oi'
const safe = async (p, fallback) => { try { return await p } catch { return fallback } }
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

async function collect(userId) {
  const pilot = require('../sales/pilot')
  const team = require('../team/nudge')
  const d = today()
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const [settings, opps, stale, recentLeads, invoices, projects, overview, msgCount] = await Promise.all([
    safe(pilot.getSettings(userId), { hot_threshold: 75 }),
    safe(pilot.listOpportunities(userId, { status: 'open', limit: 40 }), null),
    safe(supabase.from('clients').select('id,name,phone,created_at').eq('user_id', userId).eq('stage', 'lead').lt('created_at', weekAgo).order('created_at', { ascending: true }).limit(MAX_ITEMS).then(r => r.data || []), []),
    safe(supabase.from('clients').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', weekAgo).then(r => r.count ?? 0), 0),
    safe(supabase.from('invoices').select('id,client_id,client_name,description,amount,due_date').eq('user_id', userId).neq('status', 'paid').lt('due_date', d).not('client_id', 'is', null).order('due_date', { ascending: true }).limit(5).then(r => r.data || []), []),
    safe(supabase.from('projects').select('id,name,client_name,due_date,steps').eq('user_id', userId).neq('status', 'done').lt('due_date', d).limit(4).then(r => r.data || []), []),
    safe(team.teamOverview(userId), { people: [] }),
    safe(supabase.from('messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', new Date(Date.now() - 14 * 86_400_000).toISOString()).then(r => r.count ?? 0), 0),
  ])
  return { settings, opps, stale, recentLeads, invoices, projects, overview, msgCount }
}

// Lista de sugestões (pura sobre os dados coletados; testável).
function build(data) {
  const out = []
  const hot = (data.opps || []).filter(o => o.status === 'new' && o.score >= (data.settings?.hot_threshold || 75) && o.client_id).slice(0, MAX_ITEMS)
  if (hot.length) {
    out.push({
      id: `hot-followup:${hot.map(o => o.id).join(',').slice(0, 120)}`, agent_kind: 'comercial', risk: 'medio', pages: ['/vendas-ia', '/crm', '/dashboard', '/hoje'],
      title: hot.length === 1 ? `Criar retorno para ${hot[0].contact_name}` : `Criar retorno para ${hot.length} leads prontos para comprar`,
      why: `Mostraram intenção de compra alta e ainda não foram contatados. Uma tarefa para hoje garante que ninguém esfria.`,
      preview: hot.map(o => `${o.contact_name} — ${o.score}%${o.last_message ? `: “${String(o.last_message).slice(0, 60)}”` : ''}`),
      steps: hot.map(o => ({ tool: 'create_task', input: { title: `Responder ${o.contact_name} (intenção ${o.score}%)`, due: 'hoje', client_id: o.client_id } })),
    })
  }
  if (data.opps && data.opps.length === 0 && data.msgCount > 0) {
    out.push({
      id: 'scan-conversations', agent_kind: 'prospector', risk: 'medio', pages: ['/vendas-ia', '/chat', '/dashboard', '/prospeccao'],
      title: 'Achar compradores nas conversas dos últimos 14 dias',
      why: `Há ${data.msgCount} mensagens recentes e nenhuma oportunidade marcada. Leio todas e separo quem quer comprar — sem enviar nada a ninguém.`,
      preview: ['Lê as mensagens recebidas', 'Dá nota de intenção a cada conversa', 'Coloca as quentes no Piloto de Vendas'],
      steps: [{ tool: 'scan_conversations_for_leads', input: { days: 14 } }],
    })
  }
  if ((data.stale || []).length) {
    out.push({
      id: `stale-followup:${data.stale.map(c => c.id).join(',').slice(0, 120)}`, agent_kind: 'comercial', risk: 'medio', pages: ['/crm', '/dashboard', '/hoje', '/funnel'],
      title: `Retomar ${data.stale.length} lead${data.stale.length === 1 ? '' : 's'} parado${data.stale.length === 1 ? '' : 's'} em "Novo"`,
      why: 'Estão há mais de 7 dias sem sair da primeira etapa. Uma tarefa de retomada para hoje em cada um.',
      preview: data.stale.map(c => c.name || c.phone || 'Sem nome'),
      steps: data.stale.map(c => ({ tool: 'create_task', input: { title: `Retomar contato com ${c.name || c.phone || 'lead'}`, due: 'hoje', client_id: c.id } })),
    })
  }
  if ((data.invoices || []).length) {
    out.push({
      id: `invoice-reminders:${data.invoices.map(i => i.id).join(',').slice(0, 120)}`, agent_kind: 'analista', risk: 'alto', pages: ['/billing', '/dashboard'],
      title: `Enviar lembrete de cobrança para ${data.invoices.length} cliente${data.invoices.length === 1 ? '' : 's'} pelo WhatsApp`,
      why: `Somam ${brl(data.invoices.reduce((a, i) => a + (Number(i.amount) || 0), 0))} vencidos. Mensagem gentil, uma por cliente.`,
      preview: data.invoices.map(i => `${i.client_name || 'Cliente'} — ${brl(i.amount)} (venceu ${String(i.due_date).split('-').reverse().join('/')})`),
      steps: data.invoices.map(i => ({ tool: 'send_whatsapp', input: { client_id: i.client_id, text: `Olá, ${first(i.client_name)}! Passando para lembrar da cobrança de ${brl(i.amount)}${i.description ? ` referente a "${i.description}"` : ''}, vencida em ${String(i.due_date).split('-').reverse().join('/')}. Se já pagou, desconsidere. Qualquer dúvida, é só responder.` } })),
    })
  }
  for (const p of (data.overview?.people || []).filter(x => x.waiting_conversations > 0 && x.oldest_wait_minutes >= 30).slice(0, 3)) {
    const wait = p.oldest_wait_minutes >= 60 ? `${Math.floor(p.oldest_wait_minutes / 60)}h${String(p.oldest_wait_minutes % 60).padStart(2, '0')}` : `${p.oldest_wait_minutes} min`
    out.push({
      id: `nudge:${p.member_id}`, agent_kind: 'metas', risk: 'alto', pages: ['/monitor', '/chat', '/dashboard'],
      title: `Chamar ${p.name}: ${p.waiting_conversations === 1 ? '1 cliente esperando' : `${p.waiting_conversations} clientes esperando`} há ${wait}`,
      why: p.status === 'offline' ? 'A pessoa está offline com cliente aguardando.' : 'Cliente esperando muito tempo derruba a conversão.',
      preview: [`Recado na tela de ${first(p.name)}`],
      steps: [{ tool: 'nudge_team_member', input: { name: p.name, message: `${first(p.name)}, tem ${p.waiting_conversations === 1 ? 'um cliente' : `${p.waiting_conversations} clientes`} esperando resposta há ${wait}. Consegue ver agora?` } }],
    })
  }
  for (const p of (data.projects || []).slice(0, 2)) {
    const next = (Array.isArray(p.steps) ? p.steps : []).find(s => !s.done)
    out.push({
      id: `project:${p.id}`, agent_kind: 'agenda', risk: 'medio', pages: ['/projetos', '/hoje', '/dashboard'],
      title: `Destravar o projeto "${p.name}"`,
      why: `Passou do prazo${p.client_name ? ` (${p.client_name})` : ''}. Uma tarefa para hoje no próximo passo.`,
      preview: [next ? `Próximo passo: ${next.title}` : 'Revisar o checklist e combinar nova data'],
      steps: [{ tool: 'create_task', input: { title: next ? `Projeto ${p.name}: ${next.title}` : `Projeto ${p.name}: combinar nova data com o cliente`, due: 'hoje' } }],
    })
  }
  if ((data.recentLeads ?? 0) < 5) {
    out.push({
      id: 'prospect', agent_kind: 'prospector', risk: 'baixo', pages: ['/prospeccao', '/crm', '/dashboard', '/vendas-ia'],
      title: 'Buscar leads novos para o funil',
      why: data.recentLeads ? `Só ${data.recentLeads} lead${data.recentLeads === 1 ? '' : 's'} novo${data.recentLeads === 1 ? '' : 's'} nesta semana.` : 'Nenhum lead novo nesta semana.',
      preview: ['O Pino pergunta o nicho e a cidade', 'Busca no Google Maps usando o crédito grátis', 'Mostra os melhores antes de cadastrar'],
      prompt: 'Quero leads novos. Me pergunte o nicho e a cidade, busque no Google Maps (só no crédito grátis) e me mostre os melhores com telefone antes de cadastrar.',
    })
  }
  return out
}

// Ordem: primeiro o que é da tela atual, depois risco/impacto.
function sortForPage(list, path) {
  const p = String(path || '').split('?')[0]
  const onPage = (s) => (s.pages || []).some(x => p === x || p.startsWith(x + '/'))
  return [...list].sort((a, b) => Number(onPage(b)) - Number(onPage(a)))
}

async function list(userId, { path } = {}) {
  const agents = await service.listAgents(userId).catch(() => [])
  const byKind = Object.fromEntries(agents.map(a => [a.kind, a]))
  const items = sortForPage(build(await collect(userId)), path || pageContext.getPage(userId))
  return items
    .filter(s => !(ran.get(`${userId}:${s.id}`) > Date.now() - RAN_TTL))
    .map(s => ({
      id: s.id, agent_kind: s.agent_kind, agent_id: byKind[s.agent_kind]?.id || null, agent_name: byKind[s.agent_kind]?.name || null,
      title: s.title, why: s.why, risk: s.risk, preview: s.preview, actions: s.steps?.length || 0, prompt: s.prompt || null,
      on_page: (s.pages || []).includes(String(path || '').split('?')[0]),
    }))
}

async function postSystem(userId, agentId, content) {
  if (!agentId) return
  const thread = await service.getDirectThread(userId, agentId)
  const { data: msg } = await supabase.from('agent_messages').insert({ user_id: userId, agent_id: agentId, thread_id: thread.id, author_kind: 'system', content })
    .select('id, author_kind, content, created_at').single()
  if (msg) emitToUser(userId, 'agent_message', { agent_id: agentId, message: msg })
}

async function run(userId, id, { decidedBy } = {}) {
  const key = `${userId}:${id}`
  if (ran.get(key) > Date.now() - RAN_TTL) throw Object.assign(new Error('Esta ação já foi feita.'), { status: 409 })
  const s = build(await collect(userId)).find(x => x.id === id)
  if (!s) throw Object.assign(new Error('Esta sugestão não vale mais (os dados mudaram). Atualize a lista.'), { status: 410 })
  if (!s.steps?.length) throw Object.assign(new Error('Esta sugestão é uma conversa com o agente.'), { status: 400 })
  ran.set(key, Date.now())

  const agents = await service.listAgents(userId).catch(() => [])
  const agent = agents.find(a => a.kind === s.agent_kind) || agents[0]
  if (!agent) throw Object.assign(new Error('Nenhum agente nesta conta.'), { status: 404 })
  const ctx = await buildToolContext({ userId, agent })
  const results = []
  for (const step of s.steps) {
    const tool = TOOLS[step.tool]
    const v = tool ? validate(tool.schema, step.input) : { error: 'ferramenta inexistente' }
    if (v.error) { results.push({ ok: false, error: v.error }); continue }
    try { results.push({ ok: true, result: await tool.run(ctx, v.value) }) }
    catch (e) { results.push({ ok: false, error: e?.message || String(e) }) }
  }
  const done = results.filter(r => r.ok).length
  const firstError = results.find(r => !r.ok)?.error
  await supabase.from('agent_events').insert({
    user_id: userId, agent_id: agent.id, type: 'suggestion_run',
    payload: { suggestion: s.id, title: s.title, decided_by: decidedBy || userId, done, total: results.length },
  }).then(() => {}, () => {})
  await postSystem(userId, agent.id, `Você aprovou: ${s.title}. Feito: ${done} de ${results.length}.${firstError ? ` Primeiro problema: ${firstError}` : ''}`).catch(() => {})
  if (!done) ran.delete(key)
  return { ok: done > 0, done, total: results.length, error: firstError || null, agent: agent.name }
}

module.exports = { list, run, build, sortForPage }
