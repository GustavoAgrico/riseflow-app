// CRUD dos funis (builder /flows-novo) no Supabase.
// RLS garante que cada usuário só enxerga/edita os próprios funis,
// por isso não filtramos por user_id no SELECT — o policy já faz isso.
import { supabase } from '@/lib/supabase'

const TABLE = 'flows'

// Campos que o builder novo persiste (não tocamos em flow_data/channel do builder antigo).
const WRITABLE = ['name', 'description', 'status', 'nodes', 'edges', 'trigger_type']

const pick = (data = {}) =>
  WRITABLE.reduce((acc, k) => (k in data ? ((acc[k] = data[k]), acc) : acc), {})

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return data?.user?.id ?? null
}

export const flowsService = {
  // Lista todos os funis do usuário (mais recentes primeiro).
  async getFlows() {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, name, description, status, nodes, edges, trigger_type, created_at, updated_at')
      .order('updated_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  // Busca um funil pelo id.
  async getFlow(id) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single()
    if (error) throw error
    return data
  },

  // Cria um novo funil. user_id vem da sessão atual.
  async createFlow(data = {}) {
    const user_id = await currentUserId()
    if (!user_id) throw new Error('Usuário não autenticado.')
    const payload = {
      user_id,
      name: data.name ?? 'Novo Funil',
      description: data.description ?? null,
      status: data.status ?? 'paused',
      nodes: data.nodes ?? [],
      edges: data.edges ?? [],
      trigger_type: data.trigger_type ?? null,
    }
    const { data: row, error } = await supabase.from(TABLE).insert(payload).select().single()
    if (error) throw error
    return row
  },

  // Atualiza nodes, edges, status, etc. de um funil.
  async updateFlow(id, data = {}) {
    const patch = { ...pick(data), updated_at: new Date().toISOString() }
    const { data: row, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single()
    if (error) throw error
    return row
  },

  // Deleta um funil.
  async deleteFlow(id) {
    const { error } = await supabase.from(TABLE).delete().eq('id', id)
    if (error) throw error
  },

  // Alterna entre 'active' e 'paused'.
  async toggleFlowStatus(id) {
    const current = await this.getFlow(id)
    const next = current.status === 'active' ? 'paused' : 'active'
    return this.updateFlow(id, { status: next })
  },
}

export default flowsService
