// Cobranças — Parcelas & Mensalidades. Tabela invoices (ver supabase/billing.sql).
// Escopo por ownerUserId (equipe vê o mesmo). "Atrasado" é derivado do vencimento.
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Layout } from '@components/Layout/Layout'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { Plus, Loader2, X, Check, RotateCcw, Trash2, DollarSign, Clock, AlertTriangle, Repeat } from 'lucide-react'

const C = { bg: '#0F172A', card: '#1E293B', bd: '#334155', tx: '#F8FAFC', mut: '#94A3B8', pur: '#7C3AED',
  green: '#22C55E', yellow: '#EAB308', red: '#EF4444', blue: '#3B82F6', orange: '#FF6B35' }
const F = "'DM Sans', sans-serif"
const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inp = { background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 8, color: C.tx, fontSize: 13, fontFamily: F, padding: '9px 11px', outline: 'none', width: '100%', boxSizing: 'border-box' }
const cardS = { background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 18, fontFamily: F }
const todayIso = () => new Date().toISOString().slice(0, 10)

const DEMO = [
  { id: 'd1', client_name: 'TechInova', description: 'Mensalidade Plano Pro', amount: 499, due_date: todayIso(), status: 'pending', recurring: true },
  { id: 'd2', client_name: 'BestPay', description: 'Setup inicial (1/3)', amount: 1200, due_date: '2026-08-10', status: 'pending', recurring: false },
  { id: 'd3', client_name: 'StorePrime', description: 'Mensalidade', amount: 499, due_date: '2026-08-20', status: 'paid', recurring: true },
]

const EMPTY = { client_id: '', client_name: '', description: '', amount: '', due_date: todayIso(), recurring: false }

export const Billing = () => {
  const { user, ownerUserId, isDemoMode } = useAuth()
  const [rows, setRows] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [statusFilter, setStatusFilter] = useState('all') // all|paid|pending|overdue|recurring
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const load = useCallback(async () => {
    if (isDemoMode) { setRows(DEMO); setLoading(false); return }
    if (!ownerUserId) return
    const [{ data: inv }, { data: cli }] = await Promise.all([
      supabase.from('invoices').select('*').eq('user_id', ownerUserId).order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('clients').select('id,name').eq('user_id', ownerUserId).order('name', { ascending: true }),
    ])
    setRows(inv || [])
    setClients(cli || [])
    setLoading(false)
  }, [ownerUserId, isDemoMode])
  useEffect(() => { load() }, [load])

  const guardDemo = () => { if (isDemoMode) { window.alert('Modo demo: crie uma conta para gerenciar cobranças.'); return true } return false }
  const isOverdue = (r) => r.status !== 'paid' && r.due_date && r.due_date < todayIso()

  const kpis = useMemo(() => {
    const paid = rows.filter(r => r.status === 'paid').reduce((a, r) => a + Number(r.amount || 0), 0)
    const overdue = rows.filter(r => isOverdue(r)).reduce((a, r) => a + Number(r.amount || 0), 0)
    const toReceive = rows.filter(r => r.status !== 'paid' && !isOverdue(r)).reduce((a, r) => a + Number(r.amount || 0), 0)
    const mrr = rows.filter(r => r.recurring).reduce((a, r) => a + Number(r.amount || 0), 0)
    return [
      { label: 'Recebido', value: brl(paid), color: C.green, Icon: DollarSign },
      { label: 'A receber', value: brl(toReceive), color: C.blue, Icon: Clock },
      { label: 'Atrasado', value: brl(overdue), color: C.red, Icon: AlertTriangle },
      { label: 'Recorrente / mês', value: brl(mrr), color: C.pur, Icon: Repeat },
    ]
  }, [rows])

  const filtered = rows.filter(r => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'overdue') return isOverdue(r)
    if (statusFilter === 'recurring') return r.recurring
    if (statusFilter === 'pending') return r.status !== 'paid' && !isOverdue(r)
    return r.status === 'paid'
  })

  const save = async () => {
    if (guardDemo()) return
    if (!form.description.trim() && !form.client_name.trim() && !form.client_id) { window.alert('Informe cliente ou descrição.'); return }
    if (busy) return
    setBusy(true)
    const clientName = form.client_id ? (clients.find(c => c.id === form.client_id)?.name || '') : form.client_name.trim()
    const payload = {
      user_id: ownerUserId, client_id: form.client_id || null, client_name: clientName || null,
      description: form.description.trim() || null, amount: Number(form.amount) || 0,
      due_date: form.due_date || null, recurring: !!form.recurring, status: 'pending',
    }
    const { data, error } = await supabase.from('invoices').insert(payload).select().single()
    setBusy(false)
    if (error) { window.alert('Erro ao salvar:\n' + error.message + '\n\n(Rode supabase/billing.sql se ainda não rodou.)'); return }
    setRows(r => [...r, data]); setModal(false); setForm(EMPTY)
  }
  const togglePaid = async (r) => {
    if (guardDemo()) return
    const next = r.status === 'paid' ? 'pending' : 'paid'
    setRows(x => x.map(i => i.id === r.id ? { ...i, status: next } : i))
    await supabase.from('invoices').update({ status: next, paid_at: next === 'paid' ? new Date().toISOString() : null }).eq('id', r.id)
  }
  const del = async (r) => {
    if (guardDemo()) return
    if (!window.confirm('Excluir esta cobrança?')) return
    setRows(x => x.filter(i => i.id !== r.id))
    await supabase.from('invoices').delete().eq('id', r.id)
  }

  const pill = (r) => {
    if (r.status === 'paid') return { t: 'Pago', c: C.green }
    if (isOverdue(r)) return { t: 'Atrasado', c: C.red }
    return { t: 'Pendente', c: C.yellow }
  }
  const FILTERS = [['all', 'Todas'], ['pending', 'Pendentes'], ['overdue', 'Atrasadas'], ['paid', 'Pagas'], ['recurring', 'Recorrentes']]

  return (
    <Layout title="Cobranças" subtitle="Parcelas e mensalidades dos clientes">
      {isDemoMode && (
        <div style={{ ...cardS, marginBottom: 16, borderColor: 'rgba(234,179,8,0.27)', background: 'rgba(234,179,8,0.07)', color: C.yellow, fontSize: 13 }}>
          Modo demo — as cobranças abaixo são apenas exemplo. Crie uma conta para gerenciar de verdade.
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 16 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...cardS, borderLeft: `3px solid ${k.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.mut, fontSize: 12 }}><k.Icon size={14} color={k.color} /> {k.label}</div>
            <p style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 800, color: C.tx, fontVariantNumeric: 'tabular-nums' }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: C.card, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 3 }}>
          {FILTERS.map(([id, label]) => (
            <button key={id} onClick={() => setStatusFilter(id)} style={{ border: 'none', cursor: 'pointer', borderRadius: 7, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, fontFamily: F, background: statusFilter === id ? C.pur : 'transparent', color: statusFilter === id ? '#fff' : C.mut }}>{label}</button>
          ))}
        </div>
        <button onClick={() => { if (!guardDemo()) { setForm(EMPTY); setModal(true) } }} style={{ marginLeft: 'auto', background: C.pur, border: 'none', borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: F, padding: '9px 16px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus size={16} /> Nova cobrança</button>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ ...cardS, textAlign: 'center', color: C.mut }}>Carregando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...cardS, textAlign: 'center', color: C.mut }}>Nenhuma cobrança {statusFilter !== 'all' ? 'neste filtro' : 'ainda'}.</div>
      ) : (
        <div style={{ ...cardS, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: F }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.bd}` }}>
                  {['Cliente', 'Descrição', 'Valor', 'Vencimento', 'Status', ''].map((h, i) => (
                    <th key={i} style={{ textAlign: i === 2 ? 'right' : 'left', padding: '12px 14px', fontSize: 11, color: C.mut, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const p = pill(r)
                  return (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${C.bd}66` }}>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: C.tx, fontWeight: 600 }}>{r.client_name || '—'}</td>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: C.mut }}>
                        {r.description || '—'} {r.recurring && <span style={{ marginLeft: 6, fontSize: 10, color: C.pur, background: C.pur + '20', borderRadius: 5, padding: '1px 6px', fontWeight: 700 }}>mensal</span>}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: C.tx, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{brl(r.amount)}</td>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: C.mut, whiteSpace: 'nowrap' }}>{r.due_date ? new Date(r.due_date + 'T00:00').toLocaleDateString('pt-BR') : '—'}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: p.c, background: p.c + '1c', border: `1px solid ${p.c}44`, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>{p.t}</span>
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => togglePaid(r)} title={r.status === 'paid' ? 'Marcar como pendente' : 'Marcar como pago'} style={{ background: 'none', border: `1px solid ${C.bd}`, cursor: 'pointer', color: r.status === 'paid' ? C.yellow : C.green, borderRadius: 7, padding: '5px 7px', marginRight: 6 }}>{r.status === 'paid' ? <RotateCcw size={14} /> : <Check size={14} />}</button>
                        <button onClick={() => del(r)} title="Excluir" style={{ background: 'none', border: `1px solid ${C.bd}`, cursor: 'pointer', color: C.red, borderRadius: 7, padding: '5px 7px' }}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal nova cobrança */}
      {modal && (
        <div onClick={() => setModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...cardS, width: 460, maxWidth: '100%', display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Nova cobrança</h3>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mut }}><X size={18} /></button>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.mut, fontWeight: 600 }}>Cliente</label>
              {clients.length > 0 ? (
                <select value={form.client_id} onChange={e => set('client_id', e.target.value)} style={{ ...inp, appearance: 'none' }}>
                  <option value="" style={{ background: C.card }}>— selecione ou deixe em branco —</option>
                  {clients.map(c => <option key={c.id} value={c.id} style={{ background: C.card }}>{c.name}</option>)}
                </select>
              ) : (
                <input value={form.client_name} onChange={e => set('client_name', e.target.value)} placeholder="Nome do cliente" style={inp} />
              )}
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.mut, fontWeight: 600 }}>Descrição</label>
              <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Ex.: Mensalidade Plano Pro / Parcela 1/3" style={inp} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: C.mut, fontWeight: 600 }}>Valor (R$)</label>
                <input type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0,00" style={inp} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: C.mut, fontWeight: 600 }}>Vencimento</label>
                <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} style={inp} />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.tx, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.recurring} onChange={e => set('recurring', e.target.checked)} /> Mensalidade recorrente
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: `1px solid ${C.bd}`, borderRadius: 9, color: C.tx, fontSize: 14, fontFamily: F, padding: '9px 16px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={save} disabled={busy} style={{ background: C.pur, border: 'none', borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: F, padding: '9px 18px', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{busy && <Loader2 size={14} className="animate-spin" />}Salvar</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

export default Billing
