// Ligações — registro/telemetria de chamadas (tabela calls, ver supabase/calls.sql).
// Escopo por ownerUserId (equipe vê o mesmo). KPIs no espírito do painel de vendas.
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Layout } from '@components/Layout/Layout'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { Plus, Loader2, X, Trash2, Phone, PhoneCall, PhoneIncoming, PhoneOutgoing, TrendingUp, CheckCircle2 } from 'lucide-react'

const C = { bg: 'var(--bg)', card: 'var(--card)', bd: 'var(--border)', tx: 'var(--ink-1)', mut: 'var(--ink-3)', pur: '#7C3AED',
  green: '#22C55E', yellow: '#EAB308', red: '#EF4444', blue: '#3B82F6', gray: 'var(--ink-4)' }
const F = "'DM Sans', sans-serif"
const inp = { background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 8, color: C.tx, fontSize: 13, fontFamily: F, padding: '9px 11px', outline: 'none', width: '100%', boxSizing: 'border-box' }
const cardS = { background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 18, fontFamily: F }

const OUTCOMES = {
  connected: { label: 'Atendida', color: C.blue, answered: true },
  scheduled: { label: 'Agendada', color: C.pur, answered: true },
  won:       { label: 'Convertida', color: C.green, answered: true },
  lost:      { label: 'Perdida', color: C.red, answered: true },
  no_answer: { label: 'Não atendida', color: C.gray, answered: false },
  busy:      { label: 'Ocupado', color: C.gray, answered: false },
  voicemail: { label: 'Caixa postal', color: C.gray, answered: false },
}
const fmtDur = (s) => { const m = Math.floor((s || 0) / 60), r = (s || 0) % 60; return `${m}:${String(r).padStart(2, '0')}` }

const DEMO = [
  { id: 'd1', contact_name: 'Ana Lima', phone: '5511987654321', direction: 'outbound', outcome: 'won', duration_sec: 320, created_at: new Date().toISOString() },
  { id: 'd2', contact_name: 'Bruno Martins', phone: '5511912345678', direction: 'outbound', outcome: 'no_answer', duration_sec: 0, created_at: new Date().toISOString() },
  { id: 'd3', contact_name: 'Carla Souza', phone: '5511998877665', direction: 'inbound', outcome: 'scheduled', duration_sec: 145, created_at: new Date().toISOString() },
]

const EMPTY = { client_id: '', contact_name: '', phone: '', direction: 'outbound', outcome: 'connected', duration_min: '', notes: '' }

export const Calls = () => {
  const { ownerUserId, isDemoMode } = useAuth()
  const [rows, setRows] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [filter, setFilter] = useState('all') // all|answered|won|lost|scheduled
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const load = useCallback(async () => {
    if (isDemoMode) { setRows(DEMO); setLoading(false); return }
    if (!ownerUserId) return
    const [{ data: cl }, { data: cli }] = await Promise.all([
      supabase.from('calls').select('*').eq('user_id', ownerUserId).order('created_at', { ascending: false }),
      supabase.from('clients').select('id,name,phone').eq('user_id', ownerUserId).order('name', { ascending: true }),
    ])
    setRows(cl || [])
    setClients(cli || [])
    setLoading(false)
  }, [ownerUserId, isDemoMode])
  useEffect(() => { load() }, [load])

  const guardDemo = () => { if (isDemoMode) { window.alert('Modo demo: crie uma conta para registrar ligações.'); return true } return false }

  const kpis = useMemo(() => {
    const total = rows.length
    const answered = rows.filter(r => OUTCOMES[r.outcome]?.answered).length
    const won = rows.filter(r => r.outcome === 'won').length
    const lost = rows.filter(r => r.outcome === 'lost').length
    const rate = total ? Math.round(answered / total * 100) : 0
    return [
      { label: 'Total de ligações', value: String(total), color: C.blue, Icon: PhoneCall },
      { label: 'Taxa de conexão', value: `${rate}%`, color: C.green, Icon: TrendingUp, hint: `${answered} atendidas` },
      { label: 'Convertidas', value: String(won), color: C.pur, Icon: CheckCircle2 },
      { label: 'Perdidas', value: String(lost), color: C.red, Icon: Phone },
    ]
  }, [rows])

  const filtered = rows.filter(r => {
    if (filter === 'all') return true
    if (filter === 'answered') return OUTCOMES[r.outcome]?.answered
    return r.outcome === filter
  })

  const onPickClient = (id) => {
    const c = clients.find(x => x.id === id)
    setForm(p => ({ ...p, client_id: id, contact_name: c ? c.name : p.contact_name, phone: c?.phone || p.phone }))
  }

  const save = async () => {
    if (guardDemo()) return
    if (!form.contact_name.trim() && !form.phone.trim() && !form.client_id) { window.alert('Informe o contato (cliente, nome ou telefone).'); return }
    if (busy) return
    setBusy(true)
    const c = clients.find(x => x.id === form.client_id)
    const payload = {
      user_id: ownerUserId, client_id: form.client_id || null,
      contact_name: (c?.name || form.contact_name).trim() || null, phone: (form.phone || c?.phone || '').trim() || null,
      direction: form.direction, outcome: form.outcome,
      duration_sec: Math.round((Number(form.duration_min) || 0) * 60), notes: form.notes.trim() || null,
    }
    const { data, error } = await supabase.from('calls').insert(payload).select().single()
    setBusy(false)
    if (error) { window.alert('Erro ao registrar:\n' + error.message + '\n\n(Rode supabase/calls.sql se ainda não rodou.)'); return }
    setRows(r => [data, ...r]); setModal(false); setForm(EMPTY)
  }
  const del = async (r) => {
    if (guardDemo()) return
    if (!window.confirm('Excluir este registro de ligação?')) return
    setRows(x => x.filter(i => i.id !== r.id))
    await supabase.from('calls').delete().eq('id', r.id)
  }

  const FILTERS = [['all', 'Todas'], ['answered', 'Atendidas'], ['scheduled', 'Agendadas'], ['won', 'Convertidas'], ['lost', 'Perdidas']]

  return (
    <Layout title="Ligações" subtitle="Registro e desempenho das chamadas">
      {isDemoMode && (
        <div style={{ ...cardS, marginBottom: 16, borderColor: 'rgba(234,179,8,0.27)', background: 'rgba(234,179,8,0.07)', color: C.yellow, fontSize: 13 }}>
          Modo demo — as ligações abaixo são apenas exemplo. Crie uma conta para registrar de verdade.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 16 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...cardS, borderLeft: `3px solid ${k.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.mut, fontSize: 12 }}><k.Icon size={14} color={k.color} /> {k.label}</div>
            <p style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 800, color: C.tx, fontVariantNumeric: 'tabular-nums' }}>{k.value}</p>
            {k.hint && <p style={{ margin: '2px 0 0', fontSize: 11, color: k.color, fontWeight: 600 }}>{k.hint}</p>}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: C.card, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 3 }}>
          {FILTERS.map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)} style={{ border: 'none', cursor: 'pointer', borderRadius: 7, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, fontFamily: F, background: filter === id ? C.pur : 'transparent', color: filter === id ? '#fff' : C.mut }}>{label}</button>
          ))}
        </div>
        <button onClick={() => { if (!guardDemo()) { setForm(EMPTY); setModal(true) } }} style={{ marginLeft: 'auto', background: C.pur, border: 'none', borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: F, padding: '9px 16px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus size={16} /> Registrar ligação</button>
      </div>

      {loading ? (
        <div style={{ ...cardS, textAlign: 'center', color: C.mut }}>Carregando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...cardS, textAlign: 'center', color: C.mut }}>Nenhuma ligação {filter !== 'all' ? 'neste filtro' : 'registrada ainda'}.</div>
      ) : (
        <div style={{ ...cardS, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: F }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.bd}` }}>
                  {['Contato', 'Direção', 'Resultado', 'Duração', 'Quando', ''].map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '12px 14px', fontSize: 11, color: C.mut, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const o = OUTCOMES[r.outcome] || { label: r.outcome, color: C.gray }
                  const Dir = r.direction === 'inbound' ? PhoneIncoming : PhoneOutgoing
                  const d = r.created_at ? new Date(r.created_at) : null
                  return (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${C.bd}66` }}>
                      <td style={{ padding: '11px 14px' }}>
                        <p style={{ margin: 0, fontSize: 13, color: C.tx, fontWeight: 600 }}>{r.contact_name || '—'}</p>
                        {r.phone && <p style={{ margin: 0, fontSize: 11, color: C.mut }}>{r.phone}</p>}
                      </td>
                      <td style={{ padding: '11px 14px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.mut }}><Dir size={13} /> {r.direction === 'inbound' ? 'Recebida' : 'Feita'}</span></td>
                      <td style={{ padding: '11px 14px' }}><span style={{ fontSize: 11, fontWeight: 700, color: o.color, background: o.color + '1c', border: `1px solid ${o.color}44`, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>{o.label}</span></td>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: C.tx, fontVariantNumeric: 'tabular-nums' }}>{fmtDur(r.duration_sec)}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: C.mut, whiteSpace: 'nowrap' }}>{d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right' }}>
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

      {modal && (
        <div onClick={() => setModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...cardS, width: 460, maxWidth: '100%', display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Registrar ligação</h3>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mut }}><X size={18} /></button>
            </div>
            {clients.length > 0 && (
              <div>
                <label style={{ fontSize: 11, color: C.mut, fontWeight: 600 }}>Cliente</label>
                <select value={form.client_id} onChange={e => onPickClient(e.target.value)} style={{ ...inp, appearance: 'none' }}>
                  <option value="" style={{ background: C.card }}>— avulso / digitar abaixo —</option>
                  {clients.map(c => <option key={c.id} value={c.id} style={{ background: C.card }}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label style={{ fontSize: 11, color: C.mut, fontWeight: 600 }}>Nome</label><input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Contato" style={inp} /></div>
              <div style={{ flex: 1 }}><label style={{ fontSize: 11, color: C.mut, fontWeight: 600 }}>Telefone</label><input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="55 11 9..." style={inp} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: C.mut, fontWeight: 600 }}>Direção</label>
                <select value={form.direction} onChange={e => set('direction', e.target.value)} style={{ ...inp, appearance: 'none' }}>
                  <option value="outbound" style={{ background: C.card }}>Feita</option>
                  <option value="inbound" style={{ background: C.card }}>Recebida</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: C.mut, fontWeight: 600 }}>Resultado</label>
                <select value={form.outcome} onChange={e => set('outcome', e.target.value)} style={{ ...inp, appearance: 'none' }}>
                  {Object.entries(OUTCOMES).map(([id, o]) => <option key={id} value={id} style={{ background: C.card }}>{o.label}</option>)}
                </select>
              </div>
              <div style={{ width: 110, flexShrink: 0 }}><label style={{ fontSize: 11, color: C.mut, fontWeight: 600 }}>Duração (min)</label><input type="number" step="0.5" value={form.duration_min} onChange={e => set('duration_min', e.target.value)} placeholder="0" style={inp} /></div>
            </div>
            <div><label style={{ fontSize: 11, color: C.mut, fontWeight: 600 }}>Observação</label><textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="O que foi conversado..." style={{ ...inp, resize: 'vertical' }} /></div>
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

export default Calls
