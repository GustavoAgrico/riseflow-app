import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { exportCSV } from '@utils/exportUtils'
import { logger } from '@services/activityLogger'
import { BarChart3, Users, TrendingUp, DollarSign, Ticket, ChevronDown, Phone, ArrowLeft, X } from 'lucide-react'

const C = { bg: '#0F172A', card: '#1E293B', bd: '#334155', tx: '#F8FAFC', mut: '#64748B', pur: '#7C3AED' }
const F = 'DM Sans, sans-serif'
const DAYS = { '7d': 7, '30d': 30, '90d': 90 }
const PERIODS = { '7d': ['Dia 1-2', 'Dia 3-4', 'Dia 5-6', 'Dia 7'], '30d': ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'], '90d': ['Mês 1', 'Mês 2', 'Mês 3', 'Mês 4'] }
// Mesmas etapas do CRM (campo clients.stage) — garante sincronização CRM <-> Funil
const STAGES = [
  { k: 'Novo Lead',   id: 'lead',   color: '#7C3AED', w: 100 },
  { k: 'Qualificado', id: 'qual',   color: '#2563EB', w: 84 },
  { k: 'Proposta',    id: 'prop',   color: '#0891B2', w: 66 },
  { k: 'Negociação',  id: 'neg',    color: '#D97706', w: 48 },
  { k: 'Fechado',     id: 'closed', color: '#059669', w: 30 },
  { k: 'Perdido',     id: 'lost',   color: '#EF4444', w: 20 },
]
const brl = n => 'R$ ' + Math.round(n).toLocaleString('pt-BR')
const daysAgo = t => Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 864e5))

export const Funnel = () => {
  const nav = useNavigate()
  const { user } = useAuth()
  const [period, setPeriod] = useState('30d')
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState([])
  const [err, setErr] = useState('')
  const [hover, setHover] = useState(null)
  const [modal, setModal] = useState(null)

  useEffect(() => {
    let on = true
    ;(async () => {
      setLoading(true); setErr('')
      try {
        if (!user?.id) throw new Error('sem usuário')
        // select('*') evita falhar se a migração (stage/value) ainda não foi rodada
        const { data, error } = await supabase.from('clients').select('*').eq('user_id', user.id)
        if (error) throw error
        if (on) { setClients(data ?? []); console.log(`[Funnel] ${(data ?? []).length} contatos reais carregados`) }
      } catch (e) {
        console.warn('[Funnel] erro ao carregar contatos:', e?.message ?? e)
        if (on) { setClients([]); setErr('Não foi possível carregar seus contatos') }
      }
      if (on) setLoading(false)
    })()
    return () => { on = false }
  }, [user])

  const start = Date.now() - DAYS[period] * 864e5
  const inPeriod = clients.filter(c => new Date(c.created_at).getTime() >= start)
  const list = id => inPeriod.filter(c => (c.stage || 'lead') === id)
  const count = id => list(id).length
  const value = id => list(id).reduce((s, c) => s + (Number(c.value) || 0), 0)
  const avgT = id => { const l = list(id); return l.length ? Math.round(l.reduce((s, c) => s + daysAgo(c.created_at), 0) / l.length) + 'd' : '—' }

  const total = inPeriod.length
  const closed = count('closed')
  const pipeline = inPeriod.reduce((s, c) => s + (Number(c.value) || 0), 0)
  const ticket = closed ? pipeline / closed : 0
  const geral = total ? (closed / total * 100).toFixed(1) : '0'
  const share = id => total ? (count(id) / total * 100).toFixed(0) + '%' : '0%'

  const buckets = [0, 0, 0, 0]
  const span = Math.max(1, (Date.now() - start) / 4)
  inPeriod.forEach(c => { const i = Math.min(3, Math.max(0, Math.floor((new Date(c.created_at).getTime() - start) / span))); buckets[i]++ })
  const bMax = Math.max(...buckets, 1)

  const exportCsv = () => {
    logger.log(user?.id, 'export_csv', { category: 'system', description: 'Exportou o funil de vendas (CSV)' })
    exportCSV(STAGES.map(st => ({
      Etapa: st.k, Quantidade: count(st.id), 'Valor Total': value(st.id),
      'Pct do Total': share(st.id), 'Tempo Medio': avgT(st.id),
    })), 'funil_vendas')
  }

  const panel = { background: C.card, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 20, marginTop: 24 }
  const h2 = { margin: '0 0 16px', fontSize: 14, fontWeight: 700 }
  const iBtn = { background: 'none', border: 'none', color: C.tx, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', padding: 4 }
  const sel = { background: C.card, border: `1px solid ${C.bd}`, borderRadius: 8, color: C.tx, fontSize: 13, padding: '7px 10px', fontFamily: F, outline: 'none' }
  const td = { padding: '10px 8px', borderTop: `1px solid ${C.bd}`, textAlign: 'left' }
  const th = { padding: '0 8px 8px', fontSize: 11, color: C.mut, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em' }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.tx, fontFamily: F, display: 'flex', flexDirection: 'column' }}>
      <div style={{ minHeight: 56, background: C.card, borderBottom: `1px solid ${C.bd}`, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '8px 20px', flexShrink: 0 }}>
        <button onClick={() => nav('/dashboard')} title="Voltar" style={iBtn}><ArrowLeft size={20} /></button>
        <span style={{ fontSize: 18, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 8 }}><BarChart3 size={20} color={C.pur} /> Funil de Vendas</span>
        <select value={period} onChange={e => setPeriod(e.target.value)} style={{ ...sel, marginLeft: 'auto' }}>
          <option value="7d">Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="90d">Últimos 90 dias</option>
        </select>
        <button onClick={exportCsv} style={{ background: C.pur, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, padding: '8px 14px', cursor: 'pointer', fontFamily: F }}>Exportar CSV</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          {loading ? (
            <div style={{ maxWidth: 760, margin: '0 auto' }}>
              {STAGES.map(st => <div key={st.k} className="animate-pulse" style={{ width: st.w + '%', height: 56, margin: '0 auto 12px', background: C.card, borderRadius: 10 }} />)}
            </div>
          ) : err ? (
            <p style={{ textAlign: 'center', color: C.mut, fontSize: 14, marginTop: 40 }}>{err}</p>
          ) : (
            <>
              {/* SEÇÃO 1 — FUNIL */}
              <div style={{ maxWidth: 760, margin: '0 auto' }}>
                {STAGES.map((st, i) => (
                  <React.Fragment key={st.k}>
                    <div onMouseEnter={() => setHover(st.k)} onMouseLeave={() => setHover(null)} onClick={() => setModal(st)}
                      style={{ width: st.w + '%', margin: '0 auto', height: 56, background: st.color, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', boxSizing: 'border-box', color: '#fff', cursor: 'pointer', filter: hover === st.k ? 'brightness(1.18)' : 'none', transition: 'filter .15s' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{st.k}</span>
                      <span style={{ fontSize: 18, fontWeight: 800 }}>{count(st.id).toLocaleString('pt-BR')}</span>
                      <span style={{ fontSize: 12, opacity: .85 }}>{share(st.id)}</span>
                    </div>
                    {i < STAGES.length - 1 && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.mut, margin: '4px 0' }}><ChevronDown size={16} /></div>}
                  </React.Fragment>
                ))}
              </div>

              {/* SEÇÃO 2 — KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginTop: 28 }}>
                {[[Users, 'Total de Contatos', total.toLocaleString('pt-BR')], [TrendingUp, 'Taxa Geral', geral + '%'], [DollarSign, 'Valor Total Pipeline', brl(pipeline)], [Ticket, 'Ticket Médio', brl(ticket)]].map(([Ic, lb, v]) => (
                  <div key={lb} style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 16 }}>
                    <Ic size={22} color={C.pur} />
                    <p style={{ margin: '8px 0 2px', fontSize: 12, color: C.mut }}>{lb}</p>
                    <p style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{v}</p>
                  </div>
                ))}
              </div>

              {/* SEÇÃO 3 — NOVOS CONTATOS POR PERÍODO */}
              <div style={panel}>
                <p style={h2}>Novos contatos por período</p>
                {PERIODS[period].map((lb, i) => (
                  <div key={lb} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <span style={{ width: 72, fontSize: 12, color: C.mut, flexShrink: 0 }}>{lb}</span>
                    <div style={{ flex: 1, height: 24, background: C.bd, borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ width: (buckets[i] / bMax * 100) + '%', height: '100%', background: C.pur, borderRadius: 6 }} />
                    </div>
                    <span style={{ width: 48, textAlign: 'right', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{buckets[i]}</span>
                  </div>
                ))}
              </div>

              {/* SEÇÃO 4 — TABELA */}
              <div style={panel}>
                <p style={h2}>Detalhamento por etapa</p>
                <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
                  <thead><tr>{['Etapa', 'Quantidade', 'Valor Total', '% do Total', 'Tempo Médio'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {STAGES.map(st => { const cl = st.id === 'closed' ? '#22C55E' : st.id === 'lost' ? '#F87171' : C.tx; return (
                      <tr key={st.k}>
                        <td style={{ ...td, color: cl, fontWeight: 600 }}>{st.k}</td>
                        <td style={td}>{count(st.id).toLocaleString('pt-BR')}</td>
                        <td style={td}>{brl(value(st.id))}</td>
                        <td style={td}>{share(st.id)}</td>
                        <td style={td}>{avgT(st.id)}</td>
                      </tr>
                    )})}
                  </tbody>
                  <tfoot><tr>
                    <td style={{ ...td, fontWeight: 800 }}>Total</td>
                    <td style={{ ...td, fontWeight: 800 }}>{total.toLocaleString('pt-BR')}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{brl(pipeline)}</td>
                    <td style={td}>—</td><td style={td}>—</td>
                  </tr></tfoot>
                </table></div>
              </div>
            </>
          )}
        </div>
      </div>

      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: '#000000aa', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 20, width: 440, maxWidth: '100%', fontFamily: F }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 15, fontWeight: 800 }}>{modal.k} · {count(modal.id).toLocaleString('pt-BR')}</span>
              <button onClick={() => setModal(null)} style={iBtn}><X size={18} /></button>
            </div>
            <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {list(modal.id).length === 0 ? <p style={{ color: C.mut, fontSize: 13, textAlign: 'center', margin: '12px 0' }}>Nenhum contato nesta etapa</p>
              : list(modal.id).map(c => (
                <div key={c.id} style={{ background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{c.name || '—'}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.pur }}>{brl(Number(c.value) || 0)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 12, color: C.mut }}>
                    <span>{(c.tags && c.tags.length) ? c.tags.join(', ') : (c.channel || '—')}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={12} /> {c.phone || '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
