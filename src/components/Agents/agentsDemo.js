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

export const DEMO_APPROVALS = {
  'demo-comercial': [
    { id: 'a1', tool: 'send_whatsapp', summary: 'Enviar a proposta do plano Pro para Clínica Sorriso por WhatsApp.' },
  ],
}
