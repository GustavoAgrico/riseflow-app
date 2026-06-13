import React from 'react'
import { Link } from 'react-router-dom'
import { usePlan } from '@hooks/usePlan'
import { Layout } from '@components/Layout/Layout'
import {
  MessageCircle, Users, Zap, TrendingUp, ArrowUpRight,
  CheckCircle, AlertCircle, Wifi, Sparkles, GitBranch,
  Instagram, Facebook
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts'
import { CHART_DATA } from '@constants/config'
import { useDashboardData } from '@hooks/useDashboardData'
import { useOnboarding } from '@hooks/useOnboarding'
import { OnboardingWizard } from '@components/OnboardingWizard'
import { useApp } from '@context/AppContext'
import { useAuth } from '@context/AuthContext'
import clsx from 'clsx'

// ─── Sub-components ──────────────────────────────────────────────────────────

const StatCard = ({ icon: Icon, label, value, change, color }) => (
  <div className="stat-card group">
    <div className="flex items-start justify-between mb-4">
      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', color)}>
        <Icon size={18} className="text-white" />
      </div>
      <span className="badge text-xs bg-brand-green/15 text-brand-green">
        <ArrowUpRight size={10} />{change}
      </span>
    </div>
    <p className="text-2xl font-display font-bold text-white mb-1">{value}</p>
    <p className="text-sm text-slate-400">{label}</p>
  </div>
)

const ChannelDot = ({ channel }) => {
  const colors = { whatsapp: 'bg-green-500', instagram: 'bg-pink-500', facebook: 'bg-blue-500' }
  return <span className={clsx('w-2 h-2 rounded-full inline-block flex-shrink-0', colors[channel] || 'bg-slate-500')} />
}

const ChannelIcon = ({ channel, size = 14 }) => {
  if (channel === 'whatsapp') return <MessageCircle size={size} className="text-green-400" />
  if (channel === 'instagram') return <Instagram size={size} className="text-pink-400" />
  return <Facebook size={size} className="text-blue-400" />
}

const StatusBadge = ({ status }) => {
  const map = {
    active: ['bg-brand-green/15 text-brand-green', 'Ativo'],
    pending: ['bg-brand-yellow/15 text-brand-yellow', 'Pendente'],
    closed: ['bg-slate-500/15 text-slate-400', 'Fechado'],
  }
  const [cls, label] = map[status] || map.closed
  return <span className={clsx('badge', cls)}>{label}</span>
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-xl p-3 border border-dark-300">
      <p className="text-xs text-slate-400 mb-2">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-medium" style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

const LoadingSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="h-20 glass rounded-2xl" />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => <div key={i} className="h-32 glass rounded-2xl" />)}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[...Array(2)].map((_, i) => <div key={i} className="h-64 glass rounded-2xl" />)}
    </div>
  </div>
)

// ─── Empty State ─────────────────────────────────────────────────────────────

const EmptyState = ({ userName, onCreateFlow }) => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in">
    <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-brand-orange/20 to-brand-blue/20 border border-brand-orange/30 flex items-center justify-center mx-auto mb-6 animate-float glow-orange">
      <Sparkles size={40} className="text-brand-orange" />
    </div>

    <h2 className="font-display font-bold text-3xl text-white mb-3">
      Bem-vindo ao RiseFlow{userName ? `, ${userName}` : ''}!
    </h2>
    <p className="text-slate-400 max-w-md mb-8 leading-relaxed text-sm">
      Configure suas integrações para começar a automatizar suas mensagens e gerenciar seus clientes.
    </p>

    <div className="flex flex-wrap gap-4 justify-center mb-14">
      <Link to="/integrations" className="btn-primary px-7 py-3 text-base">
        <MessageCircle size={18} />
        Conectar WhatsApp
      </Link>
      <button onClick={onCreateFlow} className="btn-secondary px-7 py-3 text-base">
        <GitBranch size={18} />
        Criar primeiro fluxo
      </button>
      <Link to="/clients" className="btn-secondary px-7 py-3 text-base">
        <Users size={18} />
        Adicionar cliente
      </Link>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full">
      {[
        { icon: MessageCircle, title: 'Múltiplos canais', desc: 'WhatsApp, Instagram e Facebook em um só lugar', color: 'text-green-400' },
        { icon: Zap, title: 'Automações inteligentes', desc: 'Fluxos automáticos que vendem enquanto você dorme', color: 'text-brand-orange' },
        { icon: TrendingUp, title: 'Analytics em tempo real', desc: 'Acompanhe conversões e métricas do seu negócio', color: 'text-brand-blue' },
      ].map((f, i) => (
        <div key={i} className="glass rounded-2xl p-5 text-center hover:border-brand-orange/20 transition-all">
          <div className="w-10 h-10 rounded-xl bg-dark-500 flex items-center justify-center mx-auto mb-3">
            <f.icon size={18} className={f.color} />
          </div>
          <h4 className="font-display font-semibold text-white text-sm mb-1">{f.title}</h4>
          <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
        </div>
      ))}
    </div>
  </div>
)

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export const Dashboard = () => {
  const { flowsVersion, setNewFlowModalOpen } = useApp()
  const { user, isDemoMode } = useAuth()
  const { flows, clients, msgCount, activeFlows, activeClients, conversionRate, loading, isEmpty } = useDashboardData(flowsVersion)

  const { plan: usage } = usePlan()
  const { showOnboarding, completeOnboarding } = useOnboarding()

  const fullName = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? ''
  const firstName = fullName.split(' ')[0]

  if (loading) {
    return (
      <Layout title="Dashboard" subtitle="Visão geral do seu negócio">
        <LoadingSkeleton />
      </Layout>
    )
  }

  if (isEmpty && !isDemoMode) {
    return (
      <>
        {showOnboarding && <OnboardingWizard isOpen={showOnboarding} onComplete={completeOnboarding} />}
        <Layout title="Dashboard" subtitle="Bem-vindo ao RiseFlow">
          <EmptyState userName={firstName} onCreateFlow={() => setNewFlowModalOpen(true)} />
        </Layout>
      </>
    )
  }

  const stats = [
    { icon: MessageCircle, label: 'Mensagens Total', value: msgCount.toLocaleString(), change: 'total', color: 'bg-brand-orange' },
    { icon: Users, label: 'Clientes Ativos', value: activeClients.length.toLocaleString(), change: `${clients.length} total`, color: 'bg-brand-blue' },
    { icon: Zap, label: 'Fluxos Ativos', value: activeFlows.length.toString(), change: `${flows.length} total`, color: 'bg-purple-500' },
    { icon: TrendingUp, label: 'Taxa Conversão', value: `${conversionRate}%`, change: 'média', color: 'bg-brand-green' },
  ]

  return (
    <Layout title="Dashboard" subtitle="Visão geral do seu negócio">
      {showOnboarding && <OnboardingWizard isOpen={showOnboarding} onComplete={completeOnboarding} />}
      {/* Welcome */}
      <div className="glass-orange rounded-2xl p-5 mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-xl text-white mb-1">
            Olá{firstName ? `, ${firstName}` : ''}!
          </h2>
          <p className="text-slate-400 text-sm">
            Você tem{' '}
            <span className="text-brand-orange font-semibold">{activeFlows.length} fluxo{activeFlows.length !== 1 ? 's' : ''}</span>
            {' '}ativo{activeFlows.length !== 1 ? 's' : ''} agora.
            {isDemoMode && <span className="ml-2 text-yellow-400 text-xs">(dados de demonstração)</span>}
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <div className="flex items-center gap-1.5 glass rounded-xl px-3 py-2">
            <Wifi size={13} className="text-brand-green animate-pulse-slow" />
            <span className="text-xs text-brand-green font-medium">{activeFlows.length} fluxos online</span>
          </div>
        </div>
      </div>

      {/* Uso de mensagens do plano */}
      {usage && (() => {
        const unlimited = usage.messages_limit === -1
        const pct = unlimited ? 0 : Math.min((usage.messages_sent / usage.messages_limit) * 100, 100)
        const full = pct >= 100
        const barColor = full ? '#EF4444' : pct > 80 ? '#EAB308' : '#FF6B35'
        return (
          <div className="glass rounded-2xl p-5 mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <MessageCircle size={16} className="text-brand-orange" />
                <h3 className="font-display font-semibold text-white text-sm">Mensagens</h3>
                <span className="badge text-xs bg-purple-500/15 text-purple-300 capitalize">{usage.plan}</span>
              </div>
              <span className="text-xs text-slate-400">
                {unlimited ? `${usage.messages_sent.toLocaleString()} usadas · ilimitado` : `${usage.messages_sent} de ${usage.messages_limit} usadas`}
              </span>
            </div>
            <div className="h-2 bg-dark-400 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${unlimited ? 4 : pct}%`, background: barColor }} />
            </div>
            {full && (
              <div className="flex items-center gap-2 mt-2">
                <AlertCircle size={13} className="text-red-400" />
                <span className="text-xs text-red-400 font-medium">Limite atingido</span>
                <Link to="/plans" className="text-xs text-brand-orange hover:underline ml-auto">Fazer upgrade</Link>
              </div>
            )}
          </div>
        )
      })()}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((s, i) => <StatCard key={i} {...s} />)}
      </div>

      {/* Chart + Flows side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold text-white">Atividade</h3>
              <p className="text-xs text-slate-400">
                {isDemoMode ? 'Dados de exemplo' : 'Últimos 7 dias'}
              </p>
            </div>
            <div className="flex gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="w-2 h-2 rounded-full bg-brand-orange" />Mensagens
              </span>
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="w-2 h-2 rounded-full bg-brand-blue" />Conversões
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={CHART_DATA}>
              <defs>
                <linearGradient id="og" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FF6B35" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#FF6B35" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="bl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2D3A55" />
              <XAxis dataKey="day" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="messages" name="Mensagens" stroke="#FF6B35" fill="url(#og)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="conversions" name="Conversões" stroke="#3B82F6" fill="url(#bl)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Quick stats */}
        <div className="glass rounded-2xl p-5 flex flex-col gap-3">
          <h3 className="font-display font-semibold text-white mb-1">Canais Ativos</h3>
          {['whatsapp', 'instagram', 'facebook'].map(ch => {
            const count = flows.filter(f => f.channel === ch).length
            const labels = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook' }
            return (
              <div key={ch} className="flex items-center justify-between glass rounded-xl px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <ChannelIcon channel={ch} size={15} />
                  <span className="text-sm text-slate-300">{labels[ch]}</span>
                </div>
                <span className="text-sm font-semibold text-white">{count} fluxo{count !== 1 ? 's' : ''}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Clients + Flows */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Clients */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-white">Clientes Recentes</h3>
            <Link to="/clients" className="text-xs text-brand-orange hover:underline">Ver todos</Link>
          </div>
          {clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Users size={28} className="text-slate-600 mb-3" />
              <p className="text-sm text-slate-500">Nenhum cliente ainda</p>
              <Link to="/clients" className="text-xs text-brand-orange hover:underline mt-1">Adicionar cliente</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {clients.slice(0, 5).map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-dark-500 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-orange/30 to-brand-blue/30 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                      {c.name.split(' ').map(x => x[0]).slice(0, 2).join('')}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white group-hover:text-brand-orange transition-colors">{c.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <ChannelDot channel={c.channel} />
                        <span className="text-xs text-slate-500">{c.last_message || c.phone || '—'}</span>
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Flows */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-white">Fluxos Ativos</h3>
            <Link to="/automation" className="text-xs text-brand-orange hover:underline">Gerenciar</Link>
          </div>
          {flows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <GitBranch size={28} className="text-slate-600 mb-3" />
              <p className="text-sm text-slate-500">Nenhum fluxo criado</p>
              <button
                onClick={() => setNewFlowModalOpen(true)}
                className="text-xs text-brand-orange hover:underline mt-1"
              >
                Criar primeiro fluxo
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {flows.slice(0, 4).map(f => (
                <div key={f.id} className="p-3 rounded-xl hover:bg-dark-500 transition-colors cursor-pointer group">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <ChannelDot channel={f.channel} />
                      <span className="text-sm font-medium text-white group-hover:text-brand-orange transition-colors truncate max-w-[160px]">{f.name}</span>
                    </div>
                    <span className={clsx('badge text-xs', f.status === 'active' ? 'bg-brand-green/15 text-brand-green' : 'bg-brand-yellow/15 text-brand-yellow')}>
                      {f.status === 'active' ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                      {f.status === 'active' ? 'Ativo' : 'Pausado'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>{(f.triggers ?? 0).toLocaleString()} acionamentos</span>
                    {f.triggers > 0 && (
                      <span className="text-brand-green font-medium">
                        {((f.conversions / f.triggers) * 100).toFixed(1)}% conversão
                      </span>
                    )}
                  </div>
                  <div className="mt-2 h-1 bg-dark-400 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-brand-orange to-brand-blue rounded-full"
                      style={{ width: `${f.triggers > 0 ? Math.min((f.conversions / f.triggers) * 100, 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
