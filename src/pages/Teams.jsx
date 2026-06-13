import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, UserCheck, MessageCircle, Clock, Star, Pencil, Trash2 } from 'lucide-react'
import { logger } from '@services/activityLogger'

const C = { bg: '#0F172A', card: '#1E293B', border: '#334155', text: '#F8FAFC',
  muted: '#94A3B8', purple: '#7C3AED', green: '#22C55E', yellow: '#EAB308', gray: '#64748B', red: '#EF4444' }
const F = "'DM Sans', sans-serif"
const ROLES = ['Admin', 'Supervisor', 'Atendente']
const ST = { online: { l: 'Online', c: C.green }, ausente: { l: 'Ausente', c: C.yellow }, offline: { l: 'Offline', c: C.gray } }
const QNAMES = ['Suporte Geral', 'Vendas', 'Financeiro']
const MODES = ['Rodízio', 'Menos ocupado', 'Manual']
const seedMembers = [
  { id: 1, name: 'Ana Paula Silva', email: 'ana.silva@riseflow.app', role: 'Admin', status: 'online', conv: 4, rating: 4.9 },
  { id: 2, name: 'Carlos Eduardo Souza', email: 'carlos.souza@riseflow.app', role: 'Supervisor', status: 'online', conv: 3, rating: 4.6 },
  { id: 3, name: 'Mariana Oliveira', email: 'mariana.o@riseflow.app', role: 'Atendente', status: 'ausente', conv: 2, rating: 4.8 },
  { id: 4, name: 'Roberto Santos', email: 'roberto.santos@riseflow.app', role: 'Atendente', status: 'offline', conv: 0, rating: 4.5 },
  { id: 5, name: 'Juliana Costa', email: 'juliana.costa@riseflow.app', role: 'Atendente', status: 'online', conv: 5, rating: 4.7 },
  { id: 6, name: 'Fernando Almeida', email: 'fernando.a@riseflow.app', role: 'Atendente', status: 'online', conv: 1, rating: 4.4 },
]
const seedQueues = [
  { id: 'q1', name: 'Suporte Geral', waiting: 7, mode: 'Rodízio', assigned: [1, 3, 5] },
  { id: 'q2', name: 'Vendas', waiting: 3, mode: 'Menos ocupado', assigned: [2, 6] },
  { id: 'q3', name: 'Financeiro', waiting: 1, mode: 'Manual', assigned: [2, 4] },
]
const initials = n => n.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
const inp = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, fontFamily: F, padding: '7px 9px', outline: 'none' }
const cardS = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, fontFamily: F }
const Avatar = ({ name, size = 34 }) => (
  <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, color: '#fff', fontWeight: 700, fontSize: size * 0.36,
    display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${C.purple}, #4F46E5)` }}>{initials(name)}</div>
)
const Stars = ({ r }) => {
  const n = Math.round(r)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, whiteSpace: 'nowrap' }}>
      {[1, 2, 3, 4, 5].map(i => <Star key={i} size={13} color={C.yellow} fill={i <= n ? C.yellow : 'none'} />)}
      <span style={{ color: C.muted, marginLeft: 5, fontSize: 13 }}>{r ? r.toFixed(1) : '—'}</span>
    </span>
  )
}

export const Teams = () => {
  const navigate = useNavigate()
  const [members, setMembers] = useState(seedMembers)
  const [queues, setQueues] = useState(seedQueues)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'Atendente', queues: [], limit: 5 })

  const online = members.filter(m => m.status === 'online').length
  const rated = members.filter(m => m.rating > 0)
  const avg = rated.length ? (rated.reduce((a, m) => a + m.rating, 0) / rated.length).toFixed(1) : '0.0'
  const kpis = [
    { Icon: UserCheck, label: 'Atendentes Online', value: online },
    { Icon: MessageCircle, label: 'Conversas Ativas', value: members.reduce((a, m) => a + m.conv, 0) },
    { Icon: Clock, label: 'Tempo Médio Atendimento', value: '4min' },
    { Icon: Star, label: 'Satisfação', value: `${avg}/5` },
  ]
  const patch = (id, k, v) => setMembers(s => s.map(m => m.id === id ? { ...m, [k]: v } : m))
  const remove = m => {
    if (m.role === 'Admin') return
    if (window.confirm(`Remover ${m.name} da equipe?`)) {
      logger.log(null, 'member_removed', { category: 'team', description: 'Membro removido: ' + m.name })
      setMembers(s => s.filter(x => x.id !== m.id))
      setQueues(qs => qs.map(q => ({ ...q, assigned: q.assigned.filter(id => id !== m.id) })))
    }
  }
  const toggleAssign = (qid, mid) => setQueues(qs => qs.map(q => q.id !== qid ? q
    : { ...q, assigned: q.assigned.includes(mid) ? q.assigned.filter(i => i !== mid) : [...q.assigned, mid] }))
  const setQ = (qid, k, v) => setQueues(qs => qs.map(q => q.id === qid ? { ...q, [k]: v } : q))
  const fQueue = n => setForm(f => ({ ...f, queues: f.queues.includes(n) ? f.queues.filter(x => x !== n) : [...f.queues, n] }))
  const submit = () => {
    if (!form.name.trim() || !form.email.trim()) return
    const id = Date.now()
    setMembers(s => [...s, { id, name: form.name.trim(), email: form.email.trim(), role: form.role, status: 'offline', conv: 0, rating: 0, limit: form.limit }])
    logger.log(null, 'member_added', { category: 'team', description: 'Membro adicionado: ' + form.name.trim() })
    setQueues(qs => qs.map(q => form.queues.includes(q.name) ? { ...q, assigned: [...q.assigned, id] } : q))
    setForm({ name: '', email: '', role: 'Atendente', queues: [], limit: 5 })
    setOpen(false)
  }
  const valid = form.name.trim() && form.email.trim()
  const th = { textAlign: 'left', padding: '10px 12px', fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }
  const td = { padding: '10px 12px', fontSize: 13, color: C.text, borderTop: `1px solid ${C.border}` }
  const iBtn = c => ({ background: 'none', border: `1px solid ${C.border}`, borderRadius: 7, cursor: 'pointer', padding: '4px 8px', fontSize: 13, color: c })

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: F, color: C.text, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <button onClick={() => navigate('/dashboard')} style={{ ...iBtn(C.text), padding: '7px 12px', fontSize: 16 }}>←</button>
        <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Users size={20} color={C.purple} /> Equipe</h1>
        <span style={{ background: 'rgba(124,58,237,0.15)', color: C.purple, fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 999 }}>{members.length} membros</span>
        <button onClick={() => setOpen(true)} style={{ marginLeft: 'auto', background: C.purple, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: F, padding: '10px 18px', cursor: 'pointer' }}>+ Adicionar Membro</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {kpis.map(k => (
          <div key={k.label} style={cardS}>
            <div><k.Icon size={22} color={C.purple} /></div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>{k.value}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ ...cardS, padding: 0, marginBottom: 24, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Membro', 'Email', 'Cargo', 'Status', 'Conversas', 'Avaliação', 'Ações'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id}>
                <td style={td}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Avatar name={m.name} />{m.name}</div></td>
                <td style={{ ...td, color: C.muted }}>{m.email}</td>
                <td style={td}><select value={m.role} onChange={e => { patch(m.id, 'role', e.target.value); logger.log(null, 'role_changed', { category: 'team', description: m.name + ' agora é ' + e.target.value }) }} style={inp}>{ROLES.map(r => <option key={r}>{r}</option>)}</select></td>
                <td style={td}><select value={m.status} onChange={e => patch(m.id, 'status', e.target.value)} style={{ ...inp, color: ST[m.status].c, fontWeight: 600 }}>{Object.entries(ST).map(([k, v]) => <option key={k} value={k} style={{ color: C.text }}>{v.l}</option>)}</select></td>
                <td style={{ ...td, textAlign: 'center' }}>{m.conv}</td>
                <td style={td}><Stars r={m.rating} /></td>
                <td style={td}><div style={{ display: 'flex', gap: 6 }}>
                  <button title="Editar" style={{ ...iBtn(C.muted), display: 'inline-flex', alignItems: 'center' }}><Pencil size={14} /></button>
                  <button title={m.role === 'Admin' ? 'Admin não pode ser removido' : 'Remover'} onClick={() => remove(m)} disabled={m.role === 'Admin'}
                    style={{ ...iBtn(C.red), opacity: m.role === 'Admin' ? 0.3 : 1, cursor: m.role === 'Admin' ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center' }}><Trash2 size={14} /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>Filas de Atendimento</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {queues.map(q => (
          <div key={q.id} style={cardS}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <input value={q.name} onChange={e => setQ(q.id, 'name', e.target.value)} style={{ ...inp, flex: 1, fontWeight: 700, fontSize: 14 }} />
              <span style={{ background: 'rgba(234,179,8,0.15)', color: C.yellow, fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{q.waiting} aguardando</span>
            </div>
            <div style={{ display: 'flex', marginBottom: 10 }}>
              {q.assigned.map(id => { const m = members.find(x => x.id === id); return m ? <div key={id} style={{ marginRight: -8 }}><Avatar name={m.name} size={28} /></div> : null })}
            </div>
            <label style={{ fontSize: 11, color: C.muted }}>Distribuição</label>
            <select value={q.mode} onChange={e => setQ(q.id, 'mode', e.target.value)} style={{ ...inp, width: '100%', margin: '4px 0 12px' }}>{MODES.map(mo => <option key={mo}>{mo}</option>)}</select>
            <div style={{ display: 'grid', gap: 6, maxHeight: 130, overflowY: 'auto' }}>
              {members.map(m => (
                <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={q.assigned.includes(m.id)} onChange={() => toggleAssign(q.id, m.id)} style={{ accentColor: C.purple }} />{m.name}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...cardS, width: 420, maxWidth: '100%', display: 'grid', gap: 12 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700 }}>Adicionar Membro</h3>
            <input placeholder="Nome completo" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inp} />
            <input placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inp} />
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={inp}>{ROLES.map(r => <option key={r}>{r}</option>)}</select>
            <div>
              <label style={{ fontSize: 12, color: C.muted }}>Filas</label>
              <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
                {QNAMES.map(n => (
                  <label key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.queues.includes(n)} onChange={() => fQueue(n)} style={{ accentColor: C.purple }} />{n}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.muted }}>Limite de conversas simultâneas</label>
              <input type="number" min={1} value={form.limit} onChange={e => setForm(f => ({ ...f, limit: Number(e.target.value) }))} style={{ ...inp, width: '100%', marginTop: 6 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button onClick={() => setOpen(false)} style={{ ...iBtn(C.text), padding: '9px 16px', fontSize: 14 }}>Cancelar</button>
              <button onClick={submit} disabled={!valid} style={{ background: C.purple, border: 'none', borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: F, padding: '9px 18px', cursor: 'pointer', opacity: valid ? 1 : 0.5 }}>Adicionar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
