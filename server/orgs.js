// Organizações (E2 — fundação). Cada dono de conta tem 1 organização; a equipe
// (team_members) é espelhada em organization_members pelo banco.
// Enquanto a migração supabase/organizations.sql não for rodada, tudo aqui
// devolve null sem quebrar o login nem as rotas.
const { supabase, isConfigured } = require('./supabaseClient')

const ROLES = ['viewer', 'agent', 'manager', 'admin', 'owner']
const RANK = Object.fromEntries(ROLES.map((r, i) => [r, i]))

// Mesmo mapeamento de public.rf_role_from_team (organizations.sql).
function roleFromTeam(role) {
  const r = String(role || '').trim().toLowerCase()
  if (['admin', 'administrador', 'owner'].includes(r)) return 'admin'
  if (['supervisor', 'gerente', 'manager'].includes(r)) return 'manager'
  if (['viewer', 'visualizador'].includes(r)) return 'viewer'
  return 'agent'
}

const atLeast = (role, min) => (RANK[role] ?? -1) >= (RANK[min] ?? Infinity)

let missingLogged = false
function missing(error) {
  // Tabela/função ainda não criada → avisa uma vez e segue sem organização.
  const code = String(error?.code || '')
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code) || /does not exist|schema cache/i.test(error?.message || '')) {
    if (!missingLogged) { console.warn('[orgs] tabelas de organização ausentes — rode supabase/organizations.sql'); missingLogged = true }
    return true
  }
  return false
}

// Chamado no login. sub = dono da conta; memberId/authUserId quando quem entra é membro.
// Devolve { orgId, role } ou null.
async function resolveLogin({ sub, memberId = null, authUserId = null }) {
  if (!isConfigured || !sub) return null
  try {
    const { data: orgId, error } = await supabase.rpc('rf_ensure_organization', { p_owner: sub })
    if (error) { if (!missing(error)) console.warn('[orgs] ensure:', error.message); return null }
    if (!orgId) return null
    if (!memberId) return { orgId, role: 'owner' }

    // Membro: primeira vez com login próprio → liga o usuário ao vínculo.
    if (authUserId) {
      await supabase.from('organization_members')
        .update({ user_id: authUserId, status: 'active', updated_at: new Date().toISOString() })
        .eq('team_member_id', memberId).eq('organization_id', orgId).neq('status', 'removed')
        .or(`user_id.is.null,user_id.eq.${authUserId}`)
    }
    const { data: m } = await supabase.from('organization_members')
      .select('role, status').eq('team_member_id', memberId).eq('organization_id', orgId).maybeSingle()
    if (!m || m.status === 'removed') return { orgId, role: 'viewer' }
    return { orgId, role: m.role === 'owner' ? 'admin' : m.role }
  } catch (e) {
    console.warn('[orgs] login:', e?.message ?? e)
    return null
  }
}

// Papel de quem está chamando, a partir do JWT do proxy.
function roleOf(user) {
  if (user?.org_role && RANK[user.org_role] != null) return user.org_role
  return user?.member_id ? 'agent' : 'owner'
}

async function getOrganization(ownerId) {
  if (!isConfigured || !ownerId) return null
  const { data, error } = await supabase.from('organizations')
    .select('id, name, created_at, owner_user_id').eq('owner_user_id', ownerId).maybeSingle()
  if (error) { if (missing(error)) return null; throw error }
  return data
}

async function listMembers(orgId) {
  const { data, error } = await supabase.from('organization_members')
    .select('id, email, role, status, team_member_id, created_at')
    .eq('organization_id', orgId).neq('status', 'removed')
    .order('created_at', { ascending: true })
  if (error) { if (missing(error)) return []; throw error }
  return (data || []).sort((a, b) => RANK[b.role] - RANK[a.role])
}

async function renameOrganization(ownerId, name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (clean.length < 2) throw Object.assign(new Error('Nome muito curto.'), { status: 400 })
  const { data, error } = await supabase.from('organizations')
    .update({ name: clean, updated_at: new Date().toISOString() })
    .eq('owner_user_id', ownerId).select('id, name').maybeSingle()
  if (error) throw error
  return data
}

module.exports = { ROLES, RANK, roleFromTeam, atLeast, roleOf, resolveLogin, getOrganization, listMembers, renameOrganization }
