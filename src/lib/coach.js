// "Coach" dos agentes: transforma um retrato dos números do dia em dicas curtas,
// cada uma falada por um mascote (kind do RiserAvatar). Função pura — os dados vêm de useCoachData.
//
// Tipos de dica:
//   'acao'       → algo concreto para fazer hoje (tarefas, cobranças, leads parados)
//   'desempenho' → leitura dos números (meta, conversão, ritmo)
//   'processo'   → como usar bem a tela atual
//
// snapshot = {
//   tasksToday, tasksOverdue, meetingsToday, nextMeeting: { title, time } | null,
//   invoicesOverdue: { count, total }, invoicesDueSoon: { count, total },
//   projectsLate: [{ name }], projectsReview: n,
//   leadsStale: n, newLeadsWeek: n, negotiating: n, wonMonth: valor, wonCountMonth: n,
//   goal: valor | null, unreadChats: n, closedMonth: n, lostMonth: n,
// }

const brlShort = (n) => {
  const v = Number(n) || 0
  if (v >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (v >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

export function greeting(hour) {
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

// Dias úteis restantes no mês (inclui hoje), para o ritmo da meta.
export function businessDaysLeft(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const month = d.getMonth()
  let n = 0
  while (d.getMonth() === month) {
    const wd = d.getDay()
    if (wd !== 0 && wd !== 6) n += 1
    d.setDate(d.getDate() + 1)
  }
  return Math.max(1, n)
}

// Orientação de processo por tela (o mascote "dono" do assunto fala).
export const PAGE_GUIDES = {
  '/dashboard': { agent: 'comercial', title: 'Como usar o painel', text: 'Comece o dia pelo "Hoje": ali ficam tarefas e retornos. O painel mostra o resultado; o trabalho acontece no CRM e no Chat.', cta: { label: 'Abrir Hoje', to: '/hoje' } },
  '/crm': { agent: 'comercial', title: 'Funil sempre em dia', text: 'Arraste o card para a próxima etapa assim que o lead responder. Funil atualizado = previsão de vendas confiável.' },
  '/funnel': { agent: 'analista', title: 'Lendo o funil', text: 'Onde a barra mais "afunila" é o gargalo. Ataque essa etapa primeiro: geralmente é falta de retorno rápido.' },
  '/chat': { agent: 'atendente', title: 'Responda rápido', text: 'Leads respondidos em até 5 minutos convertem muito mais. Use os templates para não digitar tudo de novo.', cta: { label: 'Ver templates', to: '/templates' } },
  '/billing': { agent: 'analista', title: 'Cobrança sem constrangimento', text: 'Use "Copiar lembrete" antes do vencimento, não só depois. Clique numa faixa de atraso para focar no que está mais velho.' },
  '/projetos': { agent: 'agenda', title: 'Projetos no prazo', text: 'Marque os passos assim que concluir. Com todos feitos, mande para revisão — o cliente percebe o cuidado.' },
  '/agenda': { agent: 'agenda', title: 'Agenda que vende', text: 'Toda reunião deve terminar com o próximo passo marcado. Crie a tarefa de retorno ainda durante a conversa.' },
  '/hoje': { agent: 'agenda', title: 'Ordem do dia', text: 'Faça primeiro o que está atrasado, depois os retornos de leads quentes. Tarefas pequenas: resolva em menos de 2 minutos.' },
  '/prospeccao': { agent: 'prospector', title: 'Prospecção eficiente', text: 'Busque um nicho por vez e importe só quem tem telefone. Leads novos devem receber o primeiro contato no mesmo dia.' },
  '/vendas-ia': { agent: 'comercial', title: 'Piloto de Vendas', text: 'Atenda primeiro os cartões com nota mais alta. Avance o cartão (Contato → Proposta → Negociação) a cada passo: o funil do CRM acompanha sozinho.' },
  '/goals': { agent: 'metas', title: 'Meta que motiva', text: 'Divida a meta do mês pelos dias úteis: é o valor que precisa fechar por dia. Acompanhe no painel ao vivo.' },
  '/proposals': { agent: 'comercial', title: 'Proposta com prazo', text: 'Toda proposta precisa de validade. Faça o follow-up dois dias depois do envio — é quando a decisão costuma travar.' },
  '/clients': { agent: 'atendente', title: 'Base organizada', text: 'Etiquete os contatos (VIP, quente, frio). Fica fácil montar campanhas e saber quem priorizar.' },
  '/campaigns': { agent: 'prospector', title: 'Campanhas que convertem', text: 'Mensagem curta, uma pergunta no fim e envio em horário comercial. Teste dois textos e fique com o melhor.' },
  '/reports': { agent: 'analista', title: 'Relatórios', text: 'Compare sempre com o período anterior: o número sozinho não diz se você melhorou.' },
}

export function guideFor(path) {
  const key = Object.keys(PAGE_GUIDES).find(k => path === k || path.startsWith(k + '/'))
  if (!key) return null
  const g = PAGE_GUIDES[key]
  return { id: `guide:${key}`, kind: 'processo', priority: 40, ...g }
}

export function buildTips(snap = {}, { path = '/dashboard', now = new Date() } = {}) {
  const s = { invoicesOverdue: { count: 0, total: 0 }, invoicesDueSoon: { count: 0, total: 0 }, projectsLate: [], ...snap }
  const tips = []
  const add = (t) => tips.push(t)

  // ── Ações do dia ──
  const hot = Array.isArray(s.hotLeads) ? s.hotLeads : []
  if (hot.length) add({ id: 'hot-leads', agent: 'comercial', kind: 'acao', priority: 97, title: hot.length === 1 ? 'Lead pronto para comprar' : `${hot.length} leads prontos para comprar`, text: hot.length === 1 ? `${hot[0].name} mostrou ${hot[0].score}% de intenção de compra e ainda não foi contatado. Responda agora.` : `${hot[0].name} (${hot[0].score}%) e mais ${hot.length - 1} mostraram intenção alta e esperam contato.`, cta: { label: 'Ver no Piloto', to: '/vendas-ia' } })
  if (s.tasksOverdue > 0) add({ id: 'tasks-overdue', agent: 'agenda', kind: 'acao', priority: 95, title: 'Tarefas atrasadas', text: `${plural(s.tasksOverdue, 'tarefa ficou', 'tarefas ficaram')} para trás. Resolva ou reagende antes de começar as de hoje.`, cta: { label: 'Ver tarefas', to: '/hoje' } })
  if (s.tasksToday > 0) add({ id: 'tasks-today', agent: 'agenda', kind: 'acao', priority: 80, title: 'Tarefas de hoje', text: `Você tem ${plural(s.tasksToday, 'tarefa', 'tarefas')} para hoje.${s.meetingsToday ? ` E ${plural(s.meetingsToday, 'reunião', 'reuniões')}${s.nextMeeting?.time ? ` — a próxima às ${s.nextMeeting.time}` : ''}.` : ''}`, cta: { label: 'Abrir Hoje', to: '/hoje' } })
  else if (s.meetingsToday > 0) add({ id: 'meetings-today', agent: 'agenda', kind: 'acao', priority: 75, title: 'Reuniões de hoje', text: `${plural(s.meetingsToday, 'reunião', 'reuniões')} hoje${s.nextMeeting ? `: "${s.nextMeeting.title}"${s.nextMeeting.time ? ` às ${s.nextMeeting.time}` : ''}` : ''}. Revise o histórico do cliente antes.`, cta: { label: 'Ver agenda', to: '/agenda' } })
  if (s.unreadChats > 0) add({ id: 'unread', agent: 'atendente', kind: 'acao', priority: 90, title: 'Clientes esperando', text: `${plural(s.unreadChats, 'conversa está', 'conversas estão')} sem resposta. Responder rápido é o que mais aumenta a conversão.`, cta: { label: 'Abrir Chat', to: '/chat' } })
  if (s.leadsStale > 0) add({ id: 'leads-stale', agent: 'comercial', kind: 'acao', priority: 85, title: 'Leads parados', text: `${plural(s.leadsStale, 'lead está', 'leads estão')} em "Novo" há mais de 3 dias. Um contato hoje pode reaquecer.`, cta: { label: 'Ir ao CRM', to: '/crm' } })
  if (s.negotiating > 0) add({ id: 'negotiating', agent: 'comercial', kind: 'acao', priority: 60, title: 'Negociações abertas', text: `${plural(s.negotiating, 'negócio está', 'negócios estão')} em negociação. Um follow-up hoje evita que esfriem.`, cta: { label: 'Ver funil', to: '/crm' } })
  if (s.invoicesOverdue.count > 0) add({ id: 'inv-overdue', agent: 'analista', kind: 'acao', priority: 88, title: 'Cobranças atrasadas', text: `${brlShort(s.invoicesOverdue.total)} em ${plural(s.invoicesOverdue.count, 'cobrança atrasada', 'cobranças atrasadas')}. Mande o lembrete pelo WhatsApp.`, cta: { label: 'Ver cobranças', to: '/billing' } })
  else if (s.invoicesDueSoon.count > 0) add({ id: 'inv-soon', agent: 'analista', kind: 'acao', priority: 50, title: 'Vencendo esta semana', text: `${plural(s.invoicesDueSoon.count, 'cobrança vence', 'cobranças vencem')} nos próximos 7 dias (${brlShort(s.invoicesDueSoon.total)}). Um lembrete antes evita atraso.`, cta: { label: 'Ver cobranças', to: '/billing' } })
  if (s.projectsLate.length > 0) add({ id: 'proj-late', agent: 'agenda', kind: 'acao', priority: 82, title: 'Projeto atrasado', text: s.projectsLate.length === 1 ? `"${s.projectsLate[0].name}" passou do prazo. Veja o próximo passo ou combine nova data com o cliente.` : `${s.projectsLate.length} projetos passaram do prazo. Comece pelo mais antigo.`, cta: { label: 'Ver projetos', to: '/projetos' } })
  if (s.projectsReview > 0) add({ id: 'proj-review', agent: 'agenda', kind: 'acao', priority: 55, title: 'Projetos em revisão', text: `${plural(s.projectsReview, 'projeto espera', 'projetos esperam')} sua revisão para ser concluído.`, cta: { label: 'Revisar', to: '/projetos' } })

  // ── Desempenho ──
  if (s.goal > 0) {
    const missing = Math.max(0, s.goal - (s.wonMonth || 0))
    const pct = Math.round(((s.wonMonth || 0) / s.goal) * 100)
    if (missing === 0) add({ id: 'goal-hit', agent: 'metas', kind: 'desempenho', priority: 70, title: 'Meta batida! 🎉', text: `Você fez ${brlShort(s.wonMonth)} (${pct}% da meta). Que tal aproveitar o embalo e puxar uma meta maior?`, cta: { label: 'Ver metas', to: '/goals' } })
    else {
      const perDay = missing / businessDaysLeft(now)
      add({ id: 'goal-pace', agent: 'metas', kind: 'desempenho', priority: 72, title: `Meta em ${pct}%`, text: `Faltam ${brlShort(missing)}. Para chegar lá, feche cerca de ${brlShort(perDay)} por dia útil até o fim do mês.`, cta: { label: 'Ver metas', to: '/goals' } })
    }
  } else {
    add({ id: 'goal-none', agent: 'metas', kind: 'desempenho', priority: 35, title: 'Defina sua meta', text: 'Sem meta do mês, fica difícil saber se o ritmo está bom. Leva 10 segundos.', cta: { label: 'Definir meta', to: '/goals' } })
  }
  const closed = (s.closedMonth || 0) + (s.lostMonth || 0)
  if (s.lostMonth != null && closed >= 5) {
    const rate = Math.round(((s.closedMonth || 0) / closed) * 100)
    add({ id: 'win-rate', agent: 'analista', kind: 'desempenho', priority: rate < 25 ? 65 : 30, title: `Conversão de ${rate}%`, text: rate < 25 ? `De ${closed} negócios encerrados no mês, só ${s.closedMonth || 0} foram ganhos. Revise as perdas: o motivo mais comum costuma se repetir.` : `Boa taxa: ${s.closedMonth} ganhos em ${closed} encerrados. Mantenha o follow-up em dia.`, cta: { label: 'Ver funil', to: '/funnel' } })
  }
  if (s.newLeadsWeek != null && s.newLeadsWeek < 5) add({ id: 'pipeline-thin', agent: 'prospector', kind: 'desempenho', priority: 45, title: 'Funil precisando de leads', text: s.newLeadsWeek === 0 ? 'Nenhum lead novo nesta semana. Uma busca rápida por nicho enche o funil.' : `Só ${plural(s.newLeadsWeek, 'lead novo', 'leads novos')} nesta semana. Uma busca por nicho ajuda a manter o ritmo.`, cta: { label: 'Prospectar', to: '/prospeccao' } })

  // ── Processo da tela atual ──
  const guide = guideFor(path)
  if (guide) add(guide)

  // Tudo em dia: um incentivo.
  if (!tips.some(t => t.kind === 'acao')) add({ id: 'all-clear', agent: 'comercial', kind: 'acao', priority: 20, title: 'Tudo em dia', text: 'Nada atrasado por aqui. Bom momento para prospectar ou retomar contatos antigos.', cta: { label: 'Prospectar', to: '/prospeccao' } })

  return tips.sort((a, b) => b.priority - a.priority)
}

// Dica a mostrar no balão: prioriza a orientação da tela quando acabou de entrar nela;
// pula as já vistas hoje.
export function pickTip(tips, { seen = [], path = '' } = {}) {
  const fresh = tips.filter(t => !seen.includes(t.id))
  if (!fresh.length) return null
  const guide = fresh.find(t => t.kind === 'processo' && t.id === `guide:${Object.keys(PAGE_GUIDES).find(k => path === k || path.startsWith(k + '/'))}`)
  const urgent = fresh.find(t => t.priority >= 80)
  return urgent || guide || fresh[0]
}

// Resumo do plano do dia (texto da saudação).
export function dayHeadline(snap = {}, now = new Date()) {
  const parts = []
  if (snap.tasksToday) parts.push(plural(snap.tasksToday, 'tarefa', 'tarefas'))
  if (snap.meetingsToday) parts.push(plural(snap.meetingsToday, 'reunião', 'reuniões'))
  if (snap.unreadChats) parts.push(plural(snap.unreadChats, 'conversa', 'conversas') + ' sem resposta')
  const head = `${greeting(now.getHours())}!`
  return parts.length ? `${head} Hoje: ${parts.join(', ')}.` : `${head} Agenda livre hoje — ótimo para vender.`
}
