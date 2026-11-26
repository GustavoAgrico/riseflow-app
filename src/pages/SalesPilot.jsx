// Piloto de Vendas — o agente de vendas automático (server/sales/pilot.js, /api/sales-pilot).
// Cada mensagem recebida vira ficha + nota de intenção; os leads quentes sobem para a fila
// e andam Contato → Proposta → Negociação → Fechamento até a venda.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bot, Zap, Timer, Target, ContactRound, TrendingUp, MessageCircle, Check, X, RefreshCw, Flame, Sparkles, ArrowRight,
  UserPlus, PenLine, Tags, MoveRight, Bell, MessagesSquare, Loader2, Trophy,
} from 'lucide-react'
import { Layout } from '@components/Layout/Layout'
import { CountUp, Segmented } from '@components/motion'
import { useUndoToast } from '@components/UndoToast'
import api from '@services/api'
import socket, { authenticateSocket } from '@services/socket'
import { useAuth } from '@context/AuthContext'

const F = "'DM Sans', sans-serif"
const C = { card: 'var(--card)', bd: 'var(--border)', tx: 'var(--ink-1)', mut: 'var(--ink-3)', org: '#FF6B35', pur: '#7C3AED', cyan: '#22D3EE', green: '#22C55E', red: '#EF4444', yellow: '#EAB308' }
const LEVEL = { alta: { label: 'Alta intenção', color: C.green }, media: { label: 'Interessado', color: C.yellow }, baixa: { label: 'Morno', color: '#94A3B8' } }
const STEPS = [['contacted', 'Contato'], ['proposal', 'Proposta'], ['negotiation', 'Negociação'], ['won', 'Fechamento']]
const ORDER = { new: 0, contacted: 1, proposal: 2, negotiation: 3, won: 4 }
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const ago = (t) => {
  if (!t) return ''
  const m = Math.round((Date.now() - new Date(t).getTime()) / 60000)
  if (m < 1) return 'agora'; if (m < 60) return `${m} min`; if (m < 1440) return `${Math.round(m / 60)} h`
  return `${Math.round(m / 1440)} d`
}
const fmtSecs = (s) => (s == null ? '—' : s < 60 ? `${Math.round(s)} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`)

const DEMO_SUMMARY = {
  settings: { auto_register: true, auto_update: true, auto_tag: true, auto_stage: true, notify: true, hot_threshold: 75 },
  response: { medianSeconds: 48, responded: 182, conversations: 200 },
  funnel: { conversations: 200, interested: 34, qualified: 12, won: 5 },
  fichas: { total: 34, linked: 34, pct: 100 },
  sales: { month: 18450, previous: 13370, changePct: 38 },
  automations: { registered: 41, moved: 9, waiting: 3 },
}
const minsAgo = (m) => new Date(Date.now() - m * 60000).toISOString()
const DEMO_OPPS = [
  { id: 'o120', contact_name: 'Prospect #120 · Marina Alves', contact_phone: '5511987650120', score: 96, level: 'alta', signals: ['quer comprar', 'pediu forma de pagamento'], product: 'Plano Pro', last_message: '¡Quiero comprar ahora! Me manda o pix?', last_inbound_at: minsAgo(15), status: 'new' },
  { id: 'o12', contact_name: 'Rafael Costa', contact_phone: '5521999990012', score: 92, level: 'alta', signals: ['perguntou preço', 'quer agendar'], product: 'Implantação', last_message: 'Vocês têm disponibilidade amanhã? Quanto fica a implantação?', last_inbound_at: minsAgo(42), status: 'contacted' },
  { id: 'o33', contact_name: 'Clínica Vida', contact_phone: '5511933330033', score: 78, level: 'alta', signals: ['pediu orçamento'], product: null, last_message: 'Pode me mandar um orçamento para 3 atendentes?', last_inbound_at: minsAgo(130), status: 'proposal' },
  { id: 'o48', contact_name: 'João Pedro', contact_phone: '5531988880048', score: 52, level: 'media', signals: ['perguntou preço'], product: null, last_message: 'Qual o valor do plano mensal?', last_inbound_at: minsAgo(300), status: 'new' },
]

function ScoreRing({ score, color, size = 58 }) {
  const r = (size - 7) / 2, c = 2 * Math.PI * r
  const [shown, setShown] = useState(0)
  useEffect(() => { const t = requestAnimationFrame(() => setShown(score)); return () => cancelAnimationFrame(t) }, [score])
  return (
    <svg width={size} height={size} role="img" aria-label={`Intenção ${score}%`} style={{ flexShrink: 0, filter: `drop-shadow(0 0 8px ${color}66)` }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={c}
        strokeDashoffset={c * (1 - shown / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)' }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="var(--ink-1)" fontSize="15" fontWeight="800" fontFamily={F}>{score}</text>
    </svg>
  )
}

function Tracker({ status, onStep, disabled }) {
  const at = ORDER[status] ?? 0
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {STEPS.map(([id, label], i) => {
        const done = at >= i + 1
        const color = done ? C.green : 'var(--border)'
        return (
          <React.Fragment key={id}>
            {i > 0 && <span aria-hidden="true" style={{ flex: 1, height: 3, background: done ? C.green : 'var(--border)', transition: 'background .4s ease', minWidth: 10 }} />}
            <button type="button" disabled={disabled} onClick={() => onStep(id)} title={label} aria-pressed={done}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer', padding: 0, fontFamily: F }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: done ? C.green : 'var(--bg)', border: `2px solid ${color}`, display: 'grid', placeItems: 'center', boxShadow: done ? `0 0 10px ${C.green}88` : 'none', transition: 'all .3s ease' }}>
                {done && <Check size={11} color="#04210f" strokeWidth={3.5} />}
              </span>
              <span style={{ fontSize: 10.5, color: done ? C.tx : C.mut, fontWeight: done ? 700 : 500 }}>{label}</span>
            </button>
          </React.Fragment>
        )
      })}
    </div>
  )
}

function OpportunityCard({ o, rank, onUpdate, onOpenChat }) {
  const lv = LEVEL[o.level] || LEVEL.baixa
  const won = o.status === 'won'
  const askWon = () => {
    const v = window.prompt(`Valor da venda para ${o.contact_name} (R$). Deixe em branco se não quiser informar:`, o.value || '')
    if (v === null) return
    onUpdate(o, { status: 'won', value: v === '' ? undefined : Number(String(v).replace(/\./g, '').replace(',', '.')) })
  }
  return (
    <article className="rf-lift" style={{
      position: 'relative', overflow: 'hidden', background: C.card, borderRadius: 18, padding: 16, fontFamily: F, color: C.tx,
      border: `1px solid ${o.level === 'alta' ? lv.color + '66' : C.bd}`,
      boxShadow: o.level === 'alta' ? `0 0 0 1px ${lv.color}22, 0 14px 40px -18px ${lv.color}88` : 'none',
    }}>
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse at 0% 0%, ${lv.color}1f, transparent 55%)` }} />
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', position: 'relative' }}>
        <ScoreRing score={o.score} color={lv.color} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: C.mut, fontVariantNumeric: 'tabular-nums' }}>#{rank}</span>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, color: lv.color, background: lv.color + '1a', border: `1px solid ${lv.color}55`, borderRadius: 20, padding: '2px 9px', textTransform: 'uppercase' }}>{lv.label}</span>
            {won && <span style={{ fontSize: 10.5, fontWeight: 800, color: '#04210f', background: C.green, borderRadius: 20, padding: '2px 9px' }}>VENDA FECHADA ✓</span>}
            <span style={{ marginLeft: 'auto', fontSize: 11.5, color: C.mut }}>{ago(o.last_inbound_at)}</span>
          </div>
          <p style={{ margin: '5px 0 0', fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.contact_name}</p>
          {o.product && <p style={{ margin: '1px 0 0', fontSize: 12, color: C.mut }}>Interesse: <b style={{ color: C.tx }}>{o.product}</b></p>}
        </div>
      </div>
      {o.last_message && (
        <blockquote style={{ position: 'relative', margin: '12px 0 0', padding: '9px 12px', borderRadius: 12, background: 'var(--bg)', border: `1px solid ${C.bd}`, fontSize: 13.5, lineHeight: 1.45, fontWeight: 600 }}>
          “{o.last_message}”
        </blockquote>
      )}
      {o.signals?.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 9, position: 'relative' }}>
          {o.signals.slice(0, 4).map(s => <span key={s} style={{ fontSize: 10.5, color: C.mut, border: `1px solid ${C.bd}`, borderRadius: 20, padding: '2px 8px' }}>{s}</span>)}
        </div>
      )}
      <div style={{ marginTop: 14, position: 'relative' }}>
        <Tracker status={o.status} disabled={won} onStep={(st) => (st === 'won' ? askWon() : onUpdate(o, { status: st }))} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', position: 'relative' }}>
        <button type="button" onClick={() => onOpenChat(o)} className="rf-press" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 34, padding: '0 12px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#FF9A2E,#FF6A1F)', color: '#1A0B02', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: F }}>
          <MessageCircle size={14} /> Responder
        </button>
        {!won && (
          <button type="button" onClick={askWon} className="rf-press" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 34, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.green}66`, background: C.green + '14', color: C.green, fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: F }}>
            <Trophy size={14} /> Venda fechada
          </button>
        )}
        {!won && (
          <button type="button" onClick={() => onUpdate(o, { status: 'dismissed' })} title="Tirar da fila" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 34, padding: '0 10px', borderRadius: 10, border: `1px solid ${C.bd}`, background: 'transparent', color: C.mut, fontSize: 12, cursor: 'pointer', fontFamily: F }}>
            <X size={13} /> Dispensar
          </button>
        )}
      </div>
    </article>
  )
}

const AUTOMATIONS = [
  ['auto_register', 'Cadastrar clientes', 'Cria a ficha na primeira mensagem', UserPlus],
  ['auto_update', 'Atualizar fichas', 'Nome e última mensagem sempre em dia', PenLine],
  ['auto_tag', 'Etiquetar leads', 'Quente / Interessado conforme a intenção', Tags],
  ['auto_stage', 'Mover etapa', 'Lead quente vai de Novo para Qualificado', MoveRight],
  ['notify', 'Avisar lead quente', 'Notificação na hora em que esquenta', Bell],
]

function Module({ icon: Icon, title, color, children, to }) {
  return (
    <div className="rf-lift" style={{ position: 'relative', background: C.card, border: `1px solid ${color}44`, borderRadius: 16, padding: 14, fontFamily: F, color: C.tx, overflow: 'hidden' }}>
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse at 100% 0%, ${color}22, transparent 60%)` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color, position: 'relative' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} /> <Icon size={13} /> {title}
        <span style={{ marginLeft: 'auto', fontSize: 9.5, color: C.green, border: `1px solid ${C.green}55`, borderRadius: 20, padding: '1px 7px' }}>AUTO</span>
      </div>
      <div style={{ position: 'relative', marginTop: 10 }}>{children}</div>
      {to && <Link to={to} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, fontSize: 12, fontWeight: 700, color, textDecoration: 'none' }}>Abrir <ArrowRight size={12} /></Link>}
    </div>
  )
}

export function SalesPilot() {
  const { isDemoMode } = useAuth()
  const navigate = useNavigate()
  const [summary, setSummary] = useState(null)
  const [opps, setOpps] = useState([])
  const [filter, setFilter] = useState('open')
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [flash, setFlash] = useState(null)
  const { toastEl, showToast } = useUndoToast()

  const load = useCallback(async () => {
    if (isDemoMode) {
      setSummary(DEMO_SUMMARY)
      setOpps(filter === 'open' ? DEMO_OPPS : filter === 'won' ? [] : [])
      setLoading(false); return
    }
    try {
      const [s, o] = await Promise.all([api.get('/sales-pilot/summary'), api.get('/sales-pilot/opportunities', { params: { status: filter } })])
      setSummary(s.data); setOpps(Array.isArray(o.data) ? o.data : []); setMissing(false)
    } catch (e) {
      if (e?.response?.data?.code === 'migration_missing') setMissing(true)
      else showToast('Não foi possível carregar o Piloto de Vendas.')
    }
    setLoading(false)
  }, [isDemoMode, filter, showToast])
  useEffect(() => { load() }, [load])

  // Tempo real: oportunidades novas/atualizadas entram na fila sem recarregar.
  useEffect(() => {
    if (isDemoMode) return
    authenticateSocket()
    const onOpp = ({ opportunity }) => {
      if (!opportunity) return
      setOpps(list => {
        const open = ['new', 'contacted', 'proposal', 'negotiation'].includes(opportunity.status)
        const fits = filter === 'all' || (filter === 'open' ? open : opportunity.status === filter)
        const rest = list.filter(x => x.id !== opportunity.id)
        return fits ? [...rest, opportunity].sort((a, b) => b.score - a.score) : rest
      })
    }
    const onHot = ({ opportunity }) => { if (opportunity) { setFlash(opportunity.id); setTimeout(() => setFlash(null), 2500); showToast(`Lead quente: ${opportunity.contact_name} (${opportunity.score}%)`) } }
    socket.on('sales_opportunity', onOpp)
    socket.on('sales_hot_lead', onHot)
    return () => { socket.off('sales_opportunity', onOpp); socket.off('sales_hot_lead', onHot) }
  }, [isDemoMode, filter, showToast])

  const update = async (o, patch) => {
    const before = o
    const optimistic = { ...o, ...patch }
    const keep = filter === 'all' || (filter === 'open' ? ['new', 'contacted', 'proposal', 'negotiation', 'won'].includes(optimistic.status) : optimistic.status === filter)
    setOpps(l => (keep ? l.map(x => (x.id === o.id ? optimistic : x)) : l.filter(x => x.id !== o.id)))
    const label = { won: 'Venda fechada! 🎉', dismissed: 'Tirado da fila.', contacted: 'Marcado como contatado.', proposal: 'Proposta enviada.', negotiation: 'Em negociação.' }[patch.status] || 'Atualizado.'
    if (isDemoMode) { showToast(`${label} (modo demo)`); return }
    try {
      const { data } = await api.patch(`/sales-pilot/opportunities/${o.id}`, patch)
      setOpps(l => l.map(x => (x.id === o.id ? data : x)))
      showToast(label, patch.status === 'dismissed' ? () => update({ ...optimistic }, { status: before.status }) : undefined)
      if (patch.status === 'won') api.get('/sales-pilot/summary').then(r => setSummary(r.data)).catch(() => {})
    } catch {
      setOpps(l => (l.some(x => x.id === o.id) ? l.map(x => (x.id === o.id ? before : x)) : [...l, before].sort((a, b) => b.score - a.score)))
      showToast('Não foi possível salvar. Tente de novo.')
    }
  }

  const toggle = async (key) => {
    if (!summary) return
    const next = { ...summary.settings, [key]: !summary.settings[key] }
    setSummary(s => ({ ...s, settings: next }))
    if (isDemoMode) return
    try { await api.put('/sales-pilot/settings', { [key]: next[key] }) }
    catch { setSummary(s => ({ ...s, settings: { ...next, [key]: !next[key] } })); showToast('Não foi possível salvar a automação.') }
  }
  const setThreshold = async (v) => {
    setSummary(s => ({ ...s, settings: { ...s.settings, hot_threshold: v } }))
    if (!isDemoMode) api.put('/sales-pilot/settings', { hot_threshold: v }).catch(() => showToast('Não foi possível salvar.'))
  }

  const scan = async () => {
    if (isDemoMode) { showToast('Modo demo: crie uma conta para analisar suas conversas.'); return }
    setScanning(true)
    try {
      const { data } = await api.post('/sales-pilot/scan', { days: 14 })
      showToast(`Li ${data.scanned} mensagens de ${data.conversations} conversas e achei ${data.found} oportunidade(s) nova(s).`)
      load()
    } catch (e) { showToast(e?.response?.data?.error || 'Não foi possível analisar agora.') }
    setScanning(false)
  }

  const openChat = (o) => navigate('/chat', { state: { contact: { phone: o.contact_phone, name: o.contact_name } } })

  const s = summary
  const funnel = s?.funnel
  const funnelRows = useMemo(() => funnel ? [
    ['Conversas', funnel.conversations, C.cyan], ['Interessados', funnel.interested, C.yellow],
    ['Qualificados', funnel.qualified, C.org], ['Vendas', funnel.won, C.green],
  ] : [], [funnel])
  const funnelMax = Math.max(1, ...funnelRows.map(r => r[1]))

  return (
    <Layout title="Piloto de Vendas" subtitle="Agente de vendas com IA: lê cada conversa, qualifica e organiza">
      {isDemoMode && (
        <div style={{ background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.27)', color: C.yellow, borderRadius: 14, padding: '12px 16px', fontSize: 13, marginBottom: 16, fontFamily: F }}>
          Modo demo — os números e leads abaixo são exemplo. Na sua conta, o piloto lê as mensagens que chegam no WhatsApp, Instagram, Facebook e Telegram.
        </div>
      )}

      {missing ? (
        <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 16, padding: 24, fontFamily: F, color: C.tx, maxWidth: 640 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Falta ativar o Piloto de Vendas</h3>
          <p style={{ margin: 0, fontSize: 13.5, color: C.mut, lineHeight: 1.6 }}>No Supabase, abra <b style={{ color: C.tx }}>SQL Editor → New query</b>, cole o conteúdo de <code>supabase/sales_pilot.sql</code> e clique em <b style={{ color: C.tx }}>Run</b>. Depois recarregue esta página.</p>
        </div>
      ) : loading || !s ? (
        <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 16, padding: 28, textAlign: 'center', color: C.mut, fontFamily: F }}>Carregando…</div>
      ) : (
        <>
          {/* Hero: o agente ao vivo */}
          <section style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, padding: '22px 22px 18px', marginBottom: 16, fontFamily: F, color: C.tx, border: '1px solid rgba(34,211,238,0.28)', background: 'radial-gradient(ellipse at 0% 0%, rgba(34,211,238,0.16), transparent 55%), radial-gradient(ellipse at 100% 100%, rgba(124,58,237,0.18), transparent 60%), var(--card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'radial-gradient(circle at 30% 30%, #67E8F9, #0891B2)', boxShadow: '0 0 24px rgba(34,211,238,0.55)' }}><Bot size={22} color="#04222b" /></span>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Agente de vendas IA</div>
                <div style={{ fontSize: 12.5, color: C.mut }}>Vendas no piloto automático — sem custo de IA por mensagem</div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: C.green, border: `1px solid ${C.green}55`, background: C.green + '12', borderRadius: 20, padding: '4px 10px' }}>
                <span className="rf-tip-badge" style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, boxShadow: `0 0 8px ${C.green}` }} /> AO VIVO
              </span>
              <button type="button" onClick={scan} disabled={scanning} className="rf-press" title="Ler as conversas dos últimos 14 dias e achar quem quer comprar"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 14px', borderRadius: 10, border: '1px solid rgba(34,211,238,0.5)', background: 'rgba(34,211,238,0.1)', color: C.cyan, fontWeight: 800, fontSize: 12.5, cursor: scanning ? 'wait' : 'pointer', fontFamily: F }}>
                {scanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Analisar conversas
              </button>
            </div>
            <div className="rf-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 16 }}>
              {[
                [Timer, 'Tempo de resposta', fmtSecs(s.response.medianSeconds), `${s.response.responded} de ${s.response.conversations} respondidas`],
                [Target, 'Leads qualificados', s.funnel.qualified, 'últimos 30 dias'],
                [ContactRound, 'Fichas completas', `${s.fichas.pct}%`, `${s.fichas.linked} de ${s.fichas.total} com ficha`],
                [Flame, 'Quentes esperando', s.automations.waiting, 'sem contato ainda'],
              ].map(([Icon, label, value, hint]) => (
                <div key={label} style={{ background: 'rgba(0,0,0,0.18)', border: `1px solid ${C.bd}`, borderRadius: 14, padding: '11px 13px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.mut }}><Icon size={13} color={C.cyan} /> {label}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}><CountUp value={typeof value === 'number' ? value : String(value)} /></div>
                  <div style={{ fontSize: 11, color: C.mut }}>{hint}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Funil de intenção: das conversas às vendas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))', gap: 14, marginBottom: 16 }}>
            <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 16, padding: 16, fontFamily: F, color: C.tx }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800 }}>Das conversas às vendas</h3>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: C.mut }}>Últimos 30 dias. Ninguém que quer comprar fica perdido no meio.</p>
              <div style={{ display: 'grid', gap: 9 }}>
                {funnelRows.map(([label, n, color], i) => (
                  <div key={label} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 44px', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</span>
                    <span style={{ height: 12, borderRadius: 99, background: 'var(--bg)', overflow: 'hidden' }}>
                      <span className="rf-bar-x" style={{ '--i': i, display: 'block', height: '100%', width: `${Math.max(n ? 3 : 0, (n / funnelMax) * 100)}%`, borderRadius: 99, background: `linear-gradient(90deg, ${color}88, ${color})`, boxShadow: `0 0 12px ${color}66` }} />
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 800, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}><CountUp value={n} /></span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rf-cards" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Module icon={MessagesSquare} title="Chatbot IA" color={C.cyan} to="/smart-attendant">
                <div style={{ fontSize: 13, lineHeight: 1.45 }}>Responde dúvidas e agenda sozinho.</div>
              </Module>
              <Module icon={Target} title="Qualificação" color={C.org}>
                <div style={{ fontSize: 22, fontWeight: 800 }}><CountUp value={opps[0]?.score || 0} /><span style={{ fontSize: 12, color: C.mut, fontWeight: 600 }}> maior nota</span></div>
                <div style={{ fontSize: 11.5, color: C.mut, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opps[0]?.contact_name || 'aguardando conversas'}</div>
              </Module>
              <Module icon={ContactRound} title="Ficha do cliente" color={C.pur} to="/clients">
                <div style={{ fontSize: 22, fontWeight: 800 }}><CountUp value={s.automations.registered} /></div>
                <div style={{ fontSize: 11.5, color: C.mut }}>fichas criadas no mês</div>
              </Module>
              <Module icon={TrendingUp} title="Vendas" color={C.green} to="/goals">
                <div style={{ fontSize: 22, fontWeight: 800, color: s.sales.changePct == null || s.sales.changePct >= 0 ? C.green : C.red }}>
                  {s.sales.changePct == null ? <CountUp value={brl(s.sales.month)} /> : <>{s.sales.changePct >= 0 ? '+' : ''}<CountUp value={s.sales.changePct} />%</>}
                </div>
                <div style={{ fontSize: 11.5, color: C.mut }}>{s.sales.changePct == null ? 'vendido no mês' : `${brl(s.sales.month)} no mês`}</div>
              </Module>
            </div>
          </div>

          {/* Fila de oportunidades + automações */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
            <section style={{ flex: '1 1 560px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap', fontFamily: F }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.tx, display: 'flex', alignItems: 'center', gap: 7 }}><Zap size={17} color={C.org} /> Oportunidades</h3>
                <Segmented label="Filtrar oportunidades" size="sm" accent={C.org} options={[['open', 'Abertas'], ['won', 'Ganhas'], ['lost', 'Perdidas'], ['dismissed', 'Dispensadas']]} value={filter} onChange={(v) => { setLoading(false); setFilter(v) }} />
              </div>
              {opps.length === 0 ? (
                <div style={{ background: C.card, border: `1px dashed ${C.bd}`, borderRadius: 16, padding: 30, textAlign: 'center', fontFamily: F }}>
                  <Sparkles size={26} color={C.cyan} />
                  <p style={{ margin: '10px 0 4px', fontSize: 15, fontWeight: 800, color: C.tx }}>{filter === 'open' ? 'Nenhuma oportunidade aberta' : 'Nada por aqui'}</p>
                  <p style={{ margin: '0 0 14px', fontSize: 13, color: C.mut }}>{filter === 'open' ? 'Assim que alguém demonstrar interesse em comprar, aparece aqui com a nota de intenção.' : 'As oportunidades mudam de lista conforme você avança no cartão.'}</p>
                  {filter === 'open' && <button type="button" onClick={scan} disabled={scanning} className="rf-press" style={{ minHeight: 36, padding: '0 14px', borderRadius: 10, border: 'none', background: C.pur, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: F }}>Analisar conversas dos últimos 14 dias</button>}
                </div>
              ) : (
                <div className="rf-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,300px),1fr))', gap: 12 }}>
                  {opps.map((o, i) => (
                    <div key={o.id} className={flash === o.id ? 'rf-landed' : undefined} style={{ borderRadius: 18 }}>
                      <OpportunityCard o={o} rank={i + 1} onUpdate={update} onOpenChat={openChat} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <aside style={{ flex: '1 1 300px', maxWidth: '100%', background: C.card, border: `1px solid ${C.bd}`, borderRadius: 18, padding: 16, fontFamily: F, color: C.tx }}>
              <h3 style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 800 }}>Automações</h3>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: C.mut }}>O que o piloto faz sozinho em cada mensagem.</p>
              <div style={{ display: 'grid', gap: 8 }}>
                {AUTOMATIONS.map(([key, label, desc, Icon]) => {
                  const on = !!s.settings[key]
                  return (
                    <button key={key} type="button" role="switch" aria-checked={on} onClick={() => toggle(key)} className="rf-press"
                      style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '10px 11px', borderRadius: 12, cursor: 'pointer', fontFamily: F, color: C.tx, background: on ? 'rgba(34,197,94,0.07)' : 'var(--bg)', border: `1px solid ${on ? C.green + '55' : C.bd}` }}>
                      <span style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: on ? C.green : 'transparent', border: `2px solid ${on ? C.green : 'var(--ink-3)'}`, transition: 'all .25s ease' }}>
                        {on && <Check size={13} color="#04210f" strokeWidth={3.5} />}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}><Icon size={13} color={C.mut} /> {label}</span>
                        <span style={{ display: 'block', fontSize: 11.5, color: C.mut }}>{desc}</span>
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: on ? C.green : C.red, letterSpacing: 0.3 }}>{on ? 'Automático' : 'Manual'}</span>
                    </button>
                  )
                })}
                <Link to="/smart-attendant" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 11px', borderRadius: 12, border: `1px dashed ${C.bd}`, color: C.tx, textDecoration: 'none' }}>
                  <MessagesSquare size={16} color={C.cyan} />
                  <span style={{ flex: 1 }}><span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>Responder mensagens</span><span style={{ fontSize: 11.5, color: C.mut }}>Configure o atendente na IA Central</span></span>
                  <ArrowRight size={14} color={C.mut} />
                </Link>
              </div>
              <div style={{ marginTop: 16 }}>
                <label htmlFor="hot" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 700 }}>
                  <span>Lead quente a partir de</span><span style={{ color: C.org }}>{s.settings.hot_threshold}%</span>
                </label>
                <input id="hot" type="range" min="50" max="95" step="5" value={s.settings.hot_threshold}
                  onChange={(e) => setSummary(x => ({ ...x, settings: { ...x.settings, hot_threshold: Number(e.target.value) } }))}
                  onMouseUp={(e) => setThreshold(Number(e.currentTarget.value))} onTouchEnd={(e) => setThreshold(Number(e.currentTarget.value))} onKeyUp={(e) => setThreshold(Number(e.currentTarget.value))}
                  style={{ width: '100%', accentColor: C.org, marginTop: 6 }} />
                <p style={{ margin: '4px 0 0', fontSize: 11.5, color: C.mut }}>Mais alto = menos avisos, só quem está pronto para comprar.</p>
              </div>
            </aside>
          </div>
        </>
      )}
      {toastEl}
    </Layout>
  )
}

export default SalesPilot
