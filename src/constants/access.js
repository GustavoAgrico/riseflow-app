// ─────────────────────────────────────────────────────────────────────────────
// Controle de acesso por cargo (RBAC leve)
// ─────────────────────────────────────────────────────────────────────────────
// O DONO da conta (quem se cadastrou) tem acesso total. Os MEMBROS de equipe
// logam com a própria conta e recebem acesso conforme o cargo definido em
// team_members.role. A hierarquia é: Admin ⊇ Supervisor ⊇ Atendente.
//
// Este arquivo é a ÚNICA fonte de verdade do que cada cargo enxerga. É usado por:
//   • AuthContext  → expõe `role` e `canAccess(path)`
//   • Sidebar      → mostra só os itens de menu permitidos
//   • PrivateRoute → bloqueia rotas acessadas direto pela URL
//
// IMPORTANTE (escrita): mesmo cargos altos operam telas de GESTÃO (Equipe, Logs)
// em modo somente-leitura no momento — apenas o DONO edita a equipe. Isso casa
// com a RLS atual (team_members é escrita só do dono). Ver canManage().

export const ROLES = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  SUPERVISOR: 'Supervisor',
  ATENDENTE: 'Atendente',
}

// Base operacional — o que TODO membro sempre acessa (paridade com o legado).
const BASE = [
  '/dashboard', '/hoje', '/chat', '/smart-attendant',
  '/flows', '/flows-novo', '/flow-builder',
  '/crm', '/clients', '/analytics', '/funnel',
  '/campaigns', '/schedules', '/templates', '/calls',
]

// Extras somados por cargo (cumulativos).
const SUPERVISOR_EXTRA = ['/monitor', '/activity-logs', '/teams']
const ADMIN_EXTRA = [...SUPERVISOR_EXTRA, '/integrations', '/automation']

const PATHS_BY_ROLE = {
  [ROLES.ATENDENTE]: BASE,
  [ROLES.SUPERVISOR]: [...BASE, ...SUPERVISOR_EXTRA],
  [ROLES.ADMIN]: [...BASE, ...ADMIN_EXTRA],
}

// Normaliza o texto livre de team_members.role para um cargo conhecido.
// isMember=false ⇒ é o DONO da conta (acesso total).
export function normalizeRole(role, { isMember } = {}) {
  if (!isMember) return ROLES.OWNER
  const r = String(role || '').trim().toLowerCase()
  if (r === 'admin' || r === 'administrador') return ROLES.ADMIN
  if (r === 'supervisor') return ROLES.SUPERVISOR
  return ROLES.ATENDENTE
}

// O cargo pode abrir esta rota? (casa a rota exata e suas sub-rotas: /crm → /crm/board)
export function canAccessPath(role, path) {
  if (role === ROLES.OWNER) return true
  const allowed = PATHS_BY_ROLE[role] ?? BASE
  return allowed.some(base => path === base || path.startsWith(base + '/'))
}

// Só o dono edita telas de gestão (equipe, logs); membros ficam em leitura.
export function canManage(role) {
  return role === ROLES.OWNER
}
