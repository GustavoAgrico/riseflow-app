// Dados de demonstração da aba de agentes. Usados quando isDemoMode está ligado
// ou enquanto as rotas /api/agents ainda não existem (antes da fase 1).
export const DEMO_AGENTS = [
  { id: 'demo-comercial', kind: 'comercial', name: 'Rizo', role: 'Assistente Comercial', status: 'waiting_approval' },
  { id: 'demo-atendente', kind: 'atendente', name: 'Bia', role: 'Atendente', status: 'working' },
  { id: 'demo-prospector', kind: 'prospector', name: 'Pino', role: 'Prospecção', status: 'idle' },
  { id: 'demo-agenda', kind: 'agenda', name: 'Tiki', role: 'Agenda', status: 'idle' },
  { id: 'demo-metas', kind: 'metas', name: 'Topo', role: 'Metas', status: 'idle' },
  { id: 'demo-analista', kind: 'analista', name: 'Dado', role: 'Relatórios', status: 'thinking' },
]

export const DEMO_MESSAGES = {
  'demo-comercial': [
    { id: 'm1', author_kind: 'agent', content: 'Bom dia! Hoje você tem 3 tarefas atrasadas e 2 reuniões.\nLeads esfriando: Clínica Sorriso (6 dias sem contato) e Studio Fit (9 dias).' },
  ],
  'demo-atendente': [{ id: 'm1', author_kind: 'agent', content: 'Estou atendendo 4 conversas no WhatsApp.' }],
  'demo-prospector': [{ id: 'm1', author_kind: 'agent', content: 'Achei 28 academias em Curitiba; 11 têm nota acima de 70.' }],
  'demo-agenda': [{ id: 'm1', author_kind: 'agent', content: 'Próxima reunião: Studio Fit às 14h. A pauta está pronta.' }],
  'demo-metas': [{ id: 'm1', author_kind: 'agent', content: 'Para bater a meta você precisa vender um pouco por dia útil. Quer ver os negócios que fecham a diferença?' }],
  'demo-analista': [{ id: 'm1', author_kind: 'agent', content: 'Estou montando o relatório semanal.' }],
}

// Enquanto os agentes são exemplo, a resposta é honesta e leva à tela que já faz o pedido.
// A ordem importa: o primeiro tema que casar com o texto vence.
const DEMO_ROUTES = [
  { re: /lead|contato|prospec|empresa|cliente(s)? nov/i, to: '/prospeccao', label: 'Abrir Prospecção com IA', does: 'buscar empresas por nicho e cidade no Google Maps e trazer para o CRM' },
  { re: /lig(ar|ação|acao|ue)|telefon/i, to: '/settings?secao=calls', label: 'Configurar ligações com IA', does: 'ligar para os leads e qualificar a conversa' },
  { re: /meta|vend(a|i)/i, to: '/goals', label: 'Abrir Metas', does: 'acompanhar a meta e o que falta vender' },
  { re: /reuni|agenda|marcar/i, to: '/agenda', label: 'Abrir Agenda', does: 'marcar e acompanhar reuniões' },
  { re: /relat|dado|número|numero|análise|analise/i, to: '/reports', label: 'Abrir Relatórios', does: 'mostrar os números do período' },
  { re: /whats|conversa|atend|mensage/i, to: '/chat', label: 'Abrir Chat', does: 'atender as conversas do WhatsApp' },
  { re: /tarefa|funil|etapa|crm/i, to: '/crm', label: 'Abrir CRM', does: 'organizar leads, etapas e tarefas' },
]
const KIND_ROUTE = { comercial: '/crm', atendente: '/chat', prospector: '/prospeccao', agenda: '/agenda', metas: '/goals', analista: '/reports' }

export function demoReply(agent, text) {
  const hit = DEMO_ROUTES.find((r) => r.re.test(text)) || DEMO_ROUTES.find((r) => r.to === KIND_ROUTE[agent?.kind])
  return {
    id: `demo-reply-${Date.now()}`,
    author_kind: 'agent',
    content: `Ainda sou um exemplo e não consigo fazer isso sozinho. Por enquanto, quem faz isso é a tela certa do RiseFlow: dá para ${hit.does}.`,
    link: { to: hit.to, label: hit.label },
  }
}

export const DEMO_APPROVALS = {
  'demo-comercial': [
    { id: 'a1', tool: 'send_whatsapp', summary: 'Enviar a proposta do plano Pro para Clínica Sorriso por WhatsApp.' },
  ],
}

// Ações sugeridas no modo exemplo (na conta real vêm de GET /api/agents/suggestions).
export const DEMO_SUGGESTIONS = [
  { id: 'demo-hot', agent_kind: 'comercial', agent_id: 'demo-comercial', agent_name: 'Rizo', risk: 'medio', actions: 2, pages: ['/vendas-ia', '/crm', '/dashboard'],
    title: 'Criar retorno para 2 leads prontos para comprar', why: 'Mostraram intenção de compra alta e ainda não foram contatados.',
    preview: ['Marina Alves — 96%: “Quero comprar agora! Me manda o pix?”', 'Rafael Costa — 92%: “Quanto fica a implantação?”'] },
  { id: 'demo-nudge', agent_kind: 'metas', agent_id: 'demo-metas', agent_name: 'Topo', risk: 'alto', actions: 1, pages: ['/monitor', '/chat', '/dashboard'],
    title: 'Chamar Mariana: 3 clientes esperando há 1h35', why: 'Cliente esperando muito tempo derruba a conversão.', preview: ['Recado na tela de Mariana'] },
  { id: 'demo-billing', agent_kind: 'analista', agent_id: 'demo-analista', agent_name: 'Dado', risk: 'alto', actions: 2, pages: ['/billing', '/dashboard'],
    title: 'Enviar lembrete de cobrança para 2 clientes pelo WhatsApp', why: 'Somam R$ 2.050,00 vencidos. Mensagem gentil, uma por cliente.',
    preview: ['BestPay — R$ 1.200,00 (venceu 10/10)', 'Auto Center Sul — R$ 850,00 (venceu 15/08)'] },
  { id: 'demo-prospect', agent_kind: 'prospector', agent_id: 'demo-prospector', agent_name: 'Pino', risk: 'baixo', actions: 0, pages: ['/prospeccao', '/crm', '/dashboard'],
    title: 'Buscar leads novos para o funil', why: 'Só 3 leads novos nesta semana.',
    preview: ['O Pino pergunta o nicho e a cidade', 'Busca no Google Maps usando o crédito grátis', 'Mostra os melhores antes de cadastrar'],
    prompt: 'Quero leads novos. Me pergunte o nicho e a cidade, busque no Google Maps (só no crédito grátis) e me mostre os melhores com telefone antes de cadastrar.' },
]
