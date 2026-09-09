import React, { useEffect, useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import {
  LayoutDashboard, GitBranch, Users, ContactRound, Plug, Zap, MessageSquare,
  BarChart3, Settings, ChevronLeft, ChevronRight, ChevronDown, Search,
  Crown, Filter, Megaphone, Calendar, UserCog, FileText, ClipboardList, Bot, Sparkles, Receipt, PhoneCall,
} from 'lucide-react'
import { useApp } from '@context/AppContext'
import { useAuth } from '@context/AuthContext'
import { NAV_GROUPS, NAV_DEFAULT_OPEN } from '@constants/config'
import clsx from 'clsx'

const ICONS = { LayoutDashboard, GitBranch, Users, ContactRound, Plug, Zap, MessageSquare, BarChart3, Settings, Filter, Megaphone, Calendar, UserCog, FileText, ClipboardList, Crown, Bot, Sparkles, Receipt, PhoneCall }

const getInitials = (name = '') =>
  name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || 'U'

// Membros de equipe veem só o painel operacional do dono (dados da conta).
const MEMBER_PATHS = new Set([
  '/dashboard', '/chat', '/smart-attendant', '/flows',
  '/crm', '/clients', '/analytics', '/funnel',
  '/campaigns', '/schedules', '/templates', '/calls',
])

const LS_KEY = 'rf_nav_open'
const loadOpen = () => {
  try { return { ...NAV_DEFAULT_OPEN, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') } }
  catch { return { ...NAV_DEFAULT_OPEN } }
}

export const Sidebar = ({ mobile = false, drawerOpen = false, onNavigate }) => {
  const { sidebarOpen, setSidebarOpen } = useApp()
  const { user, isDemoMode, isMember } = useAuth()
  const location = useLocation()

  const [open, setOpen] = useState(loadOpen)
  const [query, setQuery] = useState('')
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(open)) } catch {} }, [open])

  const expanded = mobile || sidebarOpen
  const isActive = (path) => location.pathname === path
  const allow = (item) => !isMember || MEMBER_PATHS.has(item.path)

  // Grupos visíveis para o usuário (respeita restrição de membro; esconde vazios)
  const groups = NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter(allow) }))
    .filter(g => g.items.length)

  const groupOpen = (g) => open[g.id] ?? NAV_DEFAULT_OPEN[g.id] ?? true
  // O grupo com a página ativa fica sempre visível, mesmo se o usuário recolheu.
  const groupShown = (g) => groupOpen(g) || g.items.some(i => isActive(i.path))
  const toggle = (id) => setOpen(o => ({ ...o, [id]: !(o[id] ?? NAV_DEFAULT_OPEN[id] ?? true) }))

  const q = query.trim().toLowerCase()
  const results = q ? groups.flatMap(g => g.items).filter(i => i.label.toLowerCase().includes(q)) : null

  const fullName = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'Usuário'
  const sidebarUser = isDemoMode
    ? { name: 'Usuário Demo', email: 'demo@riseflow.app', avatar: 'D', plan: 'Demo' }
    : { name: fullName, email: user?.email ?? '', avatar: getInitials(fullName), plan: 'Starter' }

  // ── Item de navegação (link) ──────────────────────────────────────────────
  const NavLink = ({ item, iconOnly }) => {
    const Icon = ICONS[item.icon]
    const active = isActive(item.path)
    return (
      <Link
        to={item.path}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        aria-label={item.label}
        title={iconOnly ? item.label : undefined}
        className={clsx(
          'sidebar-item relative focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50',
          active && 'active',
          iconOnly && 'justify-center px-3',
        )}
      >
        {/* Indicador lateral (não depende só de cor) */}
        {active && <span aria-hidden="true" className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-brand-orange" />}
        {Icon && <Icon size={18} className={active ? 'text-brand-orange' : ''} aria-hidden="true" />}
        {!iconOnly && (
          <div className="flex items-center justify-between flex-1 min-w-0">
            <span className={clsx('truncate', active && 'font-semibold')}>{item.label}</span>
            {item.badge && (
              <span className="badge bg-brand-orange/20 text-brand-orange text-[10px] flex-shrink-0 ml-2">{item.badge}</span>
            )}
          </div>
        )}
      </Link>
    )
  }

  return (
    <aside
      aria-label="Navegação principal"
      className={clsx(
        'fixed left-0 top-0 h-screen bg-dark-800 border-r border-dark-400 z-50 flex flex-col transition-all duration-300',
        mobile ? 'w-64' : (sidebarOpen ? 'w-64' : 'w-20'),
        mobile && !drawerOpen && '-translate-x-full',
      )}
    >
      {/* Logo + colapso */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-dark-400">
        {expanded ? (
          <div className="flex items-center gap-2 animate-fade-in">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#FF6B35,#E55100)' }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', fontFamily: 'DM Sans, sans-serif' }}>RF</span>
            </div>
            <span className="font-display font-bold text-lg gradient-text">RiseFlow</span>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center mx-auto" style={{ background: 'linear-gradient(135deg,#FF6B35,#E55100)' }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', fontFamily: 'DM Sans, sans-serif' }}>RF</span>
          </div>
        )}
        {expanded && !mobile && (
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Recolher menu"
            className="p-1.5 rounded-lg hover:bg-dark-500 text-slate-400 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50"
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {/* Busca */}
      <div className="px-3 pt-3">
        {expanded ? (
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar páginas…"
              aria-label="Buscar páginas"
              className="w-full glass rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/40"
            />
          </div>
        ) : (
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu para buscar"
            title="Buscar"
            className="w-full flex justify-center p-2.5 rounded-xl hover:bg-dark-500 text-slate-400 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50"
          >
            <Search size={18} />
          </button>
        )}
      </div>

      {/* Navegação */}
      <nav aria-label="Seções" className="flex-1 px-3 py-3 overflow-y-auto no-scrollbar">
        {/* Resultados da busca (lista achatada) */}
        {results ? (
          results.length ? (
            <div role="group" aria-label="Resultados da busca" className="space-y-0.5">
              {results.map(item => <NavLink key={item.id} item={item} />)}
            </div>
          ) : (
            <p className="text-sm text-slate-500 px-3 py-4">Nada encontrado.</p>
          )
        ) : expanded ? (
          /* Grupos colapsáveis */
          groups.map(g => (
            <div key={g.id} className="mb-1">
              <button
                onClick={() => toggle(g.id)}
                aria-expanded={groupShown(g)}
                aria-controls={`nav-${g.id}`}
                className="w-full flex items-center gap-2 px-3 pt-3 pb-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/40"
              >
                <span className={clsx(
                  'flex-1 text-left text-[11px] uppercase tracking-wider font-semibold',
                  g.kind === 'admin' ? 'text-slate-600' : 'text-slate-500',
                )}>
                  {g.label}
                </span>
                {g.kind === 'admin' && (
                  <span className="text-[8.5px] uppercase tracking-wide text-slate-600 border border-dark-400 rounded px-1 py-px">admin</span>
                )}
                <ChevronDown size={13} className={clsx('text-slate-500 transition-transform', !groupShown(g) && '-rotate-90')} aria-hidden="true" />
              </button>
              <div id={`nav-${g.id}`} role="group" aria-label={g.label} hidden={!groupShown(g)} className="space-y-0.5">
                {g.items.map(item => <NavLink key={item.id} item={item} />)}
              </div>
            </div>
          ))
        ) : (
          /* Recolhido: ícones + tooltip, grupos separados por divisória */
          groups.map((g, gi) => (
            <div key={g.id}>
              {gi > 0 && <div className="my-2 mx-2 border-t border-dark-400/60" aria-hidden="true" />}
              <div role="group" aria-label={g.label} className="space-y-0.5">
                {g.items.map(item => <NavLink key={item.id} item={item} iconOnly />)}
              </div>
            </div>
          ))
        )}
      </nav>

      {/* Usuário + Plano */}
      <div className="p-3 border-t border-dark-400">
        {expanded ? (
          <div className={clsx('rounded-xl p-3 animate-fade-in', isDemoMode ? 'glass border border-yellow-500/20' : 'glass-orange')}>
            <div className="flex items-center gap-3 mb-3">
              <div className={clsx(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0',
                isDemoMode ? 'bg-yellow-500/80' : 'bg-gradient-to-br from-brand-orange to-brand-blue',
              )}>
                {sidebarUser.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{sidebarUser.name}</p>
                <p className="text-xs text-slate-400 truncate">{sidebarUser.email}</p>
              </div>
              {isDemoMode && (
                <span className="text-[10px] font-bold text-yellow-400 bg-yellow-400/15 border border-yellow-400/30 px-1.5 py-0.5 rounded-md flex-shrink-0">DEMO</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {isDemoMode
                ? <span className="text-xs text-yellow-400 font-medium">Modo visualização</span>
                : <><Crown size={12} className="text-brand-yellow" /><span className="text-xs text-brand-yellow font-medium">{sidebarUser.plan}</span></>}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Expandir menu"
            title="Expandir menu"
            className="w-full flex justify-center p-2.5 rounded-xl hover:bg-dark-500 text-slate-400 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50"
          >
            <ChevronRight size={18} />
          </button>
        )}
      </div>
    </aside>
  )
}
