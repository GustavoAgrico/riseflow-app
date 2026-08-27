import React, { useState, useEffect, useRef } from 'react'
import { Layout } from '@components/Layout/Layout'
import { useAuth } from '@context/AuthContext'
import { supabase } from '@/lib/supabase'
import { Send, Inbox, Users, MessageSquare, Target, Clock, Loader2 } from 'lucide-react'
import { exportPremiumPDF } from '@utils/exportUtils'
import { logger } from '@services/activityLogger'
import clsx from 'clsx'

const PERIODS = [
  { key: '1d',  label: 'Hoje',    days: 1  },
  { key: '7d',  label: '7 dias',  days: 7  },
  { key: '30d', label: '30 dias', days: 30 },
  { key: '90d', label: '90 dias', days: 90 },
]

const CH = {
  whatsapp:  { label: 'WhatsApp',  color: '#25D366' },
  instagram: { label: 'Instagram', color: '#E1306C' },
  facebook:  { label: 'Facebook',  color: '#1877F2' },
  telegram:  { label: 'Telegram',  color: '#2AABEE' },
}

const relTime = ts => {
  if (!ts) return '—'
  const m = Math.floor((Date.now() - new Date(ts)) / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}min atrás`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h atrás` : `${Math.floor(h / 24)}d atrás`
}

const ini = n => (n || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

// Dados de exemplo p/ o modo demo — escalam com o período para o gráfico e os
// KPIs fazerem sentido em Hoje/7/30/90 dias, sem bater no banco.
const buildDemo = (days) => {
  const slots = Math.min(days, 7)
  const chart = []
  for (let i = slots - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000)
    const date = d.toLocaleDateString('pt-BR', { weekday: 'short' })
    chart.push({ date, sent: 45 + (i * 29) % 55, recv: 32 + (i * 41) % 44 })
  }
  const sent = Math.round(62 * days)
  const recv = Math.round(48 * days)
  return {
    sent, recv, clients: 1382, rate: Math.round((sent / (sent + recv)) * 100),
    conversions: 1204, avgTime: 92, chart,
    channels: [
      { label: 'WhatsApp',  val: 142, pct: 63, color: '#25D366' },
      { label: 'Instagram', val: 46,  pct: 20, color: '#E1306C' },
      { label: 'Facebook',  val: 24,  pct: 11, color: '#1877F2' },
      { label: 'Telegram',  val: 14,  pct: 6,  color: '#2AABEE' },
    ],
    topConvs: [
      { name: 'Ana Paula Silva',  msgs: 38, last: '12min atrás', color: '#25D366' },
      { name: 'Carlos Eduardo',   msgs: 31, last: '1h atrás',    color: '#E1306C' },
      { name: 'Marina Rodrigues', msgs: 27, last: '2h atrás',    color: '#1877F2' },
      { name: 'Roberto Santos',   msgs: 19, last: '3h atrás',    color: '#25D366' },
      { name: 'Julia Ferreira',   msgs: 14, last: '5h atrás',    color: '#2AABEE' },
    ],
    flows: [
      { name: 'Boas-vindas WhatsApp',   active: true,  runs: 847,  rate: 37 },
      { name: 'Qualificação de Leads',  active: true,  runs: 1203, rate: 74 },
      { name: 'Follow-up Carrinho',     active: false, runs: 445,  rate: 42 },
      { name: 'Pós-venda Satisfação',   active: true,  runs: 2891, rate: 81 },
    ],
  }
}

const LineChart = ({ data }) => {
  const ref = useRef(null)
  useEffect(() => {
    const cv = ref.current; if (!cv || !data.length) return
    const ctx = cv.getContext('2d')
    const W = cv.clientWidth || 600, H = 200
    cv.width = W; cv.height = H
    const px = 40, py = 16, pb = 28, pr = 12, iW = W - px - pr, iH = H - py - pb
    const max = Math.max(...data.flatMap(d => [d.sent, d.recv]), 1)
    const X = i => px + (i / Math.max(data.length - 1, 1)) * iW
    const Y = v => py + iH - (v / max) * iH
    ctx.clearRect(0, 0, W, H)
    for (let i = 0; i <= 4; i++) {
      const y = py + (i / 4) * iH
      ctx.strokeStyle = '#2D3A55'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(W - pr, y); ctx.stroke()
      ctx.fillStyle = '#475569'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right'
      ctx.fillText(Math.round(max * (1 - i / 4)), px - 5, y + 3)
    }
    const line = (key, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.beginPath()
      data.forEach((d, i) => { i ? ctx.lineTo(X(i), Y(d[key])) : ctx.moveTo(X(i), Y(d[key])) })
      ctx.stroke()
    }
    line('sent', '#FF6B35'); line('recv', '#3B82F6')
    ctx.fillStyle = '#475569'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
    data.forEach((d, i) => ctx.fillText(d.date, X(i), H - 6))
  }, [data])
  return <canvas ref={ref} style={{ width: '100%', height: 200, display: 'block' }} />
}

export function Analytics() {
  const { user, ownerUserId, isDemoMode } = useAuth()
  const [period, setPeriod]     = useState('7d')
  const [loading, setLoading]   = useState(true)
  const [sent, setSent]         = useState(0)
  const [recv, setRecv]         = useState(0)
  const [clients, setClients]   = useState(0)
  const [rate, setRate]         = useState(0)
  const [conversions, setConv]  = useState(0)
  const [avgTime, setAvgTime]   = useState(null)
  const [chartData, setChart]   = useState([])
  const [channels, setChannels] = useState([])
  const [topConvs, setTop]      = useState([])
  const [flows, setFlows]       = useState([])

  useEffect(() => {
    if (!ownerUserId) return
    setLoading(true)
    const days = PERIODS.find(p => p.key === period)?.days ?? 7

    // Modo demo: usa dados de exemplo (não bate no banco), como CRM/Funil/Campanhas.
    if (isDemoMode) {
      const d = buildDemo(days)
      setSent(d.sent); setRecv(d.recv); setClients(d.clients); setRate(d.rate)
      setConv(d.conversions); setAvgTime(d.avgTime); setChart(d.chart)
      setChannels(d.channels); setTop(d.topConvs); setFlows(d.flows)
      setLoading(false)
      return
    }

    const from = new Date(Date.now() - days * 86_400_000).toISOString()

    Promise.all([
      supabase.from('messages').select('direction, created_at, conversation_id')
        .eq('user_id', ownerUserId).gte('created_at', from),
      supabase.from('conversations').select('id, contact_name, contact_channel, last_message_at')
        .eq('user_id', ownerUserId).gte('last_message_at', from)
        .order('last_message_at', { ascending: false }).limit(10),
      supabase.from('clients').select('id', { count: 'exact', head: true })
        .eq('user_id', ownerUserId).eq('status', 'active'),
      supabase.from('flows').select('name, status, triggers, conversions')
        .eq('user_id', ownerUserId).order('triggers', { ascending: false }).limit(5),
    ]).then(([msgsRes, convsRes, cliRes, flowRes]) => {
      const msgs  = msgsRes.data  ?? []
      const convs = convsRes.data ?? []
      const fls   = flowRes.data  ?? []

      // direction tem vocabulário misto: frontend usa 'outbound'/'inbound';
      // servidor e Edge Function deployada usam 'sent'/'received'. Trata os dois.
      const isOut = d => d === 'outbound' || d === 'sent'
      const s = msgs.filter(m => isOut(m.direction)).length
      const r = msgs.length - s
      setSent(s); setRecv(r)
      setRate((s + r) > 0 ? Math.round((s / (s + r)) * 100) : 0)
      setConv(fls.reduce((acc, f) => acc + (f.conversions ?? 0), 0))
      setClients(cliRes.count ?? 0)

      const convMsgs = {}
      msgs.forEach(m => { (convMsgs[m.conversation_id] ??= []).push(m) })
      const times = []
      Object.values(convMsgs).forEach(ms => {
        ms.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        for (let i = 1; i < ms.length; i++) {
          if (isOut(ms[i].direction) && !isOut(ms[i - 1].direction)) {
            const diff = new Date(ms[i].created_at) - new Date(ms[i - 1].created_at)
            if (diff > 0 && diff < 3_600_000) times.push(diff)
          }
        }
      })
      setAvgTime(times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length / 1000) : null)

      const slots = Math.min(days, 7)
      const buckets = {}
      for (let i = slots - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86_400_000)
        const key = d.toLocaleDateString('pt-BR', { weekday: 'short' })
        buckets[key] = { date: key, sent: 0, recv: 0 }
      }
      msgs.forEach(m => {
        const key = new Date(m.created_at).toLocaleDateString('pt-BR', { weekday: 'short' })
        if (buckets[key]) isOut(m.direction) ? buckets[key].sent++ : buckets[key].recv++
      })
      setChart(Object.values(buckets))

      const chMap = {}
      convs.forEach(c => { const k = c.contact_channel || 'outros'; chMap[k] = (chMap[k] ?? 0) + 1 })
      const total = Math.max(1, Object.values(chMap).reduce((s, v) => s + v, 0))
      setChannels(Object.entries(chMap).map(([k, v]) => ({ label: CH[k]?.label ?? k, val: v, pct: Math.round(v / total * 100), color: CH[k]?.color ?? '#475569' })).sort((a, b) => b.val - a.val))

      const convCount = {}
      msgs.forEach(m => { convCount[m.conversation_id] = (convCount[m.conversation_id] ?? 0) + 1 })
      setTop(convs.map(c => ({ name: c.contact_name || 'Contato', msgs: convCount[c.id] ?? 0, last: relTime(c.last_message_at), color: CH[c.contact_channel]?.color ?? '#64748b' })).sort((a, b) => b.msgs - a.msgs).slice(0, 5))

      setFlows(fls.map(f => ({ name: f.name, active: f.status === 'active', runs: f.triggers ?? 0, rate: (f.triggers ?? 0) > 0 ? Math.round(((f.conversions ?? 0) / f.triggers) * 100) : 0 })))
    }).catch(console.error).finally(() => setLoading(false))
  }, [ownerUserId, period, isDemoMode])

  const [exporting, setExporting] = useState(false)

  const fmtT = s => s === null ? '—' : `${Math.floor(s / 60)}min ${s % 60}s`
  const KPIS = [
    { icon: Send,          label: 'Mensagens Enviadas',   val: sent.toLocaleString('pt-BR'),        color: 'bg-brand-orange/15 text-brand-orange' },
    { icon: Inbox,         label: 'Mensagens Recebidas',  val: recv.toLocaleString('pt-BR'),        color: 'bg-brand-blue/15 text-brand-blue'     },
    { icon: Users,         label: 'Contatos Ativos',      val: clients.toLocaleString('pt-BR'),     color: 'bg-purple-500/15 text-purple-400'     },
    { icon: MessageSquare, label: 'Taxa de Resposta',     val: `${rate}%`, isP: true,              color: 'bg-brand-green/15 text-brand-green'   },
    { icon: Target,        label: 'Conversões',           val: conversions.toLocaleString('pt-BR'), color: 'bg-yellow-500/15 text-yellow-400'     },
    { icon: Clock,         label: 'Tempo Médio de Resp.', val: fmtT(avgTime),                      color: 'bg-pink-500/15 text-pink-400'         },
  ]

  const handleExportPDF = () => {
    setExporting(true)
    logger.log(user?.id, 'export_pdf', { category: 'system', description: 'Exportou o relatório de Analytics (PDF)' })
    try {
      const periodLabel = PERIODS.find(p => p.key === period)?.label ?? period
      exportPremiumPDF({
        filename: 'relatorio-analytics',
        title: 'Relatório de Analytics',
        subtitle: `Período: ${periodLabel} · ${new Date().toLocaleDateString('pt-BR')}`,
        kpis: KPIS.map(k => ({ label: k.label, value: k.val })),
        tables: [
          { title: 'Mensagens por dia', columns: ['Dia', 'Enviadas', 'Recebidas'], rows: chartData.map(d => [d.date, d.sent, d.recv]) },
          { title: 'Canais de atendimento', columns: ['Canal', 'Conversas', '%'], rows: channels.map(c => [c.label, c.val, c.pct + '%']) },
          { title: 'Top conversas', columns: ['Contato', 'Mensagens', 'Última atividade'], rows: topConvs.map(c => [c.name, c.msgs, c.last]) },
          { title: 'Fluxos', columns: ['Fluxo', 'Status', 'Execuções', 'Conversão'], rows: flows.map(f => [f.name, f.active ? 'Ativo' : 'Inativo', f.runs, f.rate + '%']) },
        ],
      })
    } catch { alert('Erro ao exportar. Tente novamente.') }
    setTimeout(() => setExporting(false), 2000)
  }

  const empty = <p className="text-xs text-slate-500 text-center py-16">Sem dados neste período</p>

  return (
    <Layout title="Analytics" subtitle="Relatórios e métricas de desempenho">
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 size={28} className="text-brand-orange animate-spin" />
        </div>
      ) : (
        <div id="analytics-content" className="space-y-6 animate-fade-in">

          {isDemoMode && (
            <div className="px-4 py-2.5 rounded-xl text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30">
              Modo demo — os números abaixo são apenas exemplo. Crie uma conta para ver as métricas reais do seu atendimento.
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex gap-1 glass rounded-xl p-1">
              {PERIODS.map(p => (
                <button key={p.key} onClick={() => setPeriod(p.key)} className={clsx('px-4 py-1.5 rounded-lg text-xs font-semibold transition-all', period === p.key ? 'bg-brand-orange text-white' : 'text-slate-400 hover:text-white')}>
                  {p.label}
                </button>
              ))}
            </div>
            <button onClick={handleExportPDF} disabled={exporting} className="btn-secondary text-xs">{exporting ? 'Exportando...' : 'Exportar PDF'}</button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {KPIS.map(k => {
              const Icon = k.icon
              return (
                <div key={k.label} className="glass rounded-2xl p-5 hover:border-brand-orange/20 transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', k.color)}><Icon size={18} /></div>
                    <p className="text-xs text-slate-400">{k.label}</p>
                  </div>
                  <p className="text-2xl font-display font-bold text-white">{k.val}</p>
                  {k.isP && <div className="mt-3 h-1.5 bg-dark-500 rounded-full overflow-hidden"><div className="h-full bg-brand-green rounded-full" style={{ width: `${rate}%` }} /></div>}
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 glass rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display font-semibold text-white text-sm">Mensagens por dia</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Enviadas vs recebidas</p>
                </div>
                <div className="flex gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-orange inline-block" />Enviadas</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-blue inline-block" />Recebidas</span>
                </div>
              </div>
              {chartData.some(d => d.sent + d.recv > 0) ? <LineChart data={chartData} /> : empty}
            </div>
            <div className="lg:col-span-2 glass rounded-2xl p-5">
              <h3 className="font-display font-semibold text-white text-sm mb-4">Mensagens por canal</h3>
              {channels.length ? (
                <div className="space-y-3">
                  {channels.map(c => (
                    <div key={c.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-400">{c.label}</span>
                        <span className="text-xs font-semibold text-white">{c.val} <span className="text-slate-500">({c.pct}%)</span></span>
                      </div>
                      <div className="h-2 bg-dark-500 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${c.pct}%`, background: c.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : empty}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 glass rounded-2xl p-5">
              <h3 className="font-display font-semibold text-white text-sm mb-4">Conversas mais ativas</h3>
              {topConvs.length ? (
                <div className="overflow-x-auto"><table className="w-full min-w-[380px]">
                  <thead><tr className="border-b border-dark-400">
                    {['', 'Contato', 'Msgs', 'Última atividade'].map(h => (
                      <th key={h} className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider pb-3 px-2">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {topConvs.map((c, i) => (
                      <tr key={i} className={clsx('hover:bg-dark-500/30 transition-colors', i < topConvs.length - 1 && 'border-b border-dark-400/40')}>
                        <td className="py-3 px-2"><div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold" style={{ background: c.color + '22', color: c.color }}>{ini(c.name)}</div></td>
                        <td className="py-3 px-2 text-sm font-medium text-white">{c.name}</td>
                        <td className="py-3 px-2 text-sm text-slate-300">{c.msgs}</td>
                        <td className="py-3 px-2 text-xs text-slate-500">{c.last}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              ) : empty}
            </div>
            <div className="lg:col-span-2 glass rounded-2xl p-5">
              <h3 className="font-display font-semibold text-white text-sm mb-5">Performance dos Flows</h3>
              {flows.length ? (
                <div className="space-y-5">
                  {flows.map(f => (
                    <div key={f.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-white truncate mr-2">{f.name}</span>
                        <span className={clsx('badge text-[10px] flex-shrink-0', f.active ? 'bg-brand-green/15 text-brand-green' : 'bg-slate-500/15 text-slate-400')}>{f.active ? 'Ativo' : 'Pausado'}</span>
                      </div>
                      <p className="text-xs text-slate-500 mb-2">{f.runs.toLocaleString('pt-BR')} execuções</p>
                      <div className="h-1.5 bg-dark-500 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-orange rounded-full" style={{ width: `${f.rate}%` }} />
                      </div>
                      <p className="text-[10px] text-slate-600 mt-1">{f.rate}% taxa de conclusão</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-slate-500 text-center py-10">Nenhum flow criado</p>}
            </div>
          </div>

        </div>
      )}
    </Layout>
  )
}
