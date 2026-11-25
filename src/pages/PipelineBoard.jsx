// Painel ao vivo do pipeline (modo apresentação / "parede").
// Abre em outra aba a partir do CRM. É SÓ LEITURA e se atualiza em tempo real
// (realtime do Supabase em clients + refetch periódico de segurança), pensado
// para deixar numa TV/segundo monitor. Escopo por ownerUserId → o time inteiro
// vê o mesmo pipeline (ver AuthContext / RLS de equipe).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Filter, PieChart, TrendingUp, Target, Wallet, Percent, Users, HeartPulse, Radio } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { useStages } from '@hooks/useStages'
import { computeSalesMetrics, stageOf, brl } from '@lib/metrics'
import { leadsPerDay, stageReach, pipelineHealth, ageTone, diffPipeline } from '@lib/pipelineStats'
import { CountUp } from '@components/motion'
import { Panel, FunnelBars, Donut, AreaTrend, Sparkline, HealthList, LiveFeed, EmptyColumn } from '@components/Pipeline/Charts'

const C = { bg: 'var(--bg)', panel: 'var(--panel)', card: 'var(--card)', bd: 'var(--border)', tx: 'var(--ink-1)', mut: 'var(--ink-3)', pur: '#7C3AED' }
const F = "'DM Sans', system-ui, sans-serif"
const PER_COLUMN = 30

const ini = (n = '') => n.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString()

const DEMO = [
  { id: 'd1', name: 'Ana Lima', company: 'TechInova', value: 8500, stage: 'lead', tags: ['VIP'], created_at: daysAgo(0) },
  { id: 'd2', name: 'Bruno Martins', company: 'LogFast', value: 3200, stage: 'qual', tags: ['Interessado'], created_at: daysAgo(2) },
  { id: 'd3', name: 'Carla Souza', company: 'BestPay', value: 15000, stage: 'prop', tags: ['Hot'], created_at: daysAgo(4) },
  { id: 'd4', name: 'Diego Costa', company: 'MktPro', value: 2500, stage: 'neg', tags: [], created_at: daysAgo(6) },
  { id: 'd5', name: 'Elena Rocha', company: 'StorePrime', value: 6800, stage: 'closed', tags: ['Pago'], created_at: daysAgo(9) },
  { id: 'd6', name: 'Gia Fernandes', company: 'CriaMais', value: 4500, stage: 'lead', tags: ['Hot'], created_at: daysAgo(1) },
  { id: 'd7', name: 'Hugo Alves', company: 'ConstruMax', value: 9900, stage: 'qual', tags: [], created_at: daysAgo(3) },
  { id: 'd8', name: 'Felipe Santos', company: 'AgTech', value: 1200, stage: 'lost', tags: ['Frio'], created_at: daysAgo(12) },
]

const Card = ({ c, color, flash, index }) => {
  const age = ageTone(c.created_at)
  return (
    <div className={`rf-crm-card${flash ? ' rf-landed' : ''}`} style={{
      '--i': Math.min(index, 10), '--st': color + '88', position: 'relative', overflow: 'hidden',
      background: `linear-gradient(160deg, ${color}14, transparent 55%), var(--card)`, border: `1px solid ${C.bd}`, borderRadius: 14,
      padding: '12px 14px 12px 16px', marginBottom: 10,
    }}>
      <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 3, background: color, boxShadow: `0 0 10px ${color}` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: 12, background: `linear-gradient(135deg, ${color}, ${color}66)`, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0, boxShadow: `0 6px 16px ${color}44` }}>{ini(c.name) || '?'}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || 'Sem nome'}</p>
          <p style={{ margin: 0, fontSize: 12, color: C.mut, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.company || '—'}</p>
        </div>
        {age && <span title={`Criado há ${age.days} dia(s)`} style={{ fontSize: 10.5, fontWeight: 700, color: age.color, background: age.color + '18', border: `1px solid ${age.color}44`, borderRadius: 20, padding: '1px 7px', flexShrink: 0 }}>{age.label}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: Number(c.value) > 0 ? '#34D399' : C.mut, fontVariantNumeric: 'tabular-nums' }}>{Number(c.value) > 0 ? brl(c.value) : 'sem valor'}</span>
        {c.tags?.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {c.tags.slice(0, 2).map(t => <span key={t} style={{ fontSize: 10, background: color + '18', color, borderRadius: 5, padding: '2px 7px', fontWeight: 700 }}>{t}</span>)}
          </div>
        )}
      </div>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, hint, color, spark }) {
  return (
    <div className="rf-lift" style={{ position: 'relative', overflow: 'hidden', background: C.card, border: `1px solid ${color}44`, borderRadius: 16, padding: '14px 16px', minWidth: 0 }}>
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse at 0% 0%, ${color}26, transparent 60%)` }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.mut }}>
        <span style={{ width: 28, height: 28, borderRadius: 9, display: 'grid', placeItems: 'center', background: color + '22', boxShadow: `0 0 14px ${color}44` }}><Icon size={15} color={color} /></span>
        {label}
        {spark && <span className="rf-hide-sm" style={{ marginLeft: 'auto' }}><Sparkline values={spark} color={color} /></span>}
      </div>
      <div style={{ position: 'relative', fontSize: 'clamp(20px, 5.5vw, 30px)', fontWeight: 800, letterSpacing: '-.03em', marginTop: 8, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><CountUp value={value} /></div>
      <div style={{ position: 'relative', fontSize: 12, color: C.mut, marginTop: 2 }}>{hint}</div>
    </div>
  )
}

export const PipelineBoard = () => {
  const { ownerUserId, isDemoMode, loading: authLoading } = useAuth()
  const { stages } = useStages()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [pulse, setPulse] = useState(false)
  const [clock, setClock] = useState(() => new Date())
  const [feed, setFeed] = useState([])
  const [flash, setFlash] = useState(() => new Set())
  const prevRows = useRef(null)
  const stagesRef = useRef(stages)
  stagesRef.current = stages

  const apply = useCallback((list) => {
    const events = diffPipeline(prevRows.current, list, stagesRef.current).map(e => ({ ...e, at: Date.now() }))
    prevRows.current = list
    setRows(list)
    setUpdatedAt(new Date())
    setPulse(true); setTimeout(() => setPulse(false), 900)
    if (events.length) {
      setFeed(f => [...events.reverse(), ...f].slice(0, 8))
      const ids = new Set(events.map(e => e.dealId))
      setFlash(ids); setTimeout(() => setFlash(new Set()), 2600)
    }
  }, [])

  const load = useCallback(async () => {
    if (isDemoMode) { apply(prevRows.current || DEMO); setLoading(false); return }
    if (!ownerUserId) return
    const { data, error } = await supabase
      .from('clients')
      .select('id,name,company,value,stage,tags,created_at,phone')
      .eq('user_id', ownerUserId)
    if (!error) apply((data || []).map(r => ({ ...r, value: Number(r.value) || 0, stage: r.stage || 'lead', tags: r.tags || [] })))
    setLoading(false)
  }, [ownerUserId, isDemoMode, apply])

  // Carga inicial + realtime + refetch periódico (rede de segurança)
  useEffect(() => {
    if (authLoading) return
    load()
    if (isDemoMode || !ownerUserId) return
    let deb
    const bump = () => { clearTimeout(deb); deb = setTimeout(load, 600) }
    const ch = supabase.channel('crm_board_' + ownerUserId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `user_id=eq.${ownerUserId}` }, () => bump())
      .subscribe()
    const iv = setInterval(load, 25000)
    return () => { clearTimeout(deb); clearInterval(iv); try { supabase.removeChannel(ch) } catch {} }
  }, [authLoading, ownerUserId, isDemoMode, load])

  // Demo: simula o "ao vivo" movendo um negócio de vez em quando.
  useEffect(() => {
    if (!isDemoMode) return
    const order = ['lead', 'qual', 'prop', 'neg', 'closed']
    const iv = setInterval(() => {
      const list = prevRows.current || DEMO
      const open = list.filter(r => order.indexOf(r.stage) >= 0 && r.stage !== 'closed')
      if (!open.length) { apply(DEMO); return } // tudo fechado: recomeça o exemplo
      const pick = open[Math.floor(Math.random() * open.length)]
      apply(list.map(r => (r.id === pick.id ? { ...r, stage: order[order.indexOf(r.stage) + 1] } : r)))
    }, 7000)
    return () => clearInterval(iv)
  }, [isDemoMode, apply])

  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t) }, [])

  // Indicadores da fonte única (src/lib/metrics) — mesmas regras do CRM/Funil/Dashboard.
  const m = computeSalesMetrics(rows, stages)
  const byStage = new Map(m.byStage.map(s => [s.key, s]))
  const trend = useMemo(() => leadsPerDay(rows, 14), [rows])
  const reach = useMemo(() => stageReach(rows, stages), [rows, stages])
  const health = useMemo(() => pipelineHealth(rows, stages), [rows, stages])
  const donut = m.byStage.map(s => ({ label: s.label, value: s.count, color: s.color }))
  const hhmmss = clock.toLocaleTimeString('pt-BR')
  const spark = trend.map(t => t.count)

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.tx, fontFamily: F, display: 'flex', flexDirection: 'column', position: 'relative', isolation: 'isolate' }}>
      <div className="rf-ambient" aria-hidden="true" />
      {/* Cabeçalho */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px clamp(12px, 3vw, 24px)', borderBottom: `1px solid ${C.bd}`, background: 'color-mix(in srgb, var(--panel) 85%, transparent)', backdropFilter: 'blur(10px)', flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(135deg,#FF6B35,#E55100)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 900, fontSize: 14, boxShadow: '0 0 24px rgba(255,107,53,.45)' }}>RF</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-.3px', display: 'flex', alignItems: 'center', gap: 8 }}>Pipeline ao vivo <Radio size={16} color="#22C55E" /></h1>
            <p style={{ margin: 0, fontSize: 12, color: C.mut }}>{m.total} negócios · {brl(m.pipeline)} em aberto</p>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.mut }}>
            <span className="rf-live-dot" style={{ width: 9, height: 9, borderRadius: '50%', background: '#22C55E', '--c': pulse ? '#22C55E' : '#22C55E88' }} />
            {isDemoMode ? 'demo' : 'ao vivo'} · atualizado {updatedAt ? updatedAt.toLocaleTimeString('pt-BR') : '—'}
          </span>
          <span style={{ fontSize: 'clamp(18px, 5vw, 26px)', fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '.5px', textShadow: '0 0 18px rgba(255,255,255,.15)' }}>{hhmmss}</span>
        </div>
      </header>

      {loading ? (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: C.mut }}>Carregando pipeline…</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="rf-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,150px),1fr))', gap: 'clamp(8px, 2vw, 14px)', padding: 'clamp(12px, 3vw, 18px) clamp(12px, 3vw, 20px) 0' }}>
            <Kpi icon={Users} label="Negócios abertos" value={m.open} hint={`${health.newToday} entraram hoje`} color="#7C3AED" spark={spark} />
            <Kpi icon={Wallet} label="Pipeline em aberto" value={brl(m.pipeline)} hint={health.noValue ? `${health.noValue} sem valor definido` : 'valor somado das etapas abertas'} color="#22D3EE" />
            <Kpi icon={Target} label="Previsão ponderada" value={brl(m.weightedForecast)} hint="valor × chance de cada etapa" color="#22C55E" />
            <Kpi icon={Percent} label="Conversão" value={`${Math.round(m.convRate)}%`} hint={`${m.won} ganhos · ${m.lost} perdidos`} color="#FF6B35" />
          </div>

          {/* Gráficos */}
          <div className="rf-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap: 14, padding: '14px clamp(12px, 3vw, 20px) 0' }}>
            <Panel title="Funil de alcance" icon={Filter} accent="#7C3AED"><FunnelBars steps={reach.steps} compact /></Panel>
            <Panel title="Onde estão os negócios" icon={PieChart} accent="#22D3EE"><Donut data={donut} size={118} sub="negócios" /></Panel>
            <Panel title="Entrada de leads · 14 dias" icon={TrendingUp} accent="#FF6B35" right={<span style={{ fontSize: 12, fontWeight: 800 }}><CountUp value={spark.reduce((a, b) => a + b, 0)} /></span>}>
              <AreaTrend points={trend} id="board" />
            </Panel>
            <Panel title="Movimentações" icon={Activity} accent="#22C55E" right={<span style={{ fontSize: 10.5, color: C.mut }}>tempo real</span>}>
              <div style={{ maxHeight: 190, overflow: 'hidden' }}>
                <LiveFeed events={feed} empty={health.stale || health.noValue ? '' : 'As movimentações aparecem aqui em tempo real.'} />
                {!feed.length && (health.stale || health.noValue) ? <HealthList health={health} /> : null}
              </div>
            </Panel>
          </div>

          {/* Colunas */}
          <div style={{ flex: 1, display: 'flex', gap: 16, padding: 'clamp(12px, 3vw, 20px)', overflowX: 'auto', alignItems: 'stretch', scrollSnapType: 'x proximity' }}>
            {stages.map((stage, si) => {
              const col = byStage.get(stage.key)
              const cards = rows.filter(r => stageOf(r, stages) === stage.key)
                .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0) || String(b.created_at || '').localeCompare(String(a.created_at || '')))
              const share = m.total ? (col?.count ?? 0) / m.total : 0
              return (
                <section key={stage.key} className="rf-feed-in" style={{ animationDelay: `${si * 70}ms`, minWidth: 'min(300px, 86vw)', width: 'min(300px, 86vw)', scrollSnapAlign: 'start', flexShrink: 0, display: 'flex', flexDirection: 'column', background: `linear-gradient(180deg, ${stage.color}14, transparent 140px), var(--panel)`, border: `1px solid ${C.bd}`, borderRadius: 18, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${C.bd}`, borderTop: `3px solid ${stage.color}`, boxShadow: `inset 0 10px 24px -18px ${stage.color}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: stage.color, boxShadow: `0 0 10px ${stage.color}` }} />
                      <span style={{ fontSize: 15, fontWeight: 800, flex: 1 }}>{stage.label}</span>
                      <span key={col?.count} className="rf-check-pop" style={{ fontSize: 12, fontWeight: 800, color: stage.color, background: stage.color + '1c', borderRadius: 20, padding: '2px 10px', display: 'inline-block' }}>{col?.count ?? 0}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.mut, fontVariantNumeric: 'tabular-nums' }}><CountUp value={brl(col?.value ?? 0)} /></span>
                      <span style={{ fontSize: 11, color: C.mut }}>{Math.round(share * 100)}% · chance {stage.probability ?? 0}%</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 99, background: 'var(--bg)', marginTop: 8, overflow: 'hidden' }}>
                      <div className="rf-bar-x" style={{ '--i': si, height: '100%', width: `${Math.max(share ? 2 : 0, share * 100)}%`, background: stage.color, borderRadius: 99, boxShadow: `0 0 8px ${stage.color}` }} />
                    </div>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: 12, minHeight: 120 }}>
                    {cards.length === 0
                      ? <EmptyColumn color={stage.color} label="Nenhum negócio aqui ainda" />
                      : cards.slice(0, PER_COLUMN).map((c, i) => <Card key={c.id} c={c} color={stage.color} flash={flash.has(c.id)} index={i} />)}
                    {cards.length > PER_COLUMN && (
                      <p style={{ textAlign: 'center', fontSize: 12, color: C.mut, margin: '6px 0 0' }}>+ {cards.length - PER_COLUMN} negócios nesta etapa</p>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
          {/* acessível: resumo de saúde para leitores de tela */}
          <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            <HeartPulse aria-hidden="true" /> {health.stale} parados, {health.noValue} sem valor.
          </span>
        </>
      )}
    </div>
  )
}

export default PipelineBoard
