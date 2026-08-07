import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, UserCheck, Layers, Gauge, Pencil, Trash2, Plus, Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { socket } from '@services/socket'
import { useAuth } from '@context/AuthContext'
import { logger } from '@services/activityLogger'

const C = { bg: '#0F172A', card: '#1E293B', border: '#334155', text: '#F8FAFC',
  muted: '#94A3B8', purple: '#7C3AED', green: '#22C55E', yellow: '#EAB308', gray: '#64748B', red: '#EF4444' }
const F = "'DM Sans', sans-serif"
const ROLES = ['Admin', 'Supervisor', 'Atendente']
const ST = { online: { l: 'Online', c: C.green }, ausente: { l: 'Ausente', c: C.yellow }, offline: { l: 'Offline', c: C.gray } }
const MODES = ['Rodízio', 'Menos ocupado', 'Manual']

// Amostra apenas para o modo demo (somente leitura, não persiste).
const DEMO_MEMBERS = [
  { id: 'd1', name: 'Ana Paula Silva', email: 'ana.silva@riseflow.app', role: 'Admin', status: 'online', conv_limit: 5 },
  { id: 'd2', name: 'Carlos Eduardo Souza', email: 'carlos.souza@riseflow.app', role: 'Supervisor', status: 'online', conv_limit: 5 },
  { id: 'd3', name: 'Mariana Oliveira', email: 'mariana.o@riseflow.app', role: 'Atendente', status: 'ausente', conv_limit: 4 },
]
const DEMO_QUEUES = [
  { id: 'dq1', name: 'Suporte Geral', mode: 'Rodízio', member_ids: ['d1', 'd3'] },
  { id: 'dq2', name: 'Vendas', mode: 'Menos ocupado', member_ids: ['d2'] },
]

const initials = n => (n || '').split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
const inp = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, fontFamily: F, padding: '7px 9px', outline: 'none' }
const cardS = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, fontFamily: F }
const Avatar = ({ name, size = 34 }) => (
  <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, color: '#fff', fontWeight: 700, fontSize: size * 0.36,
    display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${C.purple}, #4F46E5)` }}>{initials(name)}</div>
)

const EMPTY_FORM = { name: '', email: '', role: 'Atendente', conv_limit: 5, queues: [] }

export const Teams = () => {
  const navigate = useNavigate()
  const { user, isDemoMode } = useAuth()

  const [members, setMembers] = useState([])
  const [queues, setQueues] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null) // member sendo editado | null
  const [form, setForm] = useState(EMPTY_FORM)

  const load = useCallback(async () => {
    if (!user || isDemoMode) return
    const [{ data: m }, { data: q }] = await Promise.all([
      supabase.from('team_members').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('team_queues').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
    ])
    setMembers(m ?? [])
    setQueues(q ?? [])
    setLoading(false)
  }, [user, isDemoMode])

  useEffect(() => {
    if (isDemoMode) { setMembers(DEMO_MEMBERS); setQueues(DEMO_QUEUES); setLoading(false); return }
    load()
  }, [user, isDemoMode, load])

  // Presença ao vivo: o servidor emite 'team_status' quando um membro conecta/cai.
  useEffect(() => {
    if (isDemoMode) return
    const onStatus = ({ memberId, status }) => {
      setMembers(prev => prev.map(m => (m.id === memberId ? { ...m, status } : m)))
    }
    socket.on('team_status', onStatus)
    return () => socket.off('team_status', onStatus)
  }, [isDemoMode])

  const guardDemo = () => { if (isDemoMode) { window.alert('Modo demo: crie uma conta para gerenciar sua equipe.'); return true } return false }

  /* ── Membros ── */
  const openAdd  = () => { setEditing(null); setForm(EMPTY_FORM); setOpen(true) }
  const openEdit = (m) => {
    setEditing(m)
    setForm({ name: m.name, email: m.email ?? '', role: m.role, conv_limit: m.conv_limit ?? 5,
      queues: queues.filter(q => (q.member_ids ?? []).includes(m.id)).map(q => q.id) })
    setOpen(true)
  }

  // Sincroniza a participação de um membro nas filas conforme os ids selecionados.
  const syncQueues = async (memberId, selectedIds) => {
    await Promise.all(queues.map(q => {
      const has = (q.member_ids ?? []).includes(memberId)
      const should = selectedIds.includes(q.id)
      if (has === should) return null
      const next = should ? [...(q.member_ids ?? []), memberId] : (q.member_ids ?? []).filter(x => x !== memberId)
      return supabase.from('team_queues').update({ member_ids: next }).eq('id', q.id)
    }))
  }

  const submitMember = async () => {
    if (guardDemo()) return
    if (!form.name.trim() || !form.email.trim() || busy) return
    setBusy(true)
    try {
      const payload = { name: form.name.trim(), email: form.email.trim(), role: form.role, conv_limit: Number(form.conv_limit) || 5 }
      if (editing) {
        await supabase.from('team_members').update(payload).eq('id', editing.id)
        await syncQueues(editing.id, form.queues)
        logger.log(user.id, 'member_updated', { category: 'team', description: 'Membro atualizado: ' + payload.name })
      } else {
        const { data: created, error } = await supabase.from('team_members')
          .insert({ ...payload, user_id: user.id, status: 'offline' }).select().single()
        if (error) { window.alert('Erro ao adicionar membro:\n' + error.message + '\n\n(Rode supabase/team.sql se ainda não rodou.)'); return }
        await syncQueues(created.id, form.queues)
        logger.log(user.id, 'member_added', { category: 'team', description: 'Membro adicionado: ' + payload.name })
      }
      setOpen(false); setForm(EMPTY_FORM); setEditing(null)
      await load()
    } finally { setBusy(false) }
  }

  const patchMember = async (id, k, v) => {
    if (guardDemo()) return
    setMembers(s => s.map(m => m.id === id ? { ...m, [k]: v } : m)) // otimista
    await supabase.from('team_members').update({ [k]: v }).eq('id', id)
    if (k === 'role') { const m = members.find(x => x.id === id); logger.log(user.id, 'role_changed', { category: 'team', description: (m?.name ?? 'Membro') + ' agora é ' + v }) }
  }

  const removeMember = async (m) => {
    if (guardDemo()) return
    if (!window.confirm(`Remover ${m.name} da equipe?`)) return
    await supabase.from('team_members').delete().eq('id', m.id)
    // Remove o membro de todas as filas que o continham.
    await Promise.all(queues.filter(q => (q.member_ids ?? []).includes(m.id))
      .map(q => supabase.from('team_queues').update({ member_ids: q.member_ids.filter(x => x !== m.id) }).eq('id', q.id)))
    logger.log(user.id, 'member_removed', { category: 'team', description: 'Membro removido: ' + m.name })
    await load()
  }

  /* ── Filas ── */
  const addQueue = async () => {
    if (guardDemo()) return
    const name = window.prompt('Nome da nova fila:')
    if (!name?.trim()) return
    const { error } = await supabase.from('team_queues').insert({ user_id: user.id, name: name.trim(), mode: 'Rodízio', member_ids: [] })
    if (error) { window.alert('Erro ao criar fila:\n' + error.message + '\n\n(Rode supabase/team.sql se ainda não rodou.)'); return }
    await load()
  }
  const patchQueue = async (id, k, v) => {
    if (guardDemo()) return
    setQueues(s => s.map(q => q.id === id ? { ...q, [k]: v } : q)) // otimista
    await supabase.from('team_queues').update({ [k]: v }).eq('id', id)
  }
  const removeQueue = async (q) => {
    if (guardDemo()) return
    if (!window.confirm(`Excluir a fila "${q.name}"?`)) return
    await supabase.from('team_queues').delete().eq('id', q.id)
    await load()
  }
  const toggleAssign = async (q, memberId) => {
    if (guardDemo()) return
    const has = (q.member_ids ?? []).includes(memberId)
    const next = has ? q.member_ids.filter(i => i !== memberId) : [...(q.member_ids ?? []), memberId]
    setQueues(s => s.map(x => x.id === q.id ? { ...x, member_ids: next } : x)) // otimista
    await supabase.from('team_queues').update({ member_ids: next }).eq('id', q.id)
  }

  /* ── KPIs reais ── */
  const kpis = useMemo(() => {
    const online = members.filter(m => m.status === 'online').length
    const capacity = members.reduce((a, m) => a + (m.conv_limit || 0), 0)
    return [
      { Icon: Users,     label: 'Total de Membros',  value: members.length },
      { Icon: UserCheck, label: 'Atendentes Online',  value: online },
      { Icon: Layers,    label: 'Filas',              value: queues.length },
      { Icon: Gauge,     label: 'Capacidade Total',   value: `${capacity} conv.` },
    ]
  }, [members, queues])

  const valid = form.name.trim() && form.email.trim()
  const th = { textAlign: 'left', padding: '10px 12px', fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }
  const td = { padding: '10px 12px', fontSize: 13, color: C.text, borderTop: `1px solid ${C.border}` }
  const iBtn = c => ({ background: 'none', border: `1px solid ${C.border}`, borderRadius: 7, cursor: 'pointer', padding: '4px 8px', fontSize: 13, color: c })
  const fQueue = id => setForm(f => ({ ...f, queues: f.queues.includes(id) ? f.queues.filter(x => x !== id) : [...f.queues, id] }))

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: F, color: C.text, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <button onClick={() => navigate('/dashboard')} style={{ ...iBtn(C.text), padding: '7px 12px', fontSize: 16 }}>←</button>
        <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Users size={20} color={C.purple} /> Equipe</h1>
        <span style={{ background: 'rgba(124,58,237,0.15)', color: C.purple, fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 999 }}>{members.length} membros</span>
        <button onClick={openAdd} style={{ marginLeft: 'auto', background: C.purple, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: F, padding: '10px 18px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus size={15} /> Adicionar Membro</button>
      </div>

      {isDemoMode && (
        <div style={{ ...cardS, marginBottom: 16, borderColor: 'rgba(234,179,8,0.27)', background: 'rgba(234,179,8,0.06)', color: C.yellow, fontSize: 13 }}>
          Modo demo — a equipe abaixo é apenas exemplo. Crie uma conta para gerenciar membros e filas de verdade.
        </div>
      )}

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
          <thead><tr>{['Membro', 'Email', 'Cargo', 'Status', 'Limite', 'Ações'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: C.muted, padding: 32 }}><Loader2 size={18} className="animate-spin" style={{ display: 'inline' }} /> Carregando…</td></tr>
            ) : members.length === 0 ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: C.muted, padding: 32 }}>Nenhum membro ainda. Clique em <strong style={{ color: C.purple }}>Adicionar Membro</strong>.</td></tr>
            ) : members.map(m => {
              const isAdmin = m.role === 'Admin'
              return (
                <tr key={m.id}>
                  <td style={td}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Avatar name={m.name} />{m.name}</div></td>
                  <td style={{ ...td, color: C.muted }}>{m.email}</td>
                  <td style={td}><select value={m.role} onChange={e => patchMember(m.id, 'role', e.target.value)} style={inp}>{ROLES.map(r => <option key={r}>{r}</option>)}</select></td>
                  <td style={td}><select value={m.status} onChange={e => patchMember(m.id, 'status', e.target.value)} style={{ ...inp, color: ST[m.status]?.c ?? C.text, fontWeight: 600 }}>{Object.entries(ST).map(([k, v]) => <option key={k} value={k} style={{ color: C.text }}>{v.l}</option>)}</select></td>
                  <td style={{ ...td, textAlign: 'center' }}>{m.conv_limit}</td>
                  <td style={td}><div style={{ display: 'flex', gap: 6 }}>
                    <button title="Editar" onClick={() => openEdit(m)} style={{ ...iBtn(C.muted), display: 'inline-flex', alignItems: 'center' }}><Pencil size={14} /></button>
                    <button title={isAdmin ? 'Admin não pode ser removido' : 'Remover'} onClick={() => removeMember(m)} disabled={isAdmin}
                      style={{ ...iBtn(C.red), opacity: isAdmin ? 0.3 : 1, cursor: isAdmin ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center' }}><Trash2 size={14} /></button>
                  </div></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Filas de Atendimento</h2>
        <button onClick={addQueue} style={{ ...iBtn(C.purple), display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px' }}><Plus size={14} /> Nova Fila</button>
      </div>
      {queues.length === 0 && !loading ? (
        <div style={{ ...cardS, color: C.muted, fontSize: 13 }}>Nenhuma fila criada. Clique em <strong style={{ color: C.purple }}>Nova Fila</strong> para distribuir os atendimentos.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {queues.map(q => (
            <div key={q.id} style={cardS}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <input value={q.name} onChange={e => setQueues(s => s.map(x => x.id === q.id ? { ...x, name: e.target.value } : x))} onBlur={e => patchQueue(q.id, 'name', e.target.value)} style={{ ...inp, flex: 1, fontWeight: 700, fontSize: 14 }} />
                <span style={{ background: 'rgba(124,58,237,0.15)', color: C.purple, fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{(q.member_ids ?? []).length} atend.</span>
                <button title="Excluir fila" onClick={() => removeQueue(q)} style={{ ...iBtn(C.red), display: 'inline-flex', alignItems: 'center' }}><X size={13} /></button>
              </div>
              <div style={{ display: 'flex', marginBottom: 10, minHeight: 28 }}>
                {(q.member_ids ?? []).map(id => { const m = members.find(x => x.id === id); return m ? <div key={id} style={{ marginRight: -8 }}><Avatar name={m.name} size={28} /></div> : null })}
              </div>
              <label style={{ fontSize: 11, color: C.muted }}>Distribuição</label>
              <select value={q.mode} onChange={e => patchQueue(q.id, 'mode', e.target.value)} style={{ ...inp, width: '100%', margin: '4px 0 12px' }}>{MODES.map(mo => <option key={mo}>{mo}</option>)}</select>
              <div style={{ display: 'grid', gap: 6, maxHeight: 130, overflowY: 'auto' }}>
                {members.length === 0 ? <span style={{ fontSize: 12, color: C.muted }}>Adicione membros para atribuir.</span> : members.map(m => (
                  <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={(q.member_ids ?? []).includes(m.id)} onChange={() => toggleAssign(q, m.id)} style={{ accentColor: C.purple }} />{m.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...cardS, width: 420, maxWidth: '100%', display: 'grid', gap: 12 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700 }}>{editing ? 'Editar Membro' : 'Adicionar Membro'}</h3>
            <input placeholder="Nome completo" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inp} />
            <input placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inp} />
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={inp}>{ROLES.map(r => <option key={r}>{r}</option>)}</select>
            <div>
              <label style={{ fontSize: 12, color: C.muted }}>Filas</label>
              <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
                {queues.length === 0 ? <span style={{ fontSize: 12, color: C.muted }}>Nenhuma fila criada ainda.</span> : queues.map(q => (
                  <label key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.queues.includes(q.id)} onChange={() => fQueue(q.id)} style={{ accentColor: C.purple }} />{q.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.muted }}>Limite de conversas simultâneas</label>
              <input type="number" min={1} value={form.conv_limit} onChange={e => setForm(f => ({ ...f, conv_limit: Number(e.target.value) }))} style={{ ...inp, width: '100%', marginTop: 6 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button onClick={() => setOpen(false)} style={{ ...iBtn(C.text), padding: '9px 16px', fontSize: 14 }}>Cancelar</button>
              <button onClick={submitMember} disabled={!valid || busy} style={{ background: C.purple, border: 'none', borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: F, padding: '9px 18px', cursor: (valid && !busy) ? 'pointer' : 'not-allowed', opacity: (valid && !busy) ? 1 : 0.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {busy && <Loader2 size={14} className="animate-spin" />}{editing ? 'Salvar' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
