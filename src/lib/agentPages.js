// Qual agente cuida de cada tela do RiseFlow. O primeiro da lista é o "dono" da função:
// sobe no trilho com destaque e se apresenta ao entrar na tela.
export const PAGE_AGENTS = {
  '/chat': ['atendente', 'comercial'],
  '/smart-attendant': ['atendente'],
  '/monitor': ['atendente', 'metas'],
  '/templates': ['atendente'],
  '/campaigns': ['prospector', 'atendente'],
  '/crm': ['comercial', 'prospector'],
  '/clients': ['comercial', 'atendente'],
  '/vendas-ia': ['comercial', 'prospector'],
  '/funnel': ['comercial', 'analista'],
  '/proposals': ['comercial'],
  '/prospeccao': ['prospector'],
  '/calls': ['prospector', 'comercial'],
  '/agenda': ['agenda'],
  '/schedules': ['agenda'],
  '/hoje': ['agenda', 'comercial'],
  '/projetos': ['agenda'],
  '/goals': ['metas', 'analista'],
  '/teams': ['metas'],
  '/billing': ['analista'],
  '/reports': ['analista', 'metas'],
  '/analytics': ['analista'],
  '/dashboard': ['comercial', 'analista'],
  '/flows-novo': ['atendente'],
  '/flows': ['atendente'],
}

// O que o agente faz nesta tela (texto da apresentação).
const ROLE_ON_PAGE = {
  atendente: {
    '/chat': 'Cuido do atendimento: digo quem está esperando, sugiro respostas e separo quem quer comprar.',
    '/smart-attendant': 'Ajudo a configurar o atendimento automático e a revisar as respostas da IA.',
    '/monitor': 'Acompanho a fila: quem está esperando, quem está sem responsável e quem precisa de um toque.',
    default: 'Cuido do atendimento e das conversas com clientes nesta tela.',
  },
  comercial: {
    '/crm': 'Cuido do funil: priorizo leads, preparo abordagens e movo os negócios de etapa.',
    '/vendas-ia': 'Atendo primeiro quem está pronto para comprar e levo até a venda.',
    default: 'Ajudo a vender: priorizo leads e preparo o próximo passo de cada negócio.',
  },
  prospector: {
    '/prospeccao': 'Busco leads novos no Google Maps (no crédito grátis) e trago os melhores com telefone.',
    default: 'Encontro leads novos e quem quer comprar nas conversas.',
  },
  agenda: {
    '/projetos': 'Acompanho os projetos: prazos, próximos passos e o que está atrasado.',
    default: 'Organizo agenda, tarefas e prazos do dia.',
  },
  metas: { default: 'Acompanho metas e desempenho da equipe.' },
  analista: {
    '/billing': 'Cuido das cobranças: quem está atrasado e lembretes gentis pelo WhatsApp.',
    default: 'Leio os números e mostro onde melhorar.',
  },
}

const keyOf = (path) => {
  const p = String(path || '').split('?')[0]
  return Object.keys(PAGE_AGENTS).sort((a, b) => b.length - a.length).find(k => p === k || p.startsWith(k + '/')) || null
}

export const agentsForPage = (path) => PAGE_AGENTS[keyOf(path)] || []

export function roleOnPage(kind, path) {
  const r = ROLE_ON_PAGE[kind] || {}
  return r[keyOf(path)] || r.default || 'Posso ajudar nesta tela.'
}

// Balão de apresentação do agente dono da tela (uma vez por dia por tela).
export function helloTip(agent, path, prompts = []) {
  const key = keyOf(path)
  if (!agent || !key) return null
  return {
    id: `hello:${key}`, agent: agent.kind, kind: 'processo', priority: 30,
    title: `${agent.name} aqui 👋`, text: roleOnPage(agent.kind, path), prompts: prompts.slice(0, 2),
  }
}

// Ordem do trilho: donos da tela primeiro (na ordem da função), depois os demais.
export function orderAgents(agents, path) {
  const kinds = agentsForPage(path)
  const rank = (a) => { const i = kinds.indexOf(a.kind); return i < 0 ? 99 : i }
  return [...agents].map((a, i) => ({ a, i })).sort((x, y) => rank(x.a) - rank(y.a) || x.i - y.i).map(x => x.a)
}
