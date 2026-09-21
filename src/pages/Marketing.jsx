import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { useStages } from '@hooks/useStages'
import { usePeriod } from '@hooks/usePeriod'
import { periodRange, brl } from '@lib/metrics'
import { Layout } from '@components/Layout/Layout'
import { DollarSign, TrendingUp, Target, Users, Megaphone, ArrowUpRight, ArrowDownRight, Download } from 'lucide-react'
import { exportCSV, exportPremiumPDF } from '@utils/exportUtils'

const C = { bg: 'var(--bg)', card: 'var(--card)', bd: 'var(--border)', tx: 'var(--ink-1)', mut: 'var(--ink-4)', pur: '#7C3AED', org: '#FF6B35' }

const DEMO = {
  campaigns: [
    { id: 1, name: 'Google Ads — Maio', channel: 'google', spend: 3200, leads: 48, won: 12, revenue: 14400 },
    { id: 2, name: 'Meta Ads — Stories', channel: 'meta', spend: 1800, leads: 32, won: 6, revenue: 7200 },
    { id: 3, name: 'WhatsApp Broadcast', channel: 'whatsapp', spend: 0, leads: 85, won: 22, revenue: 11000 },
    { id: 4, name: 'Indicações', channel: 'organic', spend: 0, leads: 24, won: 9, revenue: 10800 },
  ],
  totals: { spend: 5000, leads: 189, won: 49, revenue: 43400 },
}

const KPI = ({ icon: Ic, label, value, sub, color }) => (
  <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: '16px 18px', flex: 1, minWidth: 160 }}>
    <Ic size={20} color={color} />
    <p style={{ margin: '8px 0 2px', fontSize: 12, color: C.mut }}>{label}</p>
    <p style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{value}</p>
    {sub && <p style={{ margin: '4px 0 0', fontSize: 11, color: C.mut }}>{sub}</p>}
  </div>
)

export const Marketing = () => {
  const { ownerUserId, isDemoMode } = useAuth()
  const { stages } = useStages()
  const { period, setPeriod, options: periodOptions } = usePeriod()
  const [campaigns, setCampaigns] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [spendMap, setSpendMap] = useState({})

  useEffect(() => {
    if (isDemoMode) { setLoading(false); return }
    if (!ownerUserId) return
    ;(async () => {
      setLoading(true)
      const [{ data: camps }, { data: cls }] = await Promise.all([
        supabase.from('campaigns').select('id, name, channel, status, sent, created_at').eq('user_id', ownerUserId).order('created_at', { ascending: false }),
        supabase.from('clients').select('id, stage, value, source, assigned_to, created_at').eq('user_id', ownerUserId),
      ])
      setCampaigns(camps ?? [])
      setClients(cls ?? [])
      setLoading(false)
    })()
  }, [ownerUserId, isDemoMode])

  const start = periodRange(period).start
  const wonKeys = new Set(stages.filter(s => s.kind === 'won').map(s => s.key))

  const metrics = useMemo(() => {
    if (isDemoMode) {
      const t = DEMO.totals
      return {
        rows: DEMO.campaigns.map(c => ({
          ...c,
          cpl: c.leads > 0 && c.spend > 0 ? c.spend / c.leads : 0,
          cac: c.won > 0 && c.spend > 0 ? c.spend / c.won : 0,
          roas: c.spend > 0 ? c.revenue / c.spend : 0,
        })),
        totalSpend: t.spend,
        totalLeads: t.leads,
        totalWon: t.won,
        totalRevenue: t.revenue,
        cpl: t.leads > 0 && t.spend > 0 ? t.spend / t.leads : 0,
        cac: t.won > 0 && t.spend > 0 ? t.spend / t.won : 0,
        roas: t.spend > 0 ? t.revenue / t.spend : 0,
      }
    }

    const inPeriod = clients.filter(c => new Date(c.created_at).getTime() >= start)
    const totalLeads = inPeriod.length
    const totalWon = inPeriod.filter(c => wonKeys.has(c.stage)).length
    const totalRevenue = inPeriod.filter(c => wonKeys.has(c.stage)).reduce((s, c) => s + (Number(c.value) || 0), 0)
    const totalSpend = Object.values(spendMap).reduce((s, v) => s + (Number(v) || 0), 0)

    const rows = campaigns.map(camp => {
      const campLeads = inPeriod.filter(c => c.source === camp.name || c.source === camp.id)
      const leads = campLeads.length || camp.sent || 0
      const won = campLeads.filter(c => wonKeys.has(c.stage)).length
      const revenue = campLeads.filter(c => wonKeys.has(c.stage)).reduce((s, c) => s + (Number(c.value) || 0), 0)
      const spend = Number(spendMap[camp.id]) || 0
      return {
        id: camp.id, name: camp.name, channel: camp.channel || 'whatsapp',
        spend, leads, won, revenue,
        cpl: leads > 0 && spend > 0 ? spend / leads : 0,
        cac: won > 0 && spend > 0 ? spend / won : 0,
        roas: spend > 0 ? revenue / spend : 0,
      }
    })

    return {
      rows, totalSpend, totalLeads, totalWon, totalRevenue,
      cpl: totalLeads > 0 && totalSpend > 0 ? totalSpend / totalLeads : 0,
      cac: totalWon > 0 && totalSpend > 0 ? totalSpend / totalWon : 0,
      roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
    }
  }, [isDemoMode, campaigns, clients, start, wonKeys, spendMap])

  const maxRev = Math.max(...metrics.rows.map(r => r.revenue), 1)
  const td = { padding: '12px 10px', borderTop: `1px solid ${C.bd}`, textAlign: 'left', fontSize: 13 }
  const th = { padding: '8px 10px', fontSize: 11, color: C.mut, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }

  return (
    <Layout title="Marketing" subtitle="CPL · CAC · ROAS">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => exportCSV(metrics.rows.map(r => ({ Campanha: r.name, Canal: r.channel, Investimento: r.spend, Leads: r.leads, Ganhos: r.won, Receita: r.revenue, CPL: r.cpl.toFixed(2), CAC: r.cac.toFixed(2), ROAS: r.roas.toFixed(1) })), 'marketing')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.bd}`, background: 'transparent', color: C.tx, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><Download size={13} /> CSV</button>
          <button onClick={() => exportPremiumPDF({ filename: 'Marketing_Report', title: 'Marketing — CPL · CAC · ROAS', subtitle: `Período: ${period}`, kpis: [{ label: 'Investimento', value: brl(metrics.totalSpend) }, { label: 'Leads', value: metrics.totalLeads }, { label: 'ROAS', value: metrics.roas > 0 ? metrics.roas.toFixed(1) + 'x' : '—' }], tables: [{ title: 'Por campanha', columns: ['Campanha', 'Canal', 'Invest.', 'Leads', 'Ganhos', 'Receita', 'CPL', 'CAC', 'ROAS'], rows: metrics.rows.map(r => [r.name, r.channel, brl(r.spend), r.leads, r.won, brl(r.revenue), r.cpl > 0 ? brl(r.cpl) : '—', r.cac > 0 ? brl(r.cac) : '—', r.roas > 0 ? r.roas.toFixed(1) + 'x' : '—']) }] })} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.bd}`, background: 'transparent', color: C.tx, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><Download size={13} /> PDF</button>
        </div>
        <div className="rf-seg" role="group">
          {periodOptions.map(o => <button key={o.key} aria-pressed={period === o.key} onClick={() => setPeriod(o.key)}>{o.label}</button>)}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
        <KPI icon={DollarSign} label="Investimento total" value={brl(metrics.totalSpend)} color="#EF4444" />
        <KPI icon={Users} label="Leads gerados" value={metrics.totalLeads.toLocaleString('pt-BR')} sub={`CPL: ${metrics.cpl > 0 ? brl(metrics.cpl) : '—'}`} color={C.pur} />
        <KPI icon={Target} label="Clientes ganhos" value={metrics.totalWon.toLocaleString('pt-BR')} sub={`CAC: ${metrics.cac > 0 ? brl(metrics.cac) : '—'}`} color="#22C55E" />
        <KPI icon={TrendingUp} label="Receita gerada" value={brl(metrics.totalRevenue)} sub={`ROAS: ${metrics.roas > 0 ? metrics.roas.toFixed(1) + 'x' : '—'}`} color={C.org} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: C.mut, padding: 40 }}>Carregando…</div>
      ) : (
        <>
          {/* Gráfico — receita por campanha */}
          <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 20, marginBottom: 24 }}>
            <p className="rf-section-title" style={{ marginBottom: 16 }}>Receita por campanha</p>
            {metrics.rows.length === 0 ? (
              <p style={{ fontSize: 13, color: C.mut, textAlign: 'center', padding: '20px 0' }}>Nenhuma campanha encontrada</p>
            ) : metrics.rows.map((r, i) => (
              <div key={r.id || i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <Megaphone size={16} color={C.pur} style={{ flexShrink: 0 }} />
                <span style={{ width: 140, fontSize: 13, fontWeight: 600, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <div style={{ flex: 1, height: 24, background: C.bd, borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ width: (r.revenue / maxRev * 100) + '%', height: '100%', background: `linear-gradient(90deg, #22C55E, #22C55E88)`, borderRadius: 6, transition: 'width .4s' }} />
                  <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 700, color: C.tx }}>{brl(r.revenue)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Tabela */}
          <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 20 }}>
            <p className="rf-section-title" style={{ marginBottom: 16 }}>Detalhamento por campanha</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead><tr>
                  {['Campanha', 'Canal', 'Investimento', 'Leads', 'Ganhos', 'Receita', 'CPL', 'CAC', 'ROAS'].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {metrics.rows.map((r, i) => (
                    <tr key={r.id || i}>
                      <td style={{ ...td, fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</td>
                      <td style={{ ...td, textTransform: 'capitalize' }}>{r.channel}</td>
                      <td style={td}>
                        {isDemoMode ? brl(r.spend) : (
                          <input
                            type="number" min={0} value={spendMap[r.id] ?? ''}
                            onChange={e => setSpendMap(p => ({ ...p, [r.id]: e.target.value }))}
                            placeholder="R$ 0"
                            style={{ width: 90, background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 6, padding: '4px 8px', color: C.tx, fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
                          />
                        )}
                      </td>
                      <td style={td}>{r.leads}</td>
                      <td style={{ ...td, color: '#22C55E', fontWeight: 600 }}>{r.won}</td>
                      <td style={{ ...td, fontWeight: 700, color: C.pur }}>{brl(r.revenue)}</td>
                      <td style={td}>{r.cpl > 0 ? brl(r.cpl) : '—'}</td>
                      <td style={td}>{r.cac > 0 ? brl(r.cac) : '—'}</td>
                      <td style={{ ...td, fontWeight: 700, color: r.roas >= 1 ? '#22C55E' : r.roas > 0 ? '#EF4444' : C.mut }}>
                        {r.roas > 0 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            {r.roas >= 1 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                            {r.roas.toFixed(1)}x
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr>
                  <td style={{ ...td, fontWeight: 800 }} colSpan={2}>Total</td>
                  <td style={{ ...td, fontWeight: 800 }}>{brl(metrics.totalSpend)}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{metrics.totalLeads}</td>
                  <td style={{ ...td, fontWeight: 800, color: '#22C55E' }}>{metrics.totalWon}</td>
                  <td style={{ ...td, fontWeight: 800, color: C.pur }}>{brl(metrics.totalRevenue)}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{metrics.cpl > 0 ? brl(metrics.cpl) : '—'}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{metrics.cac > 0 ? brl(metrics.cac) : '—'}</td>
                  <td style={{ ...td, fontWeight: 800, color: metrics.roas >= 1 ? '#22C55E' : C.mut }}>{metrics.roas > 0 ? metrics.roas.toFixed(1) + 'x' : '—'}</td>
                </tr></tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </Layout>
  )
}
