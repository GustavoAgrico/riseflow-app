import React from 'react'
import { useLocation, Link } from 'react-router-dom'
import {
  LayoutDashboard, GitBranch, Users, ContactRound, Plug, Zap, MessageSquare,
  BarChart3, Settings, ChevronLeft, ChevronRight,
  Crown, Filter, Megaphone, Calendar, UserCog, FileText, ClipboardList, Menu, Bot, Sparkles
} from 'lucide-react'
import { useApp } from '@context/AppContext'
import { useAuth } from '@context/AuthContext'
import { NAV_ITEMS } from '@constants/config'
import clsx from 'clsx'

const ICONS = { LayoutDashboard, GitBranch, Users, ContactRound, Plug, Zap, MessageSquare, BarChart3, Settings, Filter, Megaphone, Calendar, UserCog, FileText, ClipboardList, Crown, Bot, Sparkles }

const getInitials = (name = '') =>
  name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || 'U'

export const Sidebar = ({ mobile = false, drawerOpen = false, onNavigate }) => {
  const { sidebarOpen, setSidebarOpen } = useApp()
  const { user, isDemoMode, isMember } = useAuth()
  const location = useLocation()

  // Membros de equipe veem o MESMO painel operacional do dono (dados da conta,
  // em tempo real). Ficam de fora só as telas de configuração/segredos/cobrança:
  // Integrações, Automação, Equipes, Planos, Logs e Configurações.
  const MEMBER_PATHS = new Set([
    '/dashboard', '/chat', '/smart-attendant', '/flows',
    '/crm', '/clients', '/analytics', '/funnel',
    '/campaigns', '/schedules', '/templates',
  ])
  // No mobile a sidebar vira um drawer sempre expandido (controlado por drawerOpen)
  const expanded = mobile || sidebarOpen

  const fullName = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'Usuário'

  const sidebarUser = isDemoMode
    ? { name: 'Usuário Demo', email: 'demo@riseflow.app', avatar: 'D', plan: 'Demo' }
    : {
        name: fullName,
        email: user?.email ?? '',
        avatar: getInitials(fullName),
        plan: 'Starter',
      }

  return (
    <aside className={clsx(
      'fixed left-0 top-0 h-screen bg-dark-800 border-r border-dark-400 z-50 flex flex-col transition-all duration-300',
      mobile ? 'w-64' : (sidebarOpen ? 'w-64' : 'w-20'),
      mobile && !drawerOpen && '-translate-x-full'
    )}>
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-dark-400">
        {expanded && (
          <div className="flex items-center gap-2 animate-fade-in">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#FF6B35,#E55100)' }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', fontFamily: 'DM Sans, sans-serif' }}>RF</span>
            </div>
            <span className="font-display font-bold text-lg gradient-text">RiseFlow</span>
          </div>
        )}
        {!expanded && (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center mx-auto" style={{ background: 'linear-gradient(135deg,#FF6B35,#E55100)' }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', fontFamily: 'DM Sans, sans-serif' }}>RF</span>
          </div>
        )}
        {expanded && !mobile && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg hover:bg-dark-500 text-slate-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto no-scrollbar">
        {NAV_ITEMS.filter(item => !isMember || MEMBER_PATHS.has(item.path)).map(item => {
          const Icon = ICONS[item.icon]
          const isActive = location.pathname === item.path
          return (
            <Link
              key={item.id}
              to={item.path}
              onClick={onNavigate}
              className={clsx('sidebar-item', isActive && 'active', !expanded && 'justify-center px-3')}
              title={!expanded ? item.label : ''}
            >
              {Icon && <Icon size={18} className={isActive ? 'text-brand-orange' : ''} />}
              {expanded && (
                <div className="flex items-center justify-between flex-1">
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="badge bg-brand-orange/20 text-brand-orange text-[10px]">
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User + Plan */}
      <div className="p-3 border-t border-dark-400">
        {expanded ? (
          <div className={clsx('rounded-xl p-3 animate-fade-in', isDemoMode ? 'glass border border-yellow-500/20' : 'glass-orange')}>
            <div className="flex items-center gap-3 mb-3">
              <div className={clsx(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0',
                isDemoMode ? 'bg-yellow-500/80' : 'bg-gradient-to-br from-brand-orange to-brand-blue'
              )}>
                {sidebarUser.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{sidebarUser.name}</p>
                <p className="text-xs text-slate-400 truncate">{sidebarUser.email}</p>
              </div>
              {isDemoMode && (
                <span className="text-[10px] font-bold text-yellow-400 bg-yellow-400/15 border border-yellow-400/30 px-1.5 py-0.5 rounded-md flex-shrink-0">
                  DEMO
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {isDemoMode
                ? <span className="text-xs text-yellow-400 font-medium">Modo visualização</span>
                : <><Crown size={12} className="text-brand-yellow" /><span className="text-xs text-brand-yellow font-medium">{sidebarUser.plan}</span></>
              }
            </div>
          </div>
        ) : (
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-full flex justify-center p-2.5 rounded-xl hover:bg-dark-500 text-slate-400 hover:text-white transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        )}
      </div>
    </aside>
  )
}
