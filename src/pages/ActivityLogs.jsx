import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ClipboardList, Download, Trash2, Search, Inbox, Lock, User, MessageSquare, Zap, BarChart3, Users, CreditCard, Settings, Wrench } from 'lucide-react'
import { useAuth } from '@context/AuthContext'
import { logger } from '@services/activityLogger'
import { exportCSV } from '@utils/exportUtils'

const C = { bg: '#0F172A', card: '#1E293B', bd: '#334155', tx: '#F8FAFC', mut: '#94A3B8', pur: '#7C3AED' }
const F = 'DM Sans, sans-serif'
const PER = 50
const CATS = [
  { id: 'all', label: 'Todas' }, { id: 'auth', label: 'Auth' }, { id: 'contacts', label: 'Contatos' },
  { id: 'messages', label: 'Mensagens' }, { id: 'flows', label: 'Flows' }, { id: 'crm', label: 'CRM' },
  { id: 'team', label: 'Equipe' }, { id: 'billing', label: 'Billing' }, { id: 'settings', label: 'Configurações' },
  { id: 'system', label: 'Sistema' },
]
const ICON = { auth: Lock, contacts: User, messages: MessageSquare, flows: Zap, crm: BarChart3, team: Users, billing: CreditCard, settings: Settings, system: Wrench }
const fmt = d => new Date(d).toLocaleString('pt-BR')
const rel = d => { const m = Math.max(1, Math.round((Date.now() - new Date(d)) / 60000)); return m < 60 ? `há ${m}min` : m < 1440 ? `há ${Math.round(m / 60)}h` : `há ${Math.round(m / 1440)}d` }

export function ActivityLogs() {
  const nav = useNavigate()
  const { user } = useAuth()
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [exp, setExp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ today: 0, week: 0, top: '—', lastLogin: '—' })
  const [hover, setHover] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => { setPage(0) }, [cat, from, to])

  useEffect(() => {
    if (!user?.id) return
    let on = true; setLoading(true)
    const opts = { category: cat, limit: PER, offset: page * PER }
    if (from) opts.dateFrom = new Date(from).toISOString()
    if (to) opts.dateTo = new Date(to + 'T23:59:59').toISOString()
    logger.getLogs(user.id, opts).then(({ logs, total }) => { if (on) { setLogs(logs); setTotal(total); setLoading(false) } })
    return () => { on = false }
  }, [user, cat, page, from, to, tick])

  useEffect(() => {
    if (!user?.id) return
    let on = true
    logger.getLogs(user.id, { limit: 500 }).then(({ logs }) => {
      if (!on) return
      const now = Date.now(), today = new Date().toDateString()
      const counts = {}; logs.forEach(l => { counts[l.category] = (counts[l.category] || 0) + 1 })
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
      const login = logs.find(l => l.action === 'login')
      setStats({
        today: logs.filter(l => new Date(l.created_at).toDateString() === today).length,
        week: logs.filter(l => now - new Date(l.created_at) < 7 * 86400000).length,
        top: top ? (CATS.find(c => c.id === top[0])?.label || top[0]) : '—',
        lastLogin: login ? fmt(login.created_at) : '—',
      })
    })
    return () => { on = false }
  }, [user, tick])

  const view = useMemo(() => q ? logs.filter(l => (l.description || '').toLowerCase().includes(q.toLowerCase())) : logs, [logs, q])
  const pages = Math.max(1, Math.ceil(total / PER))

  const doExport = () => exportCSV(logs.map(l => ({ Data: fmt(l.created_at), Categoria: l.category, Acao: l.action, Descricao: l.description, Pagina: l.page || '' })), 'logs_atividade')
  const doClear = async () => {
    if (!window.confirm('Remover logs com mais de 90 dias? Esta ação não pode ser desfeita.')) return
    try { await logger.clearLogs(user.id, 90) } catch (e) { console.log('[Logs] clear:', e.message) }
    setTick(t => t + 1)
  }

  const st = {
    top: { height: 56, background: C.card, borderBottom: `1px solid ${C.bd}`, display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', flexShrink: 0 },
    ic: { background: 'none', border: 'none', color: C.mut, cursor: 'pointer', display: 'inline-flex', padding: 4 },
    btn: bg => ({ background: bg, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, padding: '8px 14px', cursor: 'pointer', fontFamily: F, display: 'inline-flex', alignItems: 'center', gap: 6 }),
    inp: { background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 8, color: C.tx, fontSize: 13, padding: '7px 10px', fontFamily: F, outline: 'none' },
    stat: { flex: 1, minWidth: 150, background: C.card, border: `1px solid ${C.bd}`, borderRadius: 12, padding: '12px 16px' },
    badge: { fontSize: 10, fontWeight: 700, color: C.pur, background: C.pur + '22', borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' },
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.bg, color: C.tx, fontFamily: F }}>
      <div style={st.top}>
        <button onClick={() => nav('/dashboard')} title="Voltar" style={st.ic}><ArrowLeft size={20} /></button>
        <span style={{ fontSize: 18, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 8 }}><ClipboardList size={20} color={C.pur} /> Logs de Atividade</span>
        <button onClick={doExport} style={{ ...st.btn('#334155'), marginLeft: 'auto' }}><Download size={15} /> Exportar CSV</button>
        <button onClick={doClear} style={st.btn('#EF4444')}><Trash2 size={15} /> Limpar logs antigos</button>
      </div>

      <div style={{ display: 'flex', gap: 10, padding: '12px 20px', borderBottom: `1px solid ${C.bd}`, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <Search size={15} color={C.mut} style={{ position: 'absolute', left: 9 }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por descrição..." style={{ ...st.inp, paddingLeft: 30, width: 240 }} />
        </div>
        <select value={cat} onChange={e => setCat(e.target.value)} style={st.inp}>
          {CATS.map(c => <option key={c.id} value={c.id} style={{ background: C.card }}>{c.label}</option>)}
        </select>
        <label style={{ fontSize: 12, color: C.mut }}>De <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...st.inp, marginLeft: 4 }} /></label>
        <label style={{ fontSize: 12, color: C.mut }}>Até <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ ...st.inp, marginLeft: 4 }} /></label>
      </div>

      <div style={{ display: 'flex', gap: 12, padding: '14px 20px 4px', flexWrap: 'wrap' }}>
        {[['Ações hoje', stats.today], ['Esta semana', stats.week], ['Categoria + frequente', stats.top], ['Último login', stats.lastLogin]].map(([lb, v]) => (
          <div key={lb} style={st.stat}>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: C.mut }}>{lb}</p>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{v}</p>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        {loading ? <p style={{ color: C.mut, textAlign: 'center', marginTop: 40 }}>Carregando...</p>
          : view.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: 60, color: C.mut }}>
              <Inbox size={48} style={{ opacity: .4 }} />
              <p style={{ marginTop: 12, fontSize: 14 }}>Nenhuma atividade registrada</p>
            </div>
          ) : view.map(l => {
            const open = exp === l.id, hasMeta = l.metadata && Object.keys(l.metadata).length > 0
            const Ic = ICON[l.category] || Wrench
            return (
              <div key={l.id} onClick={() => setExp(open ? null : l.id)} onMouseEnter={() => setHover(l.id)} onMouseLeave={() => setHover(null)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 10, background: hover === l.id ? C.bd : C.card, border: `1px solid ${C.bd}`, marginBottom: 8, cursor: 'pointer', transition: 'background .12s' }}>
                <span style={{ width: 34, height: 34, borderRadius: 8, background: C.pur + '22', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic size={17} color={C.pur} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{l.description || l.action}</span>
                    <span style={st.badge}>{l.action}</span>
                  </div>
                  <p style={{ margin: '3px 0 0', fontSize: 11, color: C.mut }}>{l.page || '—'}</p>
                  {open && hasMeta && (
                    <pre style={{ margin: '8px 0 0', background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 8, padding: 10, fontSize: 11, color: C.mut, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(l.metadata, null, 2)}</pre>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ margin: 0, fontSize: 12 }}>{fmt(l.created_at)}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: C.mut }}>{rel(l.created_at)}</p>
                </div>
              </div>
            )
          })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderTop: `1px solid ${C.bd}`, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: C.mut }}>
          {total === 0 ? 'Nenhum registro' : `Mostrando ${page * PER + 1}-${Math.min((page + 1) * PER, total)} de ${total} registros`}
        </span>
        <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} style={{ ...st.btn('#334155'), marginLeft: 'auto', opacity: page === 0 ? .4 : 1 }}>← Anterior</button>
        <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} style={{ ...st.btn('#334155'), opacity: page >= pages - 1 ? .4 : 1 }}>Próximo →</button>
      </div>
    </div>
  )
}
