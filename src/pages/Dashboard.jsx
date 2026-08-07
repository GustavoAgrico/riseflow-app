import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePlan } from '@hooks/usePlan'
import { Layout } from '@components/Layout/Layout'
import {
  MessageCircle, Users, Zap, TrendingUp, ArrowUpRight,
  CheckCircle, AlertCircle, Wifi, Sparkles, GitBranch,
  Instagram, Facebook, Link as LinkIcon, Activity,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { useDashboardData } from '@hooks/useDashboardData'
import { useOnboarding } from '@hooks/useOnboarding'
import { OnboardingWizard } from '@components/OnboardingWizard'
import { useApp } from '@context/AppContext'
import { useAuth } from '@context/AuthContext'
import clsx from 'clsx'

const CH_COLOR = {
  whatsapp: '#22C55E',
  instagram: '#EC4899',
  facebook: '#3B82F6',
  telegram: '#38BDF8',
}

// ── Inline sparkline (SVG, no deps) ──────────────────────────────────────────
const Sparkline = ({ data = [], color = '#FF6B35', w = 72, h = 30 }) => {
  if (data.length < 2 || data.every(v => v === 0)) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const rng = max - min || 1
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - 4 - ((v - min) / rng) * (h - 8),
  ])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`
  const last = pts[pts.length - 1]
  const uid = `sp${color.replace(/\W/g, '')}`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${uid})`} />
      <path d={line} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
      <circle cx={last[0]} cy={last[1]} r="5" fill={color} fillOpacity=".18" />
    </svg>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, change, color, hex = '#FF6B35', sparkData }) => (
  <div className="stat-card group" style={{ position: 'relative', overflow: 'hidden' }}>
    {/* Radial color glow */}
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      background: `radial-gradient(ellipse at 110% -10%, ${hex}22 0%, transparent 65%)`,
    }} />
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', color)}
           style={{ boxShadow: `0 4px 18px ${hex}55` }}>
        <Icon size={18} className="text-white" />
      </div>
      <Sparkline data={sparkData} color={hex} />
    </div>
    <p className="font-display font-bold text-white"
       style={{ fontSize: 26, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.03em', lineHeight: 1, marginBottom: 5 }}>
      {value}
    </p>
    <p style={{ fontSize: 11, color: '#64748B', marginBottom: 10 }}>{label}</p>
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <ArrowUpRight size={11} style={{ color: hex }} />
      <span style={{ fontSize: 11, color: '#475569' }}>{change}</span>
    </div>
  </div>
)

// ── Channel dot (inline style) ────────────────────────────────────────────────
const ChDot = ({ channel }) => (
  <span style={{
    width: 6, height: 6, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
    background: CH_COLOR[channel] || '#64748B',
  }} />
)

// ── Status badge ──────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    active:  { bg: '#10B98118', fg: '#10B981', label: 'Ativo' },
    pending: { bg: '#EAB30818', fg: '#EAB308', label: 'Pendente' },
    closed:  { bg: '#64748B18', fg: '#64748B', label: 'Fechado' },
  }
  const s = map[status] || map.closed
  return (
    <span style={{ background: s.bg, color: s.fg, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

// ── Premium tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(8,12,24,0.96)',
      border: '1px solid rgba(255,107,53,0.2)',
      borderRadius: 12, padding: '10px 14px',
      backdropFilter: 'blur(24px)',
      boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
      minWidth: 148,
    }}>
      <p style={{ fontSize: 10, color: '#475569', marginBottom: 9, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: i ? 6 : 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: '#94A3B8', flex: 1 }}>{p.name}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums', paddingLeft: 12 }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Custom active dot with outer ring ─────────────────────────────────────────
const ActiveDot = ({ cx, cy, fill }) => (
  <g>
    <circle cx={cx} cy={cy} r={8} fill={fill} fillOpacity={0.12} />
    <circle cx={cx} cy={cy} r={4} fill={fill} />
    <circle cx={cx} cy={cy} r={7.5} stroke={fill} strokeWidth={1.5} fill="none" />
  </g>
)

// ── Loading skeleton ───────────────────────────────────────────────────────────
const LoadingSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="h-20 glass rounded-2xl" />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => <div key={i} className="h-36 glass rounded-2xl" />)}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 h-72 glass rounded-2xl" />
      <div className="h-72 glass rounded-2xl" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[...Array(2)].map((_, i) => <div key={i} className="h-64 glass rounded-2xl" />)}
    </div>
  </div>
)

// ── Empty state ───────────────────────────────────────────────────────────────
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
        <MessageCircle size={18} />Conectar WhatsApp
      </Link>
      <button onClick={onCreateFlow} className="btn-secondary px-7 py-3 text-base">
        <GitBranch size={18} />Criar primeiro fluxo
      </button>
      <Link to="/clients" className="btn-secondary px-7 py-3 text-base">
        <Users size={18} />Adicionar cliente
      </Link>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full">
      {[
        { icon: MessageCircle, title: 'Múltiplos canais', desc: 'WhatsApp, Instagram e Facebook em um só lugar', color: 'text-green-400' },
        { icon: Zap,           title: 'Automações inteligentes', desc: 'Fluxos automáticos que vendem enquanto você dorme', color: 'text-brand-orange' },
        { icon: TrendingUp,   title: 'Analytics em tempo real', desc: 'Acompanhe conversões e métricas do seu negócio', color: 'text-brand-blue' },
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

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const Dashboard = () => {
  const { flowsVersion, setNewFlowModalOpen } = useApp()
  const { user, isDemoMode } = useAuth()
  const {
    flows, clients, conversations,
    totalMessages, totalFlows, activeFlows,
    totalClients, activeClients, totalConversations,
    integrations, connectedIntegrations, hasAnyIntegration,
    chartData, loading, isEmpty,
  } = useDashboardData(flowsVersion)

  const { plan: usage } = usePlan()
  const { showOnboarding, completeOnboarding } = useOnboarding()
  // Dois tipos de gráfico premium no card de Atividade (Área / Barras).
  const [chartType, setChartType] = useState('area')

  const fullName = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? ''
  const firstName = fullName.split(' ')[0]

  if (loading) return <Layout title="Dashboard" subtitle="Visão geral do seu negócio"><LoadingSkeleton /></Layout>

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

  // Sparkline data: 7-day message counts
  const sparkline = chartData.map(d => d.messages)

  const stats = [
    { icon: MessageCircle, label: 'Mensagens Enviadas',  value: totalMessages.toLocaleString('pt-BR'),      change: `${totalConversations} conversas ativas`, color: 'bg-brand-orange', hex: '#FF6B35' },
    { icon: Users,         label: 'Clientes',            value: totalClients.toLocaleString('pt-BR'),       change: `${activeClients.length} ativos`,         color: 'bg-brand-blue',   hex: '#3B82F6' },
    { icon: Zap,           label: 'Fluxos Criados',      value: totalFlows.toString(),                      change: `${activeFlows.length} ativos`,            color: 'bg-purple-500',   hex: '#A855F7' },
    { icon: TrendingUp,    label: 'Conversas',           value: totalConversations.toLocaleString('pt-BR'), change: 'abertas agora',                           color: 'bg-brand-green',  hex: '#10B981' },
  ]

  const channels = [
    { id: 'whatsapp',  label: 'WhatsApp',  Icon: MessageCircle },
    { id: 'instagram', label: 'Instagram', Icon: Instagram },
    { id: 'facebook',  label: 'Facebook',  Icon: Facebook },
    { id: 'telegram',  label: 'Telegram',  Icon: MessageCircle },
  ].map(ch => {
    const integration = integrations.find(i => i.type === ch.id)
    const connected = integration?.status === 'connected'
    const flowCount = flows.filter(f => f.channel === ch.id).length
    const convCount = conversations.filter(c => c.contact_channel === ch.id).length
    return { ...ch, connected, flowCount, convCount }
  })

  const donutData = channels
    .filter(c => c.connected)
    .map(c => ({ name: c.label, value: c.convCount || 1, color: CH_COLOR[c.id] }))

  return (
    <Layout title="Dashboard" subtitle="Visão geral do seu negócio">
      {showOnboarding && <OnboardingWizard isOpen={showOnboarding} onComplete={completeOnboarding} />}

      {/* ── Welcome banner ── */}
      <div className="glass-orange rounded-2xl p-5 mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-xl text-white mb-1">
            Olá{firstName ? `, ${firstName}` : ''}!
          </h2>
          <p className="text-sm text-slate-400">
            {totalMessages > 0
              ? <><span className="text-brand-orange font-semibold">{totalMessages.toLocaleString('pt-BR')}</span> mensagens processadas no total.</>
              : totalFlows > 0
                ? <><span className="text-brand-orange font-semibold">{totalFlows}</span> fluxo{totalFlows !== 1 ? 's' : ''} criado{totalFlows !== 1 ? 's' : ''}. Conecte uma integração para começar.</>
                : <>Configure suas integrações para começar a automatizar.</>
            }
            {isDemoMode && <span className="ml-2 text-yellow-400 text-xs">(modo demo)</span>}
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2">
          {hasAnyIntegration ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.22)', borderRadius: 12, padding: '8px 14px' }}>
              <Wifi size={13} className="text-brand-green animate-pulse-slow" />
              <span style={{ fontSize: 12, color: '#10B981', fontWeight: 500 }}>{connectedIntegrations.length} canal{connectedIntegrations.length !== 1 ? 'is' : ''} online</span>
            </div>
          ) : (
            <Link to="/integrations" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '8px 14px', textDecoration: 'none' }}>
              <LinkIcon size={13} className="text-slate-400" />
              <span style={{ fontSize: 12, color: '#94A3B8' }}>Conectar integração</span>
            </Link>
          )}
        </div>
      </div>

      {/* ── Plan usage ── */}
      {usage && (() => {
        const unlimited = usage.messages_limit === -1
        const pct = unlimited ? 0 : Math.min((usage.messages_sent / usage.messages_limit) * 100, 100)
        const full = pct >= 100
        const barHex = full ? '#EF4444' : pct > 80 ? '#EAB308' : '#FF6B35'
        return (
          <div className="glass rounded-2xl p-5 mb-6">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageCircle size={15} style={{ color: '#FF6B35' }} />
                <span className="font-display font-semibold text-white text-sm">Mensagens</span>
                <span style={{ background: 'rgba(168,85,247,0.14)', color: '#C084FC', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>{usage.plan}</span>
              </div>
              <span style={{ fontSize: 11, color: '#475569' }}>
                {unlimited ? `${usage.messages_sent.toLocaleString()} usadas · ilimitado` : `${usage.messages_sent} / ${usage.messages_limit}`}
              </span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4, width: `${unlimited ? 3 : pct}%`,
                background: `linear-gradient(90deg, ${barHex}, ${barHex}bb)`,
                boxShadow: `0 0 10px ${barHex}80`, transition: 'width .7s ease',
              }} />
            </div>
            {full && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <AlertCircle size={12} style={{ color: '#EF4444' }} />
                <span style={{ fontSize: 11, color: '#EF4444', fontWeight: 500 }}>Limite atingido</span>
                <Link to="/plans" style={{ fontSize: 11, color: '#FF6B35', marginLeft: 'auto', textDecoration: 'none' }}>Fazer upgrade →</Link>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((s, i) => <StatCard key={i} {...s} sparkData={sparkline} />)}
      </div>

      {/* ── Activity chart + Channels ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

        {/* Activity chart (2/3) */}
        <div className="lg:col-span-2 glass rounded-2xl p-5">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <h3 className="font-display font-semibold text-white">Atividade</h3>
              <p style={{ fontSize: 11, color: '#475569', marginTop: 3 }}>
                {hasAnyIntegration ? 'Últimos 7 dias · dados reais' : 'Conecte uma integração para ver dados'}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
              {/* Seletor de tipo de gráfico (dois estilos premium) */}
              <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 2 }}>
                {[{ id: 'area', label: 'Área' }, { id: 'bar', label: 'Barras' }].map(opt => {
                  const on = chartType === opt.id
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setChartType(opt.id)}
                      style={{
                        border: 'none', cursor: 'pointer', borderRadius: 8, padding: '4px 12px',
                        fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                        background: on ? 'rgba(255,107,53,0.16)' : 'transparent',
                        color: on ? '#FF6B35' : '#64748B',
                        boxShadow: on ? '0 0 0 1px rgba(255,107,53,0.28)' : 'none',
                        transition: 'all .15s',
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
              {/* Legenda */}
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                {[{ color: '#FF6B35', label: 'Total' }, { color: '#3B82F6', label: 'Enviadas' }].map(({ color, label }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 22, height: 2.5, background: color, borderRadius: 2, boxShadow: `0 0 6px ${color}` }} />
                    <span style={{ fontSize: 11, color: '#475569' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {!hasAnyIntegration ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, gap: 10 }}>
              <Activity size={30} style={{ color: '#1E2A3A' }} />
              <p style={{ fontSize: 13, color: '#2D3A55' }}>Nenhuma integração conectada</p>
              <Link to="/integrations" style={{ fontSize: 12, color: '#FF6B35', textDecoration: 'none' }}>Conectar agora →</Link>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              {chartType === 'area' ? (
                <AreaChart data={chartData} margin={{ top: 5, right: 4, bottom: 0, left: -22 }}>
                  <defs>
                    <linearGradient id="gOrange" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#FF6B35" stopOpacity={.38} />
                      <stop offset="55%"  stopColor="#FF6B35" stopOpacity={.08} />
                      <stop offset="100%" stopColor="#FF6B35" stopOpacity={0}   />
                    </linearGradient>
                    <linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#3B82F6" stopOpacity={.28} />
                      <stop offset="55%"  stopColor="#3B82F6" stopOpacity={.05} />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} dy={7} />
                  <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ stroke: 'rgba(255,255,255,0.07)', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  <Area
                    type="monotone" dataKey="messages" name="Total"
                    stroke="#FF6B35" fill="url(#gOrange)" strokeWidth={2.5}
                    dot={false} activeDot={<ActiveDot fill="#FF6B35" />}
                  />
                  <Area
                    type="monotone" dataKey="sent" name="Enviadas"
                    stroke="#3B82F6" fill="url(#gBlue)" strokeWidth={2}
                    dot={false} activeDot={<ActiveDot fill="#3B82F6" />}
                  />
                </AreaChart>
              ) : (
                <BarChart data={chartData} margin={{ top: 5, right: 4, bottom: 0, left: -22 }} barGap={4} barCategoryGap="26%">
                  <defs>
                    <linearGradient id="bOrange" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#FF8C5A" stopOpacity={1}   />
                      <stop offset="100%" stopColor="#FF6B35" stopOpacity={.5}  />
                    </linearGradient>
                    <linearGradient id="bBlue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#60A5FA" stopOpacity={1}   />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={.5}  />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} dy={7} />
                  <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  />
                  <Bar dataKey="messages" name="Total"    fill="url(#bOrange)" radius={[5, 5, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="sent"     name="Enviadas" fill="url(#bBlue)"   radius={[5, 5, 0, 0]} maxBarSize={18} />
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </div>

        {/* Channels (1/3) */}
        <div className="glass rounded-2xl p-5 flex flex-col">
          <h3 className="font-display font-semibold text-white mb-5">Canais</h3>

          {/* Donut chart */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            {donutData.length > 0 ? (
              <div style={{ position: 'relative' }}>
                <PieChart width={128} height={128}>
                  <Pie
                    data={donutData} cx={60} cy={60}
                    innerRadius={40} outerRadius={56}
                    dataKey="value" startAngle={90} endAngle={-270}
                    strokeWidth={2.5} stroke="#0A0E1A"
                  >
                    {donutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                </PieChart>
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none',
                }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    {connectedIntegrations.length}
                  </span>
                  <span style={{ fontSize: 10, color: '#475569', marginTop: 3 }}>ativo{connectedIntegrations.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            ) : (
              <div style={{
                width: 128, height: 128, borderRadius: '50%',
                border: '2px dashed rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 11, color: '#2D3A55', textAlign: 'center' }}>Sem canais</span>
              </div>
            )}
          </div>

          {/* Channel list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {channels.map(({ id, label, Icon, connected, flowCount }) => {
              const chColor = CH_COLOR[id]
              return (
                <div key={id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 12px', borderRadius: 11,
                  background: connected ? `${chColor}0C` : 'rgba(255,255,255,0.015)',
                  border: `1px solid ${connected ? chColor + '28' : 'rgba(255,255,255,0.04)'}`,
                  transition: 'border-color .15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon size={14} style={{ color: connected ? chColor : '#334155' }} />
                    <span style={{ fontSize: 13, color: connected ? '#CBD5E1' : '#334155' }}>{label}</span>
                  </div>
                  {connected ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10B981' }} />
                      <span style={{ fontSize: 11, color: '#10B981', fontWeight: 500 }}>{flowCount} fluxo{flowCount !== 1 ? 's' : ''}</span>
                    </div>
                  ) : (
                    <Link to="/integrations" style={{ fontSize: 11, color: '#334155', textDecoration: 'none' }}>Conectar</Link>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Clients + Flows ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Recent Clients */}
        <div className="glass rounded-2xl p-5">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 className="font-display font-semibold text-white">Clientes Recentes</h3>
            <Link to="/clients" style={{ fontSize: 12, color: '#FF6B35', textDecoration: 'none' }}>Ver todos →</Link>
          </div>
          {clients.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 0', textAlign: 'center', gap: 7 }}>
              <Users size={28} style={{ color: '#1E2A3A' }} />
              <p style={{ fontSize: 13, color: '#2D3A55' }}>Nenhum cliente ainda</p>
              <Link to="/clients" style={{ fontSize: 12, color: '#FF6B35', textDecoration: 'none' }}>Adicionar →</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {clients.slice(0, 5).map(c => {
                const initials = c.name.split(' ').map(x => x[0]).slice(0, 2).join('')
                return (
                  <div key={c.id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 10px', borderRadius: 11, cursor: 'pointer', transition: 'background .15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg, rgba(255,107,53,.28), rgba(59,130,246,.28))',
                        border: '1px solid rgba(255,107,53,.18)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, color: '#fff',
                      }}>{initials}</div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: '#E2E8F0', lineHeight: 1, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <ChDot channel={c.channel} />
                          <span style={{ fontSize: 11, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{c.last_message || c.phone || '—'}</span>
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Active Flows */}
        <div className="glass rounded-2xl p-5">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 className="font-display font-semibold text-white">Fluxos Ativos</h3>
            <Link to="/automation" style={{ fontSize: 12, color: '#FF6B35', textDecoration: 'none' }}>Gerenciar →</Link>
          </div>
          {flows.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 0', textAlign: 'center', gap: 7 }}>
              <GitBranch size={28} style={{ color: '#1E2A3A' }} />
              <p style={{ fontSize: 13, color: '#2D3A55' }}>Nenhum fluxo criado</p>
              <button onClick={() => setNewFlowModalOpen(true)} style={{ background: 'none', border: 'none', fontSize: 12, color: '#FF6B35', cursor: 'pointer', padding: 0 }}>Criar primeiro fluxo →</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {flows.slice(0, 4).map(f => {
                const convRate = f.triggers > 0 ? (f.conversions / f.triggers) * 100 : 0
                const isActive = f.status === 'active'
                const chColor = CH_COLOR[f.channel] || '#64748B'
                return (
                  <div key={f.id}
                    style={{
                      padding: '12px 14px', borderRadius: 12,
                      background: 'rgba(255,255,255,0.025)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      cursor: 'pointer', transition: 'border-color .15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,107,53,0.22)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: chColor, flexShrink: 0, boxShadow: `0 0 6px ${chColor}` }} />
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      </div>
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                        background: isActive ? 'rgba(16,185,129,0.12)' : 'rgba(234,179,8,0.12)',
                        color: isActive ? '#10B981' : '#EAB308',
                        borderRadius: 20, padding: '3px 9px', fontSize: 11, fontWeight: 600,
                      }}>
                        {isActive ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                        {isActive ? 'Ativo' : 'Pausado'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                      <span style={{ fontSize: 11, color: '#475569' }}>{(f.triggers ?? 0).toLocaleString('pt-BR')} acionamentos</span>
                      {f.triggers > 0 && (
                        <span style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>{convRate.toFixed(1)}% conv.</span>
                      )}
                    </div>
                    {/* Gradient conversion bar with glow */}
                    <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 3,
                        width: `${Math.min(convRate, 100)}%`,
                        background: 'linear-gradient(90deg, #FF6B35, #A855F7)',
                        boxShadow: '0 0 8px rgba(255,107,53,0.5)',
                        transition: 'width .7s ease',
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
