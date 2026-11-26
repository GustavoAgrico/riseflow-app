// IA Central → "Ações no CRM": modo (desligado/automático/com aprovação) e fila
// de ações pedidas pela IA. Executar/recusar passa pelo servidor (/api/ai/actions).
import React, { useEffect, useState } from 'react'
import { Zap, Check, X, RefreshCw } from 'lucide-react'
import { api } from '@services/api'

const C = { bg: 'var(--bg)', card: 'var(--card)', bd: 'var(--border)', tx: 'var(--ink-1)', mut: 'var(--ink-4)', pur: '#7C3AED' }
const STATUS = { pending: ['Aguardando', '#EAB308'], approved: ['Executando', '#3B82F6'], executed: ['Feita', '#10B981'], failed: ['Falhou', '#EF4444'], rejected: ['Recusada', '#94A3B8'] }

export const AiActionsPanel = ({ mode, onModeChange, isDemoMode }) => {
  const [rows, setRows] = useState([])
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(null)

  const load = async () => {
    if (isDemoMode) return
    try { const { data } = await api.get('/api/ai/actions'); setRows(data.actions || []); setMissing(!!data.missing) }
    catch (e) { console.warn('[IA ações] lista falhou:', e?.message ?? e) }
  }
  useEffect(() => { load() }, [isDemoMode])

  const decide = async (id, ok) => {
    setBusy(id)
    try { await api.post(`/api/ai/actions/${id}/${ok ? 'approve' : 'reject'}`) }
    catch (e) { window.alert(e?.response?.data?.error || e.message) }
    setBusy(null); load()
  }

  const box = { background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 20, marginBottom: 18 }
  const btn = (bg) => ({ background: bg, border: 'none', borderRadius: 8, padding: '6px 10px', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 })
  return (
    <div style={box}>
      <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}><Zap size={16} color="#FF6B35" /> Ações no CRM</h3>
      <p style={{ fontSize: 12, color: C.mut, margin: '0 0 12px' }}>A IA pode criar tarefas, mover o cliente no funil e agendar reuniões durante a conversa. Levar o cliente para uma etapa de ganho ou perda sempre pede aprovação.</p>
      <select value={mode} onChange={e => onModeChange(e.target.value)} style={{ background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 8, padding: '9px 12px', color: C.tx, fontSize: 13, width: '100%', fontFamily: 'inherit' }}>
        <option value="off">Desligado (a IA só conversa)</option>
        <option value="approve">Com aprovação (cada ação espera alguém do time)</option>
        <option value="auto">Automático</option>
      </select>
      {missing && <p style={{ fontSize: 12, color: '#EAB308', margin: '10px 0 0' }}>Rode o SQL supabase/ai_crm_actions.sql para ativar.</p>}
      <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0 8px' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.mut }}>Últimas ações</span>
        <button onClick={load} title="Atualizar" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.mut, cursor: 'pointer', display: 'flex' }}><RefreshCw size={14} /></button>
      </div>
      {rows.length === 0 ? <p style={{ fontSize: 12, color: C.mut, margin: 0 }}>Nenhuma ação ainda.</p> : rows.map(r => {
        const [lb, col] = STATUS[r.status] || [r.status, C.mut]
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid ${C.bd}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13 }}>{r.description}</div>
              <div style={{ fontSize: 11, color: C.mut }}>{r.contact_name || r.contact_phone || 'Contato'} · {new Date(r.created_at).toLocaleString('pt-BR')}{r.result?.summary ? ` · ${r.result.summary}` : ''}{r.result?.error ? ` · ${r.result.error}` : ''}</div>
            </div>
            {r.status === 'pending' ? <>
              <button disabled={busy === r.id} onClick={() => decide(r.id, true)} style={btn('#10B981')}><Check size={13} /> Aprovar</button>
              <button disabled={busy === r.id} onClick={() => decide(r.id, false)} style={btn('#64748B')}><X size={13} /> Recusar</button>
            </> : <span style={{ background: col + '22', color: col, borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700 }}>{lb}</span>}
          </div>
        )
      })}
    </div>
  )
}
