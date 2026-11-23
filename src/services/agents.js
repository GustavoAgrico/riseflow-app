// Chamadas da aba de agentes (docs/AGENTES_ABA_E_MASCOTES.md, seção 5).
// Enquanto o backend não existir, o AgentDock cai no modo demonstração.
import api from '@services/api'

export const agentsApi = {
  list: () => api.get('/agents').then((r) => r.data),
  messages: (agentId) => api.get(`/agents/${agentId}/messages`).then((r) => r.data),
  send: (agentId, text) => api.post(`/agents/${agentId}/messages`, { text }).then((r) => r.data),
  approvals: (agentId) => api.get('/approvals', { params: { agent_id: agentId, status: 'pending' } }).then((r) => r.data),
  // decision: 'approve' | 'reject'
  decide: (approvalId, decision) => api.post(`/approvals/${approvalId}/decision`, { decision }).then((r) => r.data),
}
