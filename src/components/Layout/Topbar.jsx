import React, { useState, useRef, useEffect } from 'react'
import { Search, Bell, Plus, ChevronDown, LogOut, User, Zap, Menu, MessageCircle, Megaphone, AlertTriangle } from 'lucide-react'
import { useNavigate, Link } from 'react-router-dom'
import { useApp } from '@context/AppContext'
import { useAuth } from '@context/AuthContext'
import clsx from 'clsx'

const getInitials = (name) => {
  if (!name) return 'U'
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

const NOTIF_ICON = { message: MessageCircle, lead: User, campaign: Megaphone, flow: Zap, warning: AlertTriangle, system: Bell }
const relTime = (t) => {
  const d = Date.now() - new Date(t).getTime()
  if (d < 60000) return 'agora'
  if (d < 3600000) return `há ${Math.floor(d / 60000)}min`
  if (d < 86400000) return `há ${Math.floor(d / 3600000)}h`
  return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export const Topbar = ({ title, subtitle, onMenu }) => {
  const { notifications, markAllRead, unreadCount, clearAll, setNewFlowModalOpen } = useApp()
  const { user, signOut, isDemoMode } = useAuth()
  const [showNotif, setShowNotif] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const userMenuRef = useRef(null)
  const navigate = useNavigate()

  const fullName = user?.user_metadata?.full_name ?? user?.email ?? 'Usuário'
  const initials = getInitials(fullName)
  const displayName = fullName.split(' ')[0]

  useEffect(() => {
    const handleClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await signOut()
      navigate('/login')
    } catch {
      setLoggingOut(false)
    }
  }

  return (
    <div className="sticky top-0 z-30">
      {isDemoMode && (
        <div className="bg-brand-orange flex items-center justify-between gap-2 px-3 sm:px-6 py-2">
          <div className="flex items-center gap-2 text-white text-xs font-medium min-w-0">
            <Zap size={13} className="flex-shrink-0" />
            <span className="truncate"><span className="hidden sm:inline">Modo Demo — </span>Cadastre-se para salvar seus dados</span>
          </div>
          <Link
            to="/register"
            className="text-xs font-semibold bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-lg transition-colors whitespace-nowrap flex-shrink-0"
          >
            Criar conta grátis
          </Link>
        </div>
      )}
    <header className="h-16 border-b border-dark-400 flex items-center justify-between gap-2 px-3 sm:px-6 bg-dark-800/80 backdrop-blur-md">
      <div className="flex items-center gap-1 sm:gap-2 min-w-0">
        {onMenu && (
          <button
            onClick={onMenu}
            aria-label="Abrir menu"
            className="text-slate-400 hover:text-white transition-colors flex-shrink-0"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center' }}
          ><Menu size={20} /></button>
        )}
        <button
          onClick={() => navigate('/dashboard')}
          className="hidden md:inline-flex text-slate-400 hover:text-white transition-colors flex-shrink-0"
          style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}
        >←</button>
        <div className="min-w-0">
          <h1 className="font-display font-bold text-base sm:text-lg text-white truncate">{title}</h1>
          {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        {/* Search */}
        <div className="hidden md:flex items-center gap-2 glass rounded-xl px-3 py-2 w-52">
          <Search size={14} className="text-slate-400" />
          <input
            type="text"
            placeholder="Buscar..."
            className="bg-transparent text-sm text-white placeholder-slate-500 outline-none flex-1"
          />
          <kbd className="text-[10px] text-slate-500 font-mono bg-dark-500 px-1.5 py-0.5 rounded">⌘K</kbd>
        </div>

        {/* New Flow Button */}
        <button
          onClick={() => setNewFlowModalOpen(true)}
          className="btn-primary"
        >
          <Plus size={15} />
          <span className="hidden md:inline">Novo Fluxo</span>
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setShowNotif(!showNotif); if (!showNotif) markAllRead() }}
            className="relative p-2.5 glass rounded-xl hover:border-brand-orange/40 transition-all"
          >
            <Bell size={17} className="text-slate-300" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-orange rounded-full text-[10px] font-bold flex items-center justify-center animate-pulse-slow">
                {unreadCount}
              </span>
            )}
          </button>
          {showNotif && (
            <div className="absolute right-0 top-12 w-80 max-w-[calc(100vw-1.5rem)] glass-solid rounded-2xl border border-dark-300 shadow-xl overflow-hidden animate-slide-up z-50">
              <div className="px-4 py-3 border-b border-dark-400 flex justify-between items-center">
                <span className="font-display font-semibold text-sm">Notificações</span>
                <span className="text-xs text-brand-orange cursor-pointer" onClick={markAllRead}>Marcar lidas</span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-slate-500">Nenhuma notificação</p>
                ) : notifications.slice(0, 10).map(n => (
                  <div key={n.id} className={clsx('px-4 py-3 flex items-start gap-2.5 hover:bg-dark-500 transition-colors', !n.read && 'border-l-2 border-brand-orange')}>
                    {(() => { const Ni = NOTIF_ICON[n.type] ?? Bell; return <Ni size={16} className="text-slate-300 flex-shrink-0 mt-0.5" /> })()}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-100 truncate">{n.title}</p>
                      {n.message && <p className="text-xs text-slate-400 mt-0.5 break-words">{n.message}</p>}
                      <p className="text-[11px] text-slate-500 mt-0.5">{relTime(n.time)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2.5 border-t border-dark-400 flex justify-between items-center">
                <span className="text-xs text-slate-400 cursor-pointer hover:text-white" onClick={() => setShowNotif(false)}>Ver todas</span>
                <span className="text-xs text-brand-red cursor-pointer" onClick={clearAll}>Limpar todas</span>
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2.5 glass rounded-xl px-3 py-2 hover:border-brand-orange/40 transition-all"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-orange to-brand-blue flex items-center justify-center text-white text-xs font-bold font-display flex-shrink-0">
              {initials}
            </div>
            <span className="hidden md:block text-sm text-white font-medium max-w-[90px] truncate">{displayName}</span>
            <ChevronDown size={14} className={clsx('text-slate-400 transition-transform', showUserMenu && 'rotate-180')} />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-12 w-52 glass-solid rounded-2xl border border-dark-300 shadow-xl overflow-hidden animate-slide-up z-50">
              <div className="px-4 py-3 border-b border-dark-400">
                <p className="text-sm font-medium text-white truncate">{fullName}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
              <div className="p-1.5">
                <button
                  onClick={() => { setShowUserMenu(false); navigate('/settings') }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-dark-500 transition-all text-sm"
                >
                  <User size={15} />
                  Minha conta
                </button>
                <button
                  disabled={loggingOut}
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-brand-red hover:bg-brand-red/10 transition-all text-sm disabled:opacity-50"
                >
                  {loggingOut
                    ? <div className="w-4 h-4 border-2 border-brand-red/30 border-t-brand-red rounded-full animate-spin" />
                    : <LogOut size={15} />
                  }
                  Sair
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
    </div>
  )
}
