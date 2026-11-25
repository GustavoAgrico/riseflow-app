// Chamadas da aba de agentes (docs/AGENTES_ABA_E_MASCOTES.md, seção 5).
// Enquanto o backend não existir, o AgentDock cai no modo demonstração.
import api from '@services/api'

export const agentsApi = {
  list: () => api.get('/agents').then((r) => r.data),
  messages: (agentId) => api.get(`/agents/${agentId}/messages`).then((r) => r.data),
  // idempotency_key: o mesmo envio repetido (rede instável) não vira duas mensagens.
  // context.path: a tela onde o usuário está — o agente ajuda primeiro nessa função.
  send: (agentId, text, idempotencyKey, context) =>
    api.post(`/agents/${agentId}/messages`, { text, idempotency_key: idempotencyKey, context }).then((r) => r.data),
  approvals: (agentId) => api.get('/approvals', { params: { agent_id: agentId, status: 'pending' } }).then((r) => r.data),
  // decision: 'approve' | 'reject'
  decide: (approvalId, decision) => api.post(`/approvals/${approvalId}/decision`, { decision }).then((r) => r.data),
  // Tela atual (os agentes "acompanham" as abas do sistema).
  setContext: (path) => api.post('/agents/context', { path }).then((r) => r.data),
  // Ações sugeridas pelos agentes: só executam com o clique do usuário.
  suggestions: (path) => api.get('/agents/suggestions', { params: { path } }).then((r) => r.data),
  runSuggestion: (id) => api.post('/agents/suggestions/run', { id }).then((r) => r.data),
}

// Atalhos de pergunta por tela: aparecem na conversa com o agente.
export const PAGE_PROMPTS = {
  '/dashboard': ['Resuma meu dia em 3 prioridades', 'Como bato a meta do mês?'],
  '/hoje': ['O que faço primeiro hoje?', 'Quais tarefas estão atrasadas?'],
  '/chat': ['Quem está esperando resposta?', 'Quem demonstrou intenção de compra?'],
  '/crm': ['Quais leads devo priorizar hoje?', 'Quem está parado há mais de 7 dias?'],
  '/vendas-ia': ['Quem está pronto para comprar?', 'Leia as conversas e ache compradores'],
  '/prospeccao': ['Busque 20 leads para mim (pergunte nicho e cidade)', 'Que nicho vale prospectar agora?'],
  '/funnel': ['Onde meu funil está travando?', 'Como melhorar a conversão?'],
  '/billing': ['Quem está com cobrança atrasada?', 'Prepare lembretes de cobrança'],
  '/projetos': ['Quais projetos estão atrasados?', 'O que falta em cada projeto?'],
  '/monitor': ['Quem da equipe precisa de ajuda agora?', 'Como está o atendimento hoje?'],
  '/agenda': ['Quais reuniões tenho esta semana?', 'Marque uma reunião para amanhã'],
  '/goals': ['Quanto falta para a meta?', 'Quanto preciso vender por dia?'],
}
export function promptsFor(path) {
  const p = String(path || '').split('?')[0]
  const key = Object.keys(PAGE_PROMPTS).sort((a, b) => b.length - a.length).find(k => p === k || p.startsWith(k + '/'))
  return key ? PAGE_PROMPTS[key] : ['O que você pode fazer por mim nesta tela?']
}
