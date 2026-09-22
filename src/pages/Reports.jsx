import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, Users, DollarSign, TrendingUp, Clock, ArrowLeft, ChevronDown, ChevronUp, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { useStages } from '@hooks/useStages'
import { usePeriod } from '@hooks/usePeriod'
import { periodRange, brl, pct } from '@lib/metrics'
import { Layout } from '@components/Layout/Layout'
import { exportCSV, exportPremiumPDF } from '@utils/exportUtils'
import { SkeletonKPI, SkeletonTable } from '@components/ui/Skeleton'
import { EmptyState } from '@components/ui/EmptyState'

const C = { bg: 'var(--bg)', card: 'var(--card)', bd: 'var(--border)', tx: 'var(--ink-1)', mut: 'var(--ink-4)', pur: '#7C3AED', org: '#FF6B35' }
const PAL = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#EC4899', '#0891B2', '#8B5CF6', '#EF4444', '#FF6B35', '#14B8A6']
const ini = n => (n || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

const DEMO_SELLERS = [
  { name: 'Ana Paula', leads: 34, won: 12, lost: 4, pipeline: 48000, wonValue: 28500, convRate: 35.3 },
  { name: 'Carlos', leads: 28, won: 8, lost: 6, pipeline: 32000, wonValue: 19200, convRate: 28.6 },
  { name: 'Mariana', leads: 21, won: 9, lost: 2, pipeline: 25600, wonValue: 22400, convRate: 42.9 },
  { name: 'João Pedro', leads: 15, won: 3, lost: 5, pipeline: 18000, wonValue: 7500, convRate: 20 },
]

export const Reports = () => {
  const nav = useNavigate()
  const { ownerUserId, isDemoMode } = useAuth()
  const { stages } = useStages()
  const { period, setPeriod, options: periodOptions } = usePeriod()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState('wonValue')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    if (isDemoMode) { setLoading(false); return }
    if (!ownerUserId) return
    ;(async () => {
      setLoading(true)
      const { data } = await supabase.from('clients').select('*').eq('user_id', ownerUserId)
      setClients(data ?? [])
      setLoading(false)
    })()
  }, [ownerUserId, isDemoMode])

  const start = periodRange(period).start
  const wonKeys = new Set(stages.filter(s => s.kind === 'won').map(s => s.key))
  const lostKeys = new Set(stages.filter(s => s.kind === 'lost').map(s => s.key))

  const sellers = useMemo(() => {
    if (isDemoMode) return DEMO_SELLERS

    const inPeriod = clients.filter(c => new Date(c.created_at).getTime() >= start)
    const map = new Map()
    for (const c of inPeriod) {
      const key = c.assigned_to || 'Sem responsável'
      const cur = map.get(key) || { name: key, leads: 0, won: 0, lost: 0, pipeline: 0, wonValue: 0 }
      cur.leads++
      const val = Number(c.value) || 0
      if (wonKeys.has(c.stage)) { cur.won++; cur.wonValue += val }
      else if (lostKeys.has(c.stage)) { cur.lost++ }
      else { cur.pipeline += val }
      map.set(key, cur)
    }
    return [...map.values()].map(s => ({ ...s, convRate: s.leads > 0 ? (s.won / s.leads) * 100 : 0 }))
  }, [clients, isDemoMode, start, wonKeys, lostKeys])

  const toggleSort = k => {
    if (sortKey === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(k); setSortDir('desc') }
  }

  const sorted = useMemo(() => {
    const arr = [...sellers]
    arr.sort((a, b) => sortDir === 'desc' ? (b[sortKey] ?? 0) - (a[sortKey] ?? 0) : (a[sortKey] ?? 0) - (b[sortKey] ?? 0))
    return arr
  }, [sellers, sortKey, sortDir])

  const totals = useMemo(() => sellers.reduce((t, s) => ({
    leads: t.leads + s.leads, won: t.won + s.won, lost: t.lost + s.lost,
    pipeline: t.pipeline + s.pipeline, wonValue: t.wonValue + s.wonValue,
  }), { leads: 0, won: 0, lost: 0, pipeline: 0, wonValue: 0 }), [sellers])
  totals.convRate = totals.leads > 0 ? (totals.won / totals.leads) * 100 : 0

  const maxWon = Math.max(...sellers.map(s => s.wonValue), 1)
  const SortIcon = ({ k }) => sortKey !== k ? null : sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />

  const th = { padding: '8px 10px', fontSize: 11, color: C.mut, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }
  const td = { padding: '12px 10px', borderTop: `1px solid ${C.bd}`, textAlign: 'left', fontSize: 13 }

  return (
    <Layout title="Relatórios" subtitle="Desempenho por vendedor">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => exportCSV(sorted.map(r => ({ Vendedor: r.name, Leads: r.leads, Ganhos: r.won, Perdidos: r.lost, 'Taxa Conv.': pct(r.convRate), 'Receita Ganha': r.wonValue, Pipeline: r.pipeline })), 'relatorios_vendedores')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.bd}`, background: 'transparent', color: C.tx, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><Download size={13} /> CSV</button>
          <button onClick={() => exportPremiumPDF({ filename: 'Relatorio_Vendedores', title: 'Relatórios por Vendedor', subtitle: `Período: ${period}`, kpis: [{ label: 'Leads', value: totals.leads }, { label: 'Conversão', value: pct(totals.convRate) }, { label: 'Receita', value: brl(totals.wonValue) }], tables: [{ title: 'Desempenho por vendedor', columns: ['Vendedor', 'Leads', 'Ganhos', 'Perdidos', 'Conversão', 'Receita', 'Pipeline'], rows: sorted.map(r => [r.name, r.leads, r.won, r.lost, pct(r.convRate), brl(r.wonValue), brl(r.pipeline)]) }] })} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.bd}`, background: 'transparent', color: C.tx, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><Download size={13} /> PDF</button>
        </div>
        <div className="rf-seg" role="group" aria-label="Período">
          {periodOptions.map(o => <button key={o.key} aria-pressed={period === o.key} onClick={() => setPeriod(o.key)}>{o.label}</button>)}
        </div>
      </div>

      {/* KPIs resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          [Users, 'Leads totais', totals.leads.toLocaleString('pt-BR'), C.pur],
          [TrendingUp, 'Taxa de conversão', pct(totals.convRate), '#22C55E'],
          [DollarSign, 'Receita ganha', brl(totals.wonValue), C.org],
          [BarChart3, 'Pipeline aberto', brl(totals.pipeline), '#3B82F6'],
        ].map(([Ic, label, value, color]) => (
          <div key={label} style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: '16px 18px' }}>
            <Ic size={20} color={color} />
            <p style={{ margin: '8px 0 2px', fontSize: 12, color: C.mut }}>{label}</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <SkeletonKPI count={4} />
          <SkeletonTable rows={4} cols={6} />
        </div>
      ) : sellers.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum dado neste período" message="Atribua responsáveis aos leads para ver o desempenho por vendedor." />
      ) : (
        <>
          {/* Gráfico de barras horizontais — receita por vendedor */}
          <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 20, marginBottom: 24 }}>
            <p className="rf-section-title" style={{ marginBottom: 16 }}>Receita ganha por vendedor</p>
            {sorted.map((s, i) => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: PAL[i % PAL.length] + '22', color: PAL[i % PAL.length], display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{ini(s.name)}</div>
                <span style={{ width: 100, fontSize: 13, fontWeight: 600, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                <div style={{ flex: 1, height: 28, background: C.bd, borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ width: (s.wonValue / maxWon * 100) + '%', height: '100%', background: `linear-gradient(90deg, ${PAL[i % PAL.length]}, ${PAL[i % PAL.length]}88)`, borderRadius: 6, transition: 'width .4s' }} />
                  <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontWeight: 700, color: C.tx }}>{brl(s.wonValue)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Tabela detalhada */}
          <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 20 }}>
            <p className="rf-section-title" style={{ marginBottom: 16 }}>Detalhamento por vendedor</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead><tr>
                  <th style={th}>Vendedor</th>
                  {[['leads', 'Leads'], ['won', 'Ganhos'], ['lost', 'Perdidos'], ['convRate', 'Conversão'], ['wonValue', 'Receita'], ['pipeline', 'Pipeline']].map(([k, l]) => (
                    <th key={k} onClick={() => toggleSort(k)} style={{ ...th, display: 'table-cell' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>{l} <SortIcon k={k} /></span>
                    </th>
                  ))}
                </tr></thead>
                <tbody>
                  {sorted.map((s, i) => (
                    <tr key={s.name}>
                      <td style={{ ...td, fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: PAL[i % PAL.length] + '22', color: PAL[i % PAL.length], display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{ini(s.name)}</div>
                          {s.name}
                        </div>
                      </td>
                      <td style={td}>{s.leads}</td>
                      <td style={{ ...td, color: '#22C55E', fontWeight: 600 }}>{s.won}</td>
                      <td style={{ ...td, color: '#EF4444' }}>{s.lost}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{pct(s.convRate)}</td>
                      <td style={{ ...td, fontWeight: 700, color: C.pur }}>{brl(s.wonValue)}</td>
                      <td style={td}>{brl(s.pipeline)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr>
                  <td style={{ ...td, fontWeight: 800 }}>Total</td>
                  <td style={{ ...td, fontWeight: 800 }}>{totals.leads}</td>
                  <td style={{ ...td, fontWeight: 800, color: '#22C55E' }}>{totals.won}</td>
                  <td style={{ ...td, fontWeight: 800, color: '#EF4444' }}>{totals.lost}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{pct(totals.convRate)}</td>
                  <td style={{ ...td, fontWeight: 800, color: C.pur }}>{brl(totals.wonValue)}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{brl(totals.pipeline)}</td>
                </tr></tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </Layout>
  )
}
