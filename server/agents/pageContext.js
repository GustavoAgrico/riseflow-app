// Em que tela do RiseFlow o usuário está — os agentes usam isso para ajudar na função certa.
// Guardado em memória por conta (um processo só; some em 30 min sem atualização).
const TTL_MS = 30 * 60_000
const current = new Map() // userId → { path, at }

const PAGES = {
  '/dashboard': 'Dashboard (visão geral de vendas, metas e atividade)',
  '/hoje': 'Hoje (tarefas e retornos do dia)',
  '/chat': 'Chat (conversas com clientes no WhatsApp e redes)',
  '/crm': 'CRM Pipeline (quadro de leads por etapa do funil)',
  '/crm/board': 'Painel ao vivo do pipeline',
  '/clients': 'Clientes (base de contatos)',
  '/vendas-ia': 'Piloto de Vendas (leads com intenção de compra detectada nas conversas)',
  '/funnel': 'Funil de vendas (conversão por etapa)',
  '/proposals': 'Propostas',
  '/projetos': 'Projetos (implantação com checklist)',
  '/agenda': 'Agenda (reuniões)',
  '/calls': 'Ligações',
  '/prospeccao': 'Prospecção com IA (busca de leads no Google Maps)',
  '/campaigns': 'Campanhas',
  '/monitor': 'Monitor do time (desempenho e fila da equipe)',
  '/reports': 'Relatórios',
  '/goals': 'Metas e produtos',
  '/billing': 'Cobranças (parcelas, atrasos e fluxo de caixa)',
  '/settings': 'Configurações',
}

const labelOf = (path) => {
  const p = String(path || '').split('?')[0]
  const key = Object.keys(PAGES).sort((a, b) => b.length - a.length).find(k => p === k || p.startsWith(k + '/'))
  return key ? PAGES[key] : null
}

function setPage(userId, path) {
  if (!userId || !labelOf(path)) return false
  current.set(userId, { path: String(path).split('?')[0].slice(0, 80), at: Date.now() })
  return true
}

function getPage(userId) {
  const c = current.get(userId)
  if (!c || Date.now() - c.at > TTL_MS) return null
  return c.path
}

// Linha extra do prompt do agente.
function pageNote(userId) {
  const label = labelOf(getPage(userId))
  if (!label) return ''
  return `Agora o usuário está na tela "${label}" do RiseFlow. Se o pedido for vago ("o que faço?", "me ajuda"), comece pelo que dá para fazer nessa tela e use as ferramentas ligadas a ela.`
}

module.exports = { setPage, getPage, pageNote, labelOf, PAGES }
