import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { usePeriod } from '@hooks/usePeriod'
import { periodRange, brl } from '@lib/metrics'
import { Layout } from '@components/Layout/Layout'
import { FileText, Plus, Send, Check, X, Clock, Eye, Trash2, ChevronDown } from 'lucide-react'

const C = { bg: 'var(--bg)', card: 'var(--card)', bd: 'var(--border)', tx: 'var(--ink-1)', mut: 'var(--ink-4)', pur: '#7C3AED', org: '#FF6B35' }

const STATUS = {
  draft: { label: 'Rascunho', color: '#94A3B8', icon: Clock },
  sent: { label: 'Enviada', color: '#3B82F6', icon: Send },
  accepted: { label: 'Aceita', color: '#22C55E', icon: Check },
  rejected: { label: 'Recusada', color: '#EF4444', icon: X },
}

const DEMO_PROPOSALS = [
  { id: 1, title: 'Website institucional', client_name: 'Ana Paula Silva', value: 8500, status: 'accepted', created_at: '2026-09-10T10:00:00Z', valid_until: '2026-10-10' },
  { id: 2, title: 'Campanha Google Ads', client_name: 'Carlos Eduardo', value: 3200, status: 'sent', created_at: '2026-09-15T14:00:00Z', valid_until: '2026-10-15' },
  { id: 3, title: 'Identidade visual', client_name: 'Marina Rodrigues', value: 12000, status: 'draft', created_at: '2026-09-18T09:00:00Z', valid_until: '2026-10-18' },
  { id: 4, title: 'Social media 3 meses', client_name: 'Roberto Santos', value: 4500, status: 'rejected', created_at: '2026-09-05T16:00:00Z', valid_until: '2026-10-05' },
  { id: 5, title: 'Landing page + funil', client_name: 'Julia Ferreira', value: 6800, status: 'sent', created_at: '2026-09-12T11:00:00Z', valid_until: '2026-10-12' },
]

const Badge = ({ status }) => {
  const s = STATUS[status] || STATUS.draft
  const Icon = s.icon
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, background: s.color + '18', color: s.color, fontSize: 11, fontWeight: 700 }}>
      <Icon size={12} /> {s.label}
    </span>
  )
}

const KPI = ({ label, value, sub, color }) => (
  <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: '16px 18px', flex: 1, minWidth: 140 }}>
    <p style={{ margin: 0, fontSize: 12, color: C.mut }}>{label}</p>
    <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 800, color: color || C.tx }}>{value}</p>
    {sub && <p style={{ margin: '4px 0 0', fontSize: 11, color: C.mut }}>{sub}</p>}
  </div>
)

export const Proposals = () => {
  const { ownerUserId, isDemoMode } = useAuth()
  const { period, setPeriod, options: periodOptions } = usePeriod()
  const [proposals, setProposals] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', client_name: '', value: '', valid_until: '', items: '' })

  useEffect(() => {
    if (isDemoMode) { setLoading(false); return }
    if (!ownerUserId) return
    ;(async () => {
      setLoading(true)
      const [{ data: props }, { data: cls }] = await Promise.all([
        supabase.from('proposals').select('*').eq('user_id', ownerUserId).order('created_at', { ascending: false }),
        supabase.from('clients').select('id, name, phone').eq('user_id', ownerUserId).order('name'),
      ])
      setProposals(props ?? [])
      setClients(cls ?? [])
      setLoading(false)
    })()
  }, [ownerUserId, isDemoMode])

  const list = isDemoMode ? DEMO_PROPOSALS : proposals
  const start = periodRange(period).start
  const filtered = list.filter(p => new Date(p.created_at).getTime() >= start)

  const stats = useMemo(() => {
    const total = filtered.length
    const totalValue = filtered.reduce((s, p) => s + (Number(p.value) || 0), 0)
    const accepted = filtered.filter(p => p.status === 'accepted')
    const acceptedValue = accepted.reduce((s, p) => s + (Number(p.value) || 0), 0)
    const convRate = total > 0 ? (accepted.length / total * 100) : 0
    return { total, totalValue, acceptedCount: accepted.length, acceptedValue, convRate }
  }, [filtered])

  const handleSave = async () => {
    if (isDemoMode || !form.title.trim()) return
    const payload = {
      user_id: ownerUserId,
      title: form.title.trim(),
      client_name: form.client_name.trim(),
      value: Number(form.value) || 0,
      valid_until: form.valid_until || null,
      items: form.items.trim() || null,
      status: 'draft',
    }
    const { data, error } = await supabase.from('proposals').insert(payload).select().single()
    if (!error && data) {
      setProposals(p => [data, ...p])
      setForm({ title: '', client_name: '', value: '', valid_until: '', items: '' })
      setShowForm(false)
    }
  }

  const updateStatus = async (id, status) => {
    if (isDemoMode) return
    const { error } = await supabase.from('proposals').update({ status }).eq('id', id)
    if (!error) setProposals(p => p.map(x => x.id === id ? { ...x, status } : x))
  }

  const deleteProposal = async (id) => {
    if (isDemoMode) return
    const { error } = await supabase.from('proposals').delete().eq('id', id)
    if (!error) setProposals(p => p.filter(x => x.id !== id))
  }

  const inputStyle = { width: '100%', background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 8, padding: '8px 12px', color: C.tx, fontSize: 13, outline: 'none', fontFamily: 'inherit' }
  const td = { padding: '12px 10px', borderTop: `1px solid ${C.bd}`, textAlign: 'left', fontSize: 13 }
  const th = { padding: '8px 10px', fontSize: 11, color: C.mut, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }

  return (
    <Layout title="Propostas" subtitle="Orçamentos e contratos">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <button onClick={() => setShowForm(f => !f)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: 'none', background: C.org, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          <Plus size={16} /> Nova proposta
        </button>
        <div className="rf-seg" role="group">
          {periodOptions.map(o => <button key={o.key} aria-pressed={period === o.key} onClick={() => setPeriod(o.key)}>{o.label}</button>)}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
        <KPI label="Total de propostas" value={stats.total} />
        <KPI label="Valor total" value={brl(stats.totalValue)} color={C.pur} />
        <KPI label="Aceitas" value={stats.acceptedCount} sub={brl(stats.acceptedValue)} color="#22C55E" />
        <KPI label="Taxa de conversão" value={stats.convRate.toFixed(0) + '%'} color={C.org} />
      </div>

      {/* Formulário */}
      {showForm && (
        <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <p className="rf-section-title" style={{ marginBottom: 14 }}>Nova proposta</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: C.mut, marginBottom: 4, display: 'block' }}>Título *</label>
              <input style={inputStyle} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Website institucional" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.mut, marginBottom: 4, display: 'block' }}>Cliente</label>
              <input style={inputStyle} value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} placeholder="Nome do cliente" list="proposal-clients" />
              <datalist id="proposal-clients">{clients.map(c => <option key={c.id} value={c.name} />)}</datalist>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.mut, marginBottom: 4, display: 'block' }}>Valor (R$)</label>
              <input type="number" min={0} style={inputStyle} value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.mut, marginBottom: 4, display: 'block' }}>Válido até</label>
              <input type="date" style={inputStyle} value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: C.mut, marginBottom: 4, display: 'block' }}>Itens / Descrição</label>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={form.items} onChange={e => setForm(f => ({ ...f, items: e.target.value }))} placeholder="Descreva os itens ou serviços inclusos…" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={!form.title.trim()} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: C.org, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: form.title.trim() ? 1 : 0.5 }}>Salvar rascunho</button>
            <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.bd}`, background: 'transparent', color: C.mut, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Tabela de propostas */}
      {loading ? (
        <div style={{ textAlign: 'center', color: C.mut, padding: 40 }}>Carregando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 40, textAlign: 'center' }}>
          <FileText size={32} color={C.mut} style={{ marginBottom: 12 }} />
          <p style={{ color: C.mut, fontSize: 14 }}>Nenhuma proposta neste período</p>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 20 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead><tr>
                {['Proposta', 'Cliente', 'Valor', 'Status', 'Validade', 'Ações'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {filtered.map(p => {
                  const expired = p.valid_until && new Date(p.valid_until) < new Date() && p.status !== 'accepted' && p.status !== 'rejected'
                  return (
                    <tr key={p.id}>
                      <td style={{ ...td, fontWeight: 600 }}>{p.title}</td>
                      <td style={td}>{p.client_name || '—'}</td>
                      <td style={{ ...td, fontWeight: 700, color: C.pur }}>{brl(Number(p.value) || 0)}</td>
                      <td style={td}><Badge status={p.status} /></td>
                      <td style={{ ...td, color: expired ? '#EF4444' : C.mut, fontSize: 12 }}>
                        {p.valid_until ? new Date(p.valid_until).toLocaleDateString('pt-BR') : '—'}
                        {expired && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#EF4444' }}>EXPIRADA</span>}
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {p.status === 'draft' && (
                            <button onClick={() => updateStatus(p.id, 'sent')} title="Marcar como enviada" style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.bd}`, background: 'transparent', color: '#3B82F6', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
                              <Send size={12} /> Enviar
                            </button>
                          )}
                          {p.status === 'sent' && (
                            <>
                              <button onClick={() => updateStatus(p.id, 'accepted')} title="Aceita" style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.bd}`, background: 'transparent', color: '#22C55E', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
                                <Check size={12} /> Aceita
                              </button>
                              <button onClick={() => updateStatus(p.id, 'rejected')} title="Recusada" style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.bd}`, background: 'transparent', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
                                <X size={12} /> Recusada
                              </button>
                            </>
                          )}
                          {p.status === 'draft' && (
                            <button onClick={() => deleteProposal(p.id)} title="Excluir" style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.bd}`, background: 'transparent', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', fontSize: 11 }}>
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  )
}
