// Catálogo de ferramentas dos agentes (docs/PLANO_AGENTES_FASES_1_2.md, fase 2).
// Cada ferramenta: name, description, risk ('baixo' | 'medio' | 'alto'), schema (JSON Schema
// enviado ao modelo), run(ctx, input) e, nas de risco alto, describe(ctx, input) — o texto
// do cartão "PEDE APROVAÇÃO".
// Toda query filtra ctx.userId: o modelo nunca escolhe a conta (não há user_id nos esquemas).
// ctx.db é o cliente Supabase (service role) e ctx.deps os serviços; os testes trocam os dois.

const LIMIT = 20

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const int = (description, extra = {}) => ({ type: 'integer', description, ...extra })
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false })

function notFound(what = 'Lead') { return Object.assign(new Error(`${what} não encontrado nesta conta.`), { expected: true }) }

// Texto do usuário dentro de um filtro .or() do PostgREST: tira o que quebra a sintaxe.
const safeLike = (q) => String(q || '').replace(/[,()%*\\]/g, ' ').trim().slice(0, 60)

async function getClient(ctx, clientId, fields = 'id, name, company, phone, stage, value') {
  const { data, error } = await ctx.db.from('clients').select(fields).eq('id', clientId).eq('user_id', ctx.userId).maybeSingle()
  if (error) throw error
  if (!data) throw notFound()
  return data
}

async function getStages(ctx) {
  const { data } = await ctx.db.from('pipeline_stages').select('key, label, kind, position').eq('user_id', ctx.userId).order('position', { ascending: true })
  return data && data.length ? data : ctx.deps.crm.DEFAULT_STAGES
}

const todayBrt = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)

const TOOLS = {
  // ── CRM: leitura (baixo) ────────────────────────────────────────────────
  search_contacts: {
    risk: 'baixo',
    description: 'Busca leads/clientes do CRM por nome, empresa ou telefone. Sem termo, traz os mais recentes. Use antes de agir sobre um lead para obter o id.',
    schema: obj({ query: str('Nome, empresa ou telefone (opcional)'), limit: int('Máximo de resultados (até 20)', { minimum: 1, maximum: LIMIT }) }),
    async run(ctx, { query, limit }) {
      let q = ctx.db.from('clients').select('id, name, company, phone, stage, value, tags, updated_at')
        .eq('user_id', ctx.userId).order('updated_at', { ascending: false }).limit(Math.min(Number(limit) || 10, LIMIT))
      const term = safeLike(query)
      if (term) q = q.or(`name.ilike.%${term}%,company.ilike.%${term}%,phone.ilike.%${term.replace(/\D/g, '') || term}%`)
      const { data, error } = await q
      if (error) throw error
      return { contacts: data || [] }
    },
  },

  list_tasks: {
    risk: 'baixo',
    description: 'Lista tarefas abertas do CRM: todas, só as atrasadas ou só as de hoje. Pode filtrar por lead.',
    schema: obj({ filter: str('abertas, atrasadas ou hoje', { enum: ['abertas', 'atrasadas', 'hoje'] }), client_id: str('Id do lead (opcional)') }),
    async run(ctx, { filter = 'abertas', client_id }) {
      let q = ctx.db.from('crm_tasks').select('id, title, due_date, client_id').eq('user_id', ctx.userId).eq('done', false)
        .order('due_date', { ascending: true, nullsFirst: false }).limit(30)
      const today = todayBrt()
      if (filter === 'atrasadas') q = q.lt('due_date', today)
      if (filter === 'hoje') q = q.eq('due_date', today)
      if (client_id) q = q.eq('client_id', client_id)
      const { data, error } = await q
      if (error) throw error
      return { today, tasks: data || [] }
    },
  },

  list_pipeline: {
    risk: 'baixo',
    description: 'Resumo do funil de vendas: quantos leads e quanto valor há em cada etapa.',
    schema: obj({}),
    async run(ctx) {
      const stages = await getStages(ctx)
      const { data, error } = await ctx.db.from('clients').select('stage, value').eq('user_id', ctx.userId)
      if (error) throw error
      const rows = stages.map(s => {
        const inStage = (data || []).filter(c => (c.stage || stages[0].key) === s.key)
        return { stage: s.label, key: s.key, kind: s.kind, leads: inStage.length, value: inStage.reduce((t, c) => t + (Number(c.value) || 0), 0) }
      })
      return { stages: rows, total_leads: (data || []).length }
    },
  },

  get_calendar: {
    risk: 'baixo',
    description: 'Reuniões da agenda a partir de hoje (padrão: próximos 7 dias).',
    schema: obj({ days: int('Quantos dias à frente (1 a 30)', { minimum: 1, maximum: 30 }) }),
    async run(ctx, { days = 7 }) {
      const from = todayBrt()
      const { data, error } = await ctx.db.from('meetings').select('id, title, date, time, duration, client_name, location')
        .eq('user_id', ctx.userId).gte('date', from).lte('date', addDays(from, Math.min(Number(days) || 7, 30)))
        .order('date', { ascending: true }).order('time', { ascending: true }).limit(30)
      if (error) throw error
      return { from, meetings: data || [] }
    },
  },

  get_goal_progress: {
    risk: 'baixo',
    description: 'Meta de vendas do mês atual: valor da meta, quanto já foi vendido e quanto falta.',
    schema: obj({}),
    async run(ctx) {
      const today = todayBrt()
      const month = today.slice(0, 7) + '-01'
      const next = new Date(Date.parse(month + 'T12:00:00Z')); next.setUTCMonth(next.getUTCMonth() + 1)
      const nextMonth = next.toISOString().slice(0, 10)
      const [{ data: goal }, { data: won, error }] = await Promise.all([
        ctx.db.from('sales_goals').select('target').eq('user_id', ctx.userId).eq('month', month).maybeSingle(),
        ctx.db.from('clients').select('value').eq('user_id', ctx.userId).gte('won_at', month).lt('won_at', nextMonth),
      ])
      if (error) throw error
      const sold = (won || []).reduce((t, c) => t + (Number(c.value) || 0), 0)
      const target = Number(goal?.target) || 0
      return { month, target, sold, sales: (won || []).length, remaining: Math.max(0, target - sold), has_goal: Boolean(goal) }
    },
  },

  // ── Memória (baixo) ─────────────────────────────────────────────────────
  remember: {
    risk: 'baixo',
    description: 'Guarda um fato útil para lembrar depois (ex.: preferência do dono, combinado com um cliente).',
    schema: obj({ text: str('O fato, em uma frase', { maxLength: 500 }), tags: { type: 'array', items: { type: 'string' }, maxItems: 5 } }, ['text']),
    async run(ctx, { text, tags = [] }) {
      const { data, error } = await ctx.db.from('agent_memories').insert({
        user_id: ctx.userId, agent_id: ctx.agent.id, text: String(text).slice(0, 500), tags: (tags || []).slice(0, 5).map(String),
      }).select('id').single()
      if (error) throw error
      return { saved: true, id: data.id }
    },
  },

  search_memories: {
    risk: 'baixo',
    description: 'Procura nos fatos que este agente guardou.',
    schema: obj({ query: str('Palavra ou assunto') }, ['query']),
    async run(ctx, { query }) {
      const term = safeLike(query)
      let q = ctx.db.from('agent_memories').select('text, tags, created_at').eq('user_id', ctx.userId).eq('agent_id', ctx.agent.id)
        .order('created_at', { ascending: false }).limit(10)
      if (term) q = q.ilike('text', `%${term}%`)
      const { data, error } = await q
      if (error) throw error
      return { memories: data || [] }
    },
  },

  // ── CRM: escrita (médio) ────────────────────────────────────────────────
  create_task: {
    risk: 'medio',
    description: 'Cria uma tarefa no CRM, opcionalmente ligada a um lead (use search_contacts para achar o id).',
    schema: obj({
      title: str('O que fazer', { maxLength: 300 }),
      due: str('Prazo: hoje, amanhã, AAAA-MM-DD ou +N dias (opcional)'),
      client_id: str('Id do lead (opcional)'),
    }, ['title']),
    async run(ctx, { title, due, client_id }) {
      const client = client_id ? await getClient(ctx, client_id, 'id, name') : null
      const due_date = due ? ctx.deps.crm.resolveDueDate(due) : null
      if (due && !due_date) throw Object.assign(new Error('Prazo inválido (use hoje, amanhã, AAAA-MM-DD ou +N dias).'), { expected: true })
      const { data, error } = await ctx.db.from('crm_tasks').insert({
        user_id: ctx.userId, client_id: client?.id || null, title: String(title).trim().slice(0, 300), due_date, done: false,
      }).select('id, title, due_date').single()
      if (error) throw error
      return { created: true, task: data, client: client?.name || null }
    },
  },

  move_pipeline_stage: {
    risk: 'medio',
    description: 'Move um lead para outra etapa do funil (pelo nome ou chave da etapa).',
    schema: obj({ client_id: str('Id do lead'), stage: str('Etapa de destino, ex.: Qualificado, Proposta, Fechado') }, ['client_id', 'stage']),
    async run(ctx, { client_id, stage }) {
      const client = await getClient(ctx, client_id, 'id, name, stage')
      const stages = await getStages(ctx)
      const target = ctx.deps.crm.resolveStage(stages, stage)
      if (!target) throw Object.assign(new Error(`Etapa "${stage}" não existe. Etapas: ${stages.map(s => s.label).join(', ')}.`), { expected: true })
      if (client.stage === target.key) return { changed: false, client: client.name, stage: target.label }
      const { error } = await ctx.db.from('clients').update({ stage: target.key }).eq('id', client.id).eq('user_id', ctx.userId)
      if (error) throw error
      ctx.deps.emitSalesUpdate(ctx.userId, 'clients')
      return { changed: true, client: client.name, stage: target.label }
    },
  },

  create_note: {
    risk: 'medio',
    description: 'Registra uma nota no lead (aparece nas notas do CRM).',
    schema: obj({ client_id: str('Id do lead'), text: str('Conteúdo da nota', { maxLength: 2000 }) }, ['client_id', 'text']),
    async run(ctx, { client_id, text }) {
      const client = await getClient(ctx, client_id, 'id, name')
      const { data, error } = await ctx.db.from('notes').insert({
        user_id: ctx.userId, contact_id: client.id, content: String(text).slice(0, 2000), type: 'note',
      }).select('id').single()
      if (error) throw error
      return { created: true, note_id: data.id, client: client.name }
    },
  },

  schedule_meeting: {
    risk: 'medio',
    description: 'Marca uma reunião na agenda (aparece também no Google Agenda pelo feed).',
    schema: obj({
      title: str('Título da reunião', { maxLength: 200 }),
      date: str('Data: hoje, amanhã, AAAA-MM-DD ou +N dias'),
      time: str('Horário HH:MM (opcional)'),
      duration: int('Duração em minutos (padrão 60)', { minimum: 15, maximum: 480 }),
      client_id: str('Id do lead (opcional)'),
    }, ['title', 'date']),
    async run(ctx, { title, date, time, duration, client_id }) {
      const day = ctx.deps.crm.resolveDueDate(date)
      if (!day) throw Object.assign(new Error('Data inválida (use hoje, amanhã, AAAA-MM-DD ou +N dias).'), { expected: true })
      if (time && !/^\d{1,2}:\d{2}$/.test(String(time))) throw Object.assign(new Error('Horário inválido (use HH:MM).'), { expected: true })
      const client = client_id ? await getClient(ctx, client_id, 'id, name') : null
      const { data, error } = await ctx.db.from('meetings').insert({
        user_id: ctx.userId, title: String(title).slice(0, 200), date: day,
        time: time ? String(time).padStart(5, '0') : null, duration: Number(duration) || 60,
        client_id: client?.id || null, client_name: client?.name || null,
      }).select('id, title, date, time').single()
      if (error) throw error
      return { created: true, meeting: data }
    },
  },

  // ── Prospecção (médio) ──────────────────────────────────────────────────
  search_leads: {
    risk: 'medio',
    description: 'Busca empresas no Google Maps por nicho e cidade (sem custo: usa só o crédito grátis do mês). Não cadastra nada; para cadastrar use import_leads.',
    schema: obj({
      query: str('Nicho ou tipo de empresa, ex.: clínica odontológica'),
      location: str('Cidade e país, ex.: São Paulo, Brasil'),
      max: int('Quantas empresas (5 a 20)', { minimum: 5, maximum: 20 }),
    }, ['query', 'location']),
    async run(ctx, { query, location, max = 10 }) {
      const r = await ctx.deps.prospecting.searchFreeLeads(ctx.userId, {
        query: String(query).slice(0, 120), location: String(location).slice(0, 120), max: Math.min(Math.max(Number(max) || 10, 5), 20),
      })
      return {
        found: r.results.length,
        free_credit_left_usd: r.credit?.remainingUsd,
        leads: r.results.map(p => ({
          name: p.name, phone: p.phone, category: p.category, city: p.city, state: p.state,
          rating: p.rating, reviews: p.reviews, website: p.website, already_in_crm: p.inCrm,
          mapsUrl: p.mapsUrl, placeId: p.placeId, address: p.address,
        })),
      }
    },
  },

  import_leads: {
    risk: 'medio',
    description: 'Cadastra no CRM leads vindos de search_leads (só os que têm telefone e ainda não existem).',
    schema: obj({
      leads: {
        type: 'array', maxItems: 50,
        items: obj({
          name: str('Nome da empresa'), phone: str('Telefone'), category: str('Categoria'), city: str('Cidade'), state: str('Estado'),
          website: str('Site'), rating: { type: 'number' }, reviews: { type: 'integer' }, mapsUrl: str('Link do Maps'),
          placeId: str('Id do Maps'), address: str('Endereço'),
        }, ['name', 'phone']),
      },
    }, ['leads']),
    async run(ctx, { leads }) {
      const { clientIds, ...out } = await ctx.deps.prospecting.importLeads(ctx.userId, leads, { call: false })
      return { ...out, client_ids: clientIds }
    },
  },

  // ── Piloto de Vendas, cobranças, projetos e equipe ──────────────────────
  list_hot_leads: {
    risk: 'baixo',
    description: 'Lista as oportunidades do Piloto de Vendas (quem demonstrou intenção de compra nas conversas), da maior nota para a menor, com a frase do cliente e o status.',
    schema: obj({ status: str('abertas (padrão), ganhas ou todas', { enum: ['abertas', 'ganhas', 'todas'] }), limit: int('Máximo (até 20)', { minimum: 1, maximum: LIMIT }) }),
    async run(ctx, { status = 'abertas', limit }) {
      const map = { abertas: 'open', ganhas: 'won', todas: 'all' }
      const list = await ctx.deps.salesPilot.listOpportunities(ctx.userId, { status: map[status] || 'open', limit: Math.min(Number(limit) || 10, LIMIT) })
      return {
        opportunities: list.map(o => ({
          opportunity_id: o.id, client_id: o.client_id, name: o.contact_name, phone: o.contact_phone, score: o.score, level: o.level,
          status: o.status, product: o.product, said: o.last_message, signals: o.signals, last_message_at: o.last_inbound_at,
        })),
      }
    },
  },

  update_opportunity: {
    risk: 'medio',
    description: 'Avança uma oportunidade do Piloto de Vendas: contacted (contatado), proposal (proposta), negotiation (negociação), won (venda fechada, pode informar valor), lost (perdida) ou dismissed (tirar da fila). A etapa do lead no CRM acompanha.',
    schema: obj({
      opportunity_id: str('Id da oportunidade (de list_hot_leads)'),
      status: str('Novo status', { enum: ['contacted', 'proposal', 'negotiation', 'won', 'lost', 'dismissed'] }),
      value: { type: 'number', description: 'Valor da venda em reais (só para won, opcional)' },
    }, ['opportunity_id', 'status']),
    async run(ctx, { opportunity_id, status, value }) {
      const o = await ctx.deps.salesPilot.updateOpportunity(ctx.userId, opportunity_id, { status, value })
      return { updated: true, name: o.contact_name, status: o.status }
    },
  },

  scan_conversations_for_leads: {
    risk: 'medio',
    description: 'Lê as mensagens recebidas nos últimos dias e acha quem demonstrou intenção de compra (cria oportunidades no Piloto de Vendas). Não envia nada a ninguém.',
    schema: obj({ days: int('Quantos dias para trás (1 a 30, padrão 14)', { minimum: 1, maximum: 30 }) }),
    async run(ctx, { days = 14 }) {
      return ctx.deps.salesPilot.backfill(ctx.userId, { days: Math.min(Math.max(Number(days) || 14, 1), 30) })
    },
  },

  list_invoices: {
    risk: 'baixo',
    description: 'Lista cobranças em aberto: atrasadas (padrão) ou vencendo nos próximos 7 dias, com cliente, valor e dias de atraso.',
    schema: obj({ filter: str('atrasadas ou a_vencer', { enum: ['atrasadas', 'a_vencer'] }) }),
    async run(ctx, { filter = 'atrasadas' }) {
      const today = todayBrt()
      let q = ctx.db.from('invoices').select('id, client_id, client_name, description, amount, due_date').eq('user_id', ctx.userId).neq('status', 'paid').order('due_date', { ascending: true }).limit(30)
      q = filter === 'a_vencer' ? q.gte('due_date', today).lte('due_date', addDays(today, 7)) : q.lt('due_date', today)
      const { data, error } = await q
      if (error) throw error
      const rows = (data || []).map(i => ({ ...i, amount: Number(i.amount) || 0, days_late: i.due_date < today ? Math.round((Date.parse(today) - Date.parse(i.due_date)) / 86_400_000) : 0 }))
      return { today, total: rows.reduce((a, i) => a + i.amount, 0), invoices: rows }
    },
  },

  list_projects: {
    risk: 'baixo',
    description: 'Lista projetos de implantação em aberto com progresso do checklist, próximo passo e se estão atrasados.',
    schema: obj({ only_late: { type: 'boolean', description: 'Só os atrasados' } }),
    async run(ctx, { only_late }) {
      const today = todayBrt()
      const { data, error } = await ctx.db.from('projects').select('id, name, client_name, status, due_date, lead_name, steps').eq('user_id', ctx.userId).neq('status', 'done').order('due_date', { ascending: true }).limit(30)
      if (error) throw error
      const rows = (data || []).map(p => {
        const steps = Array.isArray(p.steps) ? p.steps : []
        const done = steps.filter(x => x.done).length
        return { id: p.id, name: p.name, client: p.client_name, status: p.status, due_date: p.due_date, lead: p.lead_name, progress: `${done}/${steps.length}`, next_step: steps.find(x => !x.done)?.title || null, late: Boolean(p.due_date && p.due_date < today) }
      })
      return { projects: only_late ? rows.filter(r => r.late) : rows }
    },
  },

  team_overview: {
    risk: 'baixo',
    description: 'Situação da equipe agora: quem está online, conversas abertas, clientes esperando resposta e a maior espera de cada pessoa.',
    schema: obj({}),
    async run(ctx) { return ctx.deps.team.teamOverview(ctx.userId) },
  },

  nudge_team_member: {
    risk: 'alto',
    description: 'Manda um recado curto para alguém da equipe (aparece na tela da pessoa). Use para pedir que atenda cliente esperando ou para elogiar. Precisa de aprovação do dono.',
    schema: obj({ name: str('Nome da pessoa da equipe'), message: str('Recado (curto e respeitoso)', { maxLength: 400 }) }, ['name', 'message']),
    async describe(ctx, { name, message }) {
      const m = await ctx.deps.team.findMember(ctx.userId, { name })
      return `Chamar ${m.name}: "${String(message).slice(0, 160)}"`
    },
    async run(ctx, { name, message }) {
      return ctx.deps.team.sendNudge(ctx.userId, { name, message, from: ctx.agent?.name || 'Agente' })
    },
  },

  // ── Mundo externo (alto: só roda depois de aprovado) ────────────────────
  queue_ai_call: {
    risk: 'alto',
    description: 'Coloca um lead na fila de ligação da assistente de voz (liga em horário comercial e qualifica). Precisa de aprovação do dono.',
    schema: obj({ client_id: str('Id do lead') }, ['client_id']),
    async describe(ctx, { client_id }) {
      const c = await getClient(ctx, client_id, 'id, name, phone')
      return `Ligar com IA para ${c.name}${c.phone ? ` (${c.phone})` : ''}.`
    },
    async run(ctx, { client_id }) {
      return ctx.deps.prospecting.queueCall(ctx.userId, client_id)
    },
  },

  send_whatsapp: {
    risk: 'alto',
    description: 'Envia uma mensagem de WhatsApp para um lead. Precisa de aprovação do dono antes de sair.',
    schema: obj({ client_id: str('Id do lead'), text: str('Mensagem a enviar', { maxLength: 1000 }) }, ['client_id', 'text']),
    async describe(ctx, { client_id, text }) {
      const c = await getClient(ctx, client_id, 'id, name, phone')
      const t = String(text)
      return `Enviar WhatsApp para ${c.name}: "${t.length > 160 ? t.slice(0, 157) + '…' : t}"`
    },
    async run(ctx, { client_id, text }) {
      const c = await getClient(ctx, client_id, 'id, name, phone')
      const digits = String(c.phone || '').replace(/\D/g, '')
      if (digits.length < 10) throw Object.assign(new Error('O lead não tem um telefone válido.'), { expected: true })
      await ctx.deps.sendText({ jid: digits, userId: ctx.userId, pushName: c.name, contact: { name: c.name } }, String(text).slice(0, 1000))
      return { sent: true, client: c.name }
    },
  },
}

// Ferramentas de cada agente padrão (agents.tools vazio = usa esta lista).
const TOOLS_BY_KIND = {
  comercial: ['search_contacts', 'list_tasks', 'list_pipeline', 'list_hot_leads', 'update_opportunity', 'get_calendar', 'get_goal_progress', 'create_task', 'move_pipeline_stage', 'create_note', 'schedule_meeting', 'queue_ai_call', 'send_whatsapp', 'remember', 'search_memories'],
  atendente: ['search_contacts', 'list_tasks', 'list_hot_leads', 'team_overview', 'create_task', 'create_note', 'send_whatsapp', 'nudge_team_member', 'remember', 'search_memories'],
  prospector: ['search_leads', 'import_leads', 'scan_conversations_for_leads', 'list_hot_leads', 'search_contacts', 'queue_ai_call', 'remember', 'search_memories'],
  agenda: ['get_calendar', 'list_tasks', 'list_projects', 'create_task', 'schedule_meeting', 'search_contacts', 'remember', 'search_memories'],
  metas: ['get_goal_progress', 'list_pipeline', 'team_overview', 'nudge_team_member', 'search_contacts', 'remember', 'search_memories'],
  analista: ['list_pipeline', 'get_goal_progress', 'list_tasks', 'list_invoices', 'list_projects', 'team_overview', 'search_contacts', 'send_whatsapp', 'remember', 'search_memories'],
}

function toolsForAgent(agent) {
  const names = Array.isArray(agent?.tools) && agent.tools.length ? agent.tools : (TOOLS_BY_KIND[agent?.kind] || [])
  return names.filter(n => TOOLS[n]).map(n => ({ name: n, ...TOOLS[n] }))
}

module.exports = { TOOLS, TOOLS_BY_KIND, toolsForAgent, safeLike }
