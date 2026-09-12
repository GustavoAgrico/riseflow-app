// Painel ao vivo do pipeline (modo apresentação / "parede").
// Abre em outra aba a partir do CRM. É SÓ LEITURA e se atualiza em tempo real
// (realtime do Supabase em clients + refetch periódico de segurança), pensado
// para deixar numa TV/segundo monitor. Escopo por ownerUserId → o time inteiro
// vê o mesmo pipeline (ver AuthContext / RLS de equipe).
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { useStages } from '@hooks/useStages'
import { computeSalesMetrics, stageOf, brl } from '@lib/metrics'

const C = { bg: 'var(--bg)', panel: 'var(--panel)', card: 'var(--card)', bd: 'var(--border)', tx: 'var(--ink-1)', mut: 'var(--ink-3)', pur: '#7C3AED' }
const F = "'DM Sans', system-ui, sans-serif"

const ini = (n = '') => n.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()

const DEMO = [
  { id: 'd1', name: 'Ana Lima', company: 'TechInova', value: 8500, stage: 'lead', tags: ['VIP'] },
  { id: 'd2', name: 'Bruno Martins', company: 'LogFast', value: 3200, stage: 'qual', tags: ['Interessado'] },
  { id: 'd3', name: 'Carla Souza', company: 'BestPay', value: 15000, stage: 'prop', tags: ['Hot'] },
  { id: 'd4', name: 'Diego Costa', company: 'MktPro', value: 2500, stage: 'neg', tags: [] },
  { id: 'd5', name: 'Elena Rocha', company: 'StorePrime', value: 6800, stage: 'closed', tags: ['Pago'] },
]

const Card = ({ c, color, flash }) => (
  <div style={{
    background: C.card, border: `1px solid ${flash ? color : C.bd}`, borderRadius: 12, padding: '12px 14px',
    marginBottom: 10, boxShadow: flash ? `0 0 0 2px ${color}55` : 'none', transition: 'box-shadow .6s, border-color .6s',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <div style={{ width: 34, height: 34, borderRadius: '50%', background: color + '22', color, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{ini(c.name)}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || 'Sem nome'}</p>
        <p style={{ margin: 0, fontSize: 12, color: C.mut, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.company || '—'}</p>
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 15, fontWeight: 800, color: '#34D399', fontVariantNumeric: 'tabular-nums' }}>{brl(c.value)}</span>
      {c.tags?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {c.tags.slice(0, 2).map(t => <span key={t} style={{ fontSize: 10, background: color + '18', color, borderRadius: 5, padding: '2px 7px', fontWeight: 700 }}>{t}</span>)}
        </div>
      )}
    </div>
  </div>
)

export const PipelineBoard = () => {
  const { ownerUserId, isDemoMode, loading: authLoading } = useAuth()
  const { stages } = useStages()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [pulse, setPulse] = useState(false)
  const [clock, setClock] = useState(() => new Date())
  const flashIds = useRef(new Set())

  const load = useCallback(async () => {
    if (isDemoMode) { setRows(DEMO); setLoading(false); setUpdatedAt(new Date()); return }
    if (!ownerUserId) return
    const { data, error } = await supabase
      .from('clients')
      .select('id,name,company,value,stage,tags,created_at')
      .eq('user_id', ownerUserId)
    if (!error) {
      setRows((data || []).map(r => ({ ...r, value: Number(r.value) || 0, stage: r.stage || 'lead', tags: r.tags || [] })))
      setUpdatedAt(new Date())
      setPulse(true); setTimeout(() => setPulse(false), 900)
    }
    setLoading(false)
  }, [ownerUserId, isDemoMode])

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

  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t) }, [])

  // Indicadores da fonte única (src/lib/metrics) — mesmas regras do CRM/Funil/Dashboard.
  const m = computeSalesMetrics(rows, stages)
  const byStage = new Map(m.byStage.map(s => [s.key, s]))
  const hhmmss = clock.toLocaleTimeString('pt-BR')

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.tx, fontFamily: F, display: 'flex', flexDirection: 'column' }}>
      {/* Cabeçalho */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 24px', borderBottom: `1px solid ${C.bd}`, background: C.panel, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#FF6B35,#E55100)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 900, fontSize: 13 }}>RF</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-.3px' }}>Pipeline ao vivo</h1>
            <p style={{ margin: 0, fontSize: 12, color: C.mut }}>{m.total} negócios · {brl(m.pipeline)} em aberto</p>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: C.mut }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#22C55E', boxShadow: pulse ? '0 0 0 6px #22C55E33' : '0 0 0 0 #22C55E00', transition: 'box-shadow .5s' }} />
            {isDemoMode ? 'demo' : 'ao vivo'} · atualizado {updatedAt ? updatedAt.toLocaleTimeString('pt-BR') : '—'}
          </span>
          <span style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '.5px' }}>{hhmmss}</span>
        </div>
      </header>

      {/* Colunas */}
      {loading ? (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: C.mut }}>Carregando pipeline…</div>
      ) : (
        <div style={{ flex: 1, display: 'flex', gap: 16, padding: 20, overflowX: 'auto', alignItems: 'stretch' }}>
          {stages.map(stage => {
            const col = byStage.get(stage.key)
            const cards = rows.filter(r => stageOf(r, stages) === stage.key)
            return (
              <section key={stage.key} style={{ minWidth: 300, width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', background: C.panel, border: `1px solid ${C.bd}`, borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.bd}`, borderTop: `3px solid ${stage.color}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, flex: 1 }}>{stage.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: stage.color, background: stage.color + '1c', borderRadius: 20, padding: '2px 10px' }}>{col?.count ?? 0}</span>
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 700, color: C.mut, fontVariantNumeric: 'tabular-nums' }}>{brl(col?.value ?? 0)}</p>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 12, minHeight: 120 }}>
                  {cards.length === 0
                    ? <p style={{ color: C.mut, fontSize: 13, textAlign: 'center', marginTop: 20, opacity: .6 }}>vazio</p>
                    : cards.map(c => <Card key={c.id} c={c} color={stage.color} flash={flashIds.current.has(c.id)} />)}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default PipelineBoard
