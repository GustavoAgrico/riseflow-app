// Cobranças — Parcelas & Mensalidades. Tabela invoices (ver supabase/billing.sql).
// Escopo por ownerUserId (equipe vê o mesmo). "Atrasado" é derivado do vencimento.
// Cálculos (idade dos atrasos, fluxo de caixa, CSV, documento) ficam em src/lib/finance.js.
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Layout } from '@components/Layout/Layout'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { useQueryAction } from '@hooks/useQueryAction'
import { CountUp, Segmented } from '@components/motion'
import {
  Plus, Loader2, X, Check, RotateCcw, Trash2, DollarSign, Clock, AlertTriangle, Repeat, Search, Download,
  FileText, Copy, ChevronUp, ChevronDown,
} from 'lucide-react'
import {
  localDay, isPaid, isOverdue, daysLate, bucketOf, aging, cashFlow, collectedThisMonth,
  invoicesCsv, invoiceDocument, reminderText,
} from '@lib/finance'

const C = { bg: 'var(--bg)', card: 'var(--card)', bd: 'var(--border)', tx: 'var(--ink-1)', mut: 'var(--ink-3)', pur: '#7C3AED',
  green: '#22C55E', yellow: '#EAB308', red: '#EF4444', blue: '#3B82F6', orange: '#FF6B35' }
const F = "'DM Sans', sans-serif"
const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brlShort = (n) => {
  const v = Number(n) || 0
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (Math.abs(v) >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}
const inp = { background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 8, color: C.tx, fontSize: 13, fontFamily: F, padding: '9px 11px', outline: 'none', width: '100%', boxSizing: 'border-box' }
const cardS = { background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 18, fontFamily: F }
const iconBtn = { background: 'none', border: `1px solid ${C.bd}`, cursor: 'pointer', borderRadius: 7, padding: '5px 7px', display: 'inline-flex', alignItems: 'center' }
const PAGE = 25
const UNDO_MS = 6000

const monthsAgo = (n, day = 10) => { const d = new Date(); d.setMonth(d.getMonth() - n, day); return localDay(d) }
const DEMO = [
  { id: 'd1', client_name: 'TechInova', description: 'Mensalidade Plano Pro', amount: 499, due_date: localDay(), status: 'pending', recurring: true },
  { id: 'd2', client_name: 'BestPay', description: 'Setup inicial (1/3)', amount: 1200, due_date: monthsAgo(1), status: 'pending', recurring: false },
  { id: 'd3', client_name: 'StorePrime', description: 'Mensalidade', amount: 499, due_date: monthsAgo(1, 20), status: 'paid', paid_at: monthsAgo(1, 21), recurring: true },
  { id: 'd4', client_name: 'Clínica Vida', description: 'Implantação', amount: 3400, due_date: monthsAgo(2, 5), status: 'paid', paid_at: monthsAgo(2, 8), recurring: false },
  { id: 'd5', client_name: 'Auto Center Sul', description: 'Parcela 2/4', amount: 850, due_date: monthsAgo(3, 15), status: 'pending', recurring: false },
  { id: 'd6', client_name: 'TechInova', description: 'Mensalidade Plano Pro', amount: 499, due_date: monthsAgo(4, 10), status: 'paid', paid_at: monthsAgo(4, 10), recurring: true },
]

const EMPTY = { client_id: '', client_name: '', description: '', amount: '', due_date: localDay(), recurring: false }
const FILTERS = [['all', 'Todas'], ['pending', 'Pendentes'], ['overdue', 'Atrasadas'], ['paid', 'Pagas'], ['recurring', 'Recorrentes']]
const BUCKET_COLOR = { current: C.blue, '1-30': C.yellow, '31-60': C.orange, '61-90': '#F97316', '90+': C.red }

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Faturado × recebido por mês. Barras agrupadas, valores no title (tooltip nativo).
function CashFlowChart({ series }) {
  const max = Math.max(1, ...series.flatMap(s => [s.billed, s.received]))
  const H = 150
  const totals = series.reduce((a, s) => ({ billed: a.billed + s.billed, received: a.received + s.received }), { billed: 0, received: 0 })
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: C.mut, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: C.pur, display: 'inline-block' }} /> Faturado <b style={{ color: C.tx }}>{brlShort(totals.billed)}</b></span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: C.green, display: 'inline-block' }} /> Recebido <b style={{ color: C.tx }}>{brlShort(totals.received)}</b></span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: H + 22 }}>
        {series.map((s, i) => (
          <div key={s.key} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ height: H, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 3 }}>
              <div className="rf-bar-y" title={`Faturado em ${s.label}: ${brl(s.billed)}`} style={{ '--i': i, width: '38%', maxWidth: 18, height: `${(s.billed / max) * 100}%`, minHeight: s.billed ? 3 : 0, background: C.pur, opacity: 0.85, borderRadius: '4px 4px 0 0' }} />
              <div className="rf-bar-y" title={`Recebido em ${s.label}: ${brl(s.received)}`} style={{ '--i': i + 0.5, width: '38%', maxWidth: 18, height: `${(s.received / max) * 100}%`, minHeight: s.received ? 3 : 0, background: C.green, borderRadius: '4px 4px 0 0' }} />
            </div>
            <span style={{ fontSize: 11, color: C.mut }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AgingPanel({ buckets, selected, onSelect }) {
  const total = buckets.reduce((a, b) => a + b.total, 0)
  return (
    <div style={{ display: 'grid', gap: 9 }}>
      <p style={{ margin: 0, fontSize: 12, color: C.mut }}>Em aberto: <b style={{ color: C.tx }}>{brl(total)}</b> · clique numa faixa para filtrar</p>
      {buckets.map((b, i) => {
        const on = selected === b.id
        const color = BUCKET_COLOR[b.id]
        return (
          <button key={b.id} onClick={() => onSelect(on ? null : b.id)} aria-pressed={on}
            style={{ display: 'grid', gridTemplateColumns: '86px 1fr auto', alignItems: 'center', gap: 10, background: on ? color + '14' : 'transparent', border: `1px solid ${on ? color + '66' : 'transparent'}`, borderRadius: 9, padding: '5px 8px', cursor: 'pointer', fontFamily: F, textAlign: 'left' }}>
            <span style={{ fontSize: 12, color: C.tx, fontWeight: 600 }}>{b.label}</span>
            <span style={{ height: 8, background: 'var(--bg)', borderRadius: 99, overflow: 'hidden' }}>
              <span className="rf-bar-x" style={{ '--i': i, display: 'block', height: '100%', width: `${total ? (b.total / total) * 100 : 0}%`, background: color, borderRadius: 99 }} />
            </span>
            <span style={{ fontSize: 12, color: C.tx, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{brlShort(b.total)} <span style={{ color: C.mut }}>({b.count})</span></span>
          </button>
        )
      })}
    </div>
  )
}

export const Billing = () => {
  const { user, ownerUserId, isDemoMode } = useAuth()
  const [rows, setRows] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [statusFilter, setStatusFilter] = useState('all') // all|paid|pending|overdue|recurring
  const [bucket, setBucket] = useState(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ key: 'due_date', dir: 'asc' })
  const [showAll, setShowAll] = useState(false)
  const [months, setMonths] = useState(6)
  const [toast, setToast] = useState(null) // { text, undo? }
  const toastTimer = useRef(null)
  const pendingDeletes = useRef(new Map()) // id → timer (exclusão só vai ao banco depois do prazo de desfazer)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const company = user?.user_metadata?.company_name || user?.user_metadata?.company || user?.user_metadata?.full_name || 'Minha empresa'

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

  // Saindo da página com exclusões no prazo de desfazer: confirma todas.
  useEffect(() => () => {
    clearTimeout(toastTimer.current)
    for (const [id, t] of pendingDeletes.current) { clearTimeout(t); supabase.from('invoices').delete().eq('id', id).then(() => {}) }
    pendingDeletes.current.clear()
  }, [])

  const guardDemo = () => { if (isDemoMode) { window.alert('Modo demo: crie uma conta para gerenciar cobranças.'); return true } return false }
  useQueryAction('novo', () => { if (!guardDemo()) { setForm(EMPTY); setModal(true) } })

  const showToast = (text, undo) => {
    clearTimeout(toastTimer.current)
    setToast({ text, undo })
    toastTimer.current = setTimeout(() => setToast(null), undo ? UNDO_MS : 2500)
  }

  const today = localDay()
  const kpis = useMemo(() => {
    const overdue = rows.filter(r => isOverdue(r, today)).reduce((a, r) => a + Number(r.amount || 0), 0)
    const toReceive = rows.filter(r => !isPaid(r) && !isOverdue(r, today)).reduce((a, r) => a + Number(r.amount || 0), 0)
    const mrr = rows.filter(r => r.recurring).reduce((a, r) => a + Number(r.amount || 0), 0)
    return [
      { label: 'Recebido no mês', value: brl(collectedThisMonth(rows, today)), color: C.green, Icon: DollarSign },
      { label: 'A receber', value: brl(toReceive), color: C.blue, Icon: Clock },
      { label: 'Atrasado', value: brl(overdue), color: C.red, Icon: AlertTriangle },
      { label: 'Recorrente / mês', value: brl(mrr), color: C.pur, Icon: Repeat },
    ]
  }, [rows, today])
  const buckets = useMemo(() => aging(rows, today), [rows, today])
  const flow = useMemo(() => cashFlow(rows, months, today), [rows, months, today])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = rows.filter(r => {
      if (bucket && bucketOf(r, today) !== bucket) return false
      if (q && !`${r.client_name || ''} ${r.description || ''}`.toLowerCase().includes(q)) return false
      if (statusFilter === 'all') return true
      if (statusFilter === 'overdue') return isOverdue(r, today)
      if (statusFilter === 'recurring') return r.recurring
      if (statusFilter === 'pending') return !isPaid(r) && !isOverdue(r, today)
      return isPaid(r)
    })
    const val = (r) => {
      if (sort.key === 'amount') return Number(r.amount) || 0
      if (sort.key === 'status') return isPaid(r) ? 2 : isOverdue(r, today) ? 0 : 1
      if (sort.key === 'client_name') return (r.client_name || '').toLowerCase()
      return r.due_date || '9999-12-31'
    }
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => (val(a) > val(b) ? dir : val(a) < val(b) ? -dir : 0))
  }, [rows, query, bucket, statusFilter, sort, today])
  const visible = showAll ? filtered : filtered.slice(0, PAGE)

  const save = async () => {
    if (guardDemo()) return
    if (!form.description.trim() && !form.client_name.trim() && !form.client_id) { window.alert('Informe cliente ou descrição.'); return }
    if (!(Number(form.amount) > 0)) { window.alert('Informe um valor maior que zero.'); return }
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
    showToast('Cobrança criada.')
  }

  const writeStatus = async (r, status, paid_at) => {
    setRows(x => x.map(i => i.id === r.id ? { ...i, status, paid_at } : i))
    const { error } = await supabase.from('invoices').update({ status, paid_at }).eq('id', r.id)
    if (error) { setRows(x => x.map(i => i.id === r.id ? r : i)); showToast('Não foi possível salvar. Tente de novo.') }
  }
  const togglePaid = (r) => {
    if (guardDemo()) return
    const paying = !isPaid(r)
    writeStatus(r, paying ? 'paid' : 'pending', paying ? new Date().toISOString() : null)
    showToast(paying ? `Marcada como paga: ${r.client_name || r.description || 'cobrança'}.` : 'Voltou para pendente.',
      () => writeStatus({ ...r, status: paying ? 'paid' : 'pending' }, r.status, r.paid_at ?? null))
  }

  const del = (r) => {
    if (guardDemo()) return
    const index = rows.findIndex(i => i.id === r.id)
    setRows(x => x.filter(i => i.id !== r.id))
    const timer = setTimeout(async () => {
      pendingDeletes.current.delete(r.id)
      const { error } = await supabase.from('invoices').delete().eq('id', r.id)
      if (error) { setRows(x => [...x, r]); showToast('Não foi possível excluir.') }
    }, UNDO_MS)
    pendingDeletes.current.set(r.id, timer)
    showToast('Cobrança excluída.', () => {
      clearTimeout(pendingDeletes.current.get(r.id)); pendingDeletes.current.delete(r.id)
      setRows(x => { const n = [...x]; n.splice(Math.max(0, index), 0, r); return n })
    })
  }

  const openDocument = (r) => {
    const url = URL.createObjectURL(new Blob([invoiceDocument(r, { company, today })], { type: 'text/html' }))
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
  const copyReminder = async (r) => {
    try { await navigator.clipboard.writeText(reminderText(r, { brl, company })); showToast('Lembrete copiado — cole no WhatsApp ou e-mail.') }
    catch { showToast('Não consegui copiar automaticamente.') }
  }
  const exportCsv = () => {
    download(`cobrancas-${today}.csv`, invoicesCsv(filtered, today), 'text/csv;charset=utf-8')
    showToast(`${filtered.length} cobrança(s) exportada(s).`)
  }

  const pill = (r) => {
    if (isPaid(r)) return { t: 'Pago', c: C.green }
    if (isOverdue(r, today)) return { t: `Atrasado ${daysLate(r, today)}d`, c: C.red }
    return { t: 'Pendente', c: C.yellow }
  }
  const sortBy = (key) => setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))
  const COLS = [['client_name', 'Cliente'], [null, 'Descrição'], ['amount', 'Valor'], ['due_date', 'Vencimento'], ['status', 'Status'], [null, '']]
  const filtersActive = statusFilter !== 'all' || bucket || query.trim()

  return (
    <Layout title="Cobranças" subtitle="Parcelas, mensalidades e fluxo de caixa">
      {isDemoMode && (
        <div style={{ ...cardS, marginBottom: 16, borderColor: 'rgba(234,179,8,0.27)', background: 'rgba(234,179,8,0.07)', color: C.yellow, fontSize: 13 }}>
          Modo demo — as cobranças abaixo são apenas exemplo. Crie uma conta para gerenciar de verdade.
        </div>
      )}

      {/* KPIs */}
      <div className="rf-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,150px),1fr))', gap: 12, marginBottom: 16 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...cardS, borderLeft: `3px solid ${k.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.mut, fontSize: 12 }}><k.Icon size={14} color={k.color} /> {k.label}</div>
            <p style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 800, color: C.tx, fontVariantNumeric: 'tabular-nums' }}><CountUp value={k.value} /></p>
          </div>
        ))}
      </div>

      {/* Fluxo de caixa + idade dos atrasos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,340px),1fr))', gap: 12, marginBottom: 16 }}>
        <div style={cardS}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.tx }}>Fluxo de caixa</h3>
            <Segmented label="Período do fluxo de caixa" size="sm" options={[[6, '6M'], [12, '12M']]} value={months} onChange={setMonths} />
          </div>
          <CashFlowChart key={months} series={flow} />
        </div>
        <div style={cardS}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.tx }}>Idade dos valores em aberto</h3>
          <AgingPanel buckets={buckets} selected={bucket} onSelect={(b) => { setBucket(b); setShowAll(false) }} />
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Segmented label="Filtrar por situação" options={FILTERS} value={statusFilter} onChange={(id) => { setStatusFilter(id); setShowAll(false) }} />
        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 300 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.mut }} />
          <input value={query} onChange={e => { setQuery(e.target.value); setShowAll(false) }} placeholder="Cliente ou descrição" aria-label="Buscar cobranças" style={{ ...inp, paddingLeft: 30 }} />
        </div>
        {filtersActive && (
          <button onClick={() => { setStatusFilter('all'); setBucket(null); setQuery('') }} style={{ background: 'none', border: 'none', color: C.orange, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>Limpar filtros</button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={exportCsv} disabled={!filtered.length} title="Exportar as cobranças filtradas" style={{ background: 'none', border: `1px solid ${C.bd}`, borderRadius: 9, color: C.tx, fontSize: 13, fontWeight: 600, fontFamily: F, padding: '9px 13px', cursor: filtered.length ? 'pointer' : 'not-allowed', opacity: filtered.length ? 1 : 0.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Download size={15} /> CSV</button>
          <button onClick={() => { if (!guardDemo()) { setForm(EMPTY); setModal(true) } }} style={{ background: C.pur, border: 'none', borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: F, padding: '9px 16px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus size={16} /> Nova cobrança</button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ ...cardS, textAlign: 'center', color: C.mut }}>Carregando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...cardS, textAlign: 'center', color: C.mut }}>Nenhuma cobrança {filtersActive ? 'neste filtro' : 'ainda'}.</div>
      ) : (
        <div style={{ ...cardS, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: F }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.bd}` }}>
                  {COLS.map(([key, h], i) => (
                    <th key={i} aria-sort={key && sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      style={{ textAlign: i === 2 ? 'right' : 'left', padding: '12px 14px', fontSize: 11, color: C.mut, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>
                      {key ? (
                        <button onClick={() => sortBy(key)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: sort.key === key ? C.tx : C.mut, font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          {h}{sort.key === key && (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                        </button>
                      ) : h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map(r => {
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
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <button onClick={() => togglePaid(r)} title={isPaid(r) ? 'Marcar como pendente' : 'Marcar como pago'} aria-label={isPaid(r) ? 'Marcar como pendente' : 'Marcar como pago'} style={{ ...iconBtn, color: isPaid(r) ? C.yellow : C.green }}>{isPaid(r) ? <RotateCcw size={14} /> : <Check size={14} />}</button>
                          {!isPaid(r) && <button onClick={() => copyReminder(r)} title="Copiar lembrete de pagamento" aria-label="Copiar lembrete" style={{ ...iconBtn, color: C.blue }}><Copy size={14} /></button>}
                          <button onClick={() => openDocument(r)} title="Abrir documento (imprimir ou salvar PDF)" aria-label="Abrir documento" style={{ ...iconBtn, color: C.tx }}><FileText size={14} /></button>
                          <button onClick={() => del(r)} title="Excluir" aria-label="Excluir" style={{ ...iconBtn, color: C.red }}><Trash2 size={14} /></button>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > PAGE && (
            <div style={{ padding: 10, textAlign: 'center', borderTop: `1px solid ${C.bd}` }}>
              <button onClick={() => setShowAll(s => !s)} style={{ background: 'none', border: 'none', color: C.orange, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
                {showAll ? 'Mostrar menos' : `Mostrar todas (${filtered.length})`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Aviso com Desfazer */}
      {toast && (
        <div key={toast.text} role="status" className="rf-toast" style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 1001, display: 'flex', alignItems: 'center', gap: 14, background: 'var(--panel)', border: `1px solid ${C.bd}`, borderRadius: 12, padding: '10px 14px', boxShadow: '0 12px 40px rgba(0,0,0,0.35)', fontFamily: F, fontSize: 13, color: C.tx, maxWidth: 'calc(100vw - 32px)' }}>
          <span>{toast.text}</span>
          {toast.undo && (
            <button onClick={() => { const u = toast.undo; clearTimeout(toastTimer.current); setToast(null); u() }} style={{ background: 'none', border: 'none', color: C.orange, fontWeight: 700, cursor: 'pointer', fontFamily: F, fontSize: 13 }}>Desfazer</button>
          )}
          <button onClick={() => setToast(null)} aria-label="Fechar aviso" style={{ background: 'none', border: 'none', color: C.mut, cursor: 'pointer', display: 'flex' }}><X size={14} /></button>
        </div>
      )}

      {/* Modal nova cobrança */}
      {modal && (
        <div className="rf-scrim" onClick={() => setModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 20 }}>
          <div role="dialog" aria-modal="true" aria-label="Nova cobrança" className="rf-pop" onClick={e => e.stopPropagation()} style={{ ...cardS, width: 460, maxWidth: '100%', display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Nova cobrança</h3>
              <button onClick={() => setModal(false)} aria-label="Fechar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mut }}><X size={18} /></button>
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
                <input type="number" step="0.01" min="0" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0,00" style={inp} />
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
