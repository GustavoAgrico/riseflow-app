// Cartão "Empresa" (E2): nome da organização, seu papel e a equipe espelhada.
// Some sozinho enquanto a migração organizations.sql não foi rodada.
import React, { useEffect, useState } from 'react'
import { Building2, Check, Loader2, Pencil, X } from 'lucide-react'
import { api } from '@services/api'

export const ROLE_LABEL = { owner: 'Dono', admin: 'Admin', manager: 'Gerente', agent: 'Atendente', viewer: 'Leitura' }
const ROLE_COLOR = { owner: '#FF6B35', admin: '#7C3AED', manager: '#0EA5E9', agent: '#22C55E', viewer: '#94A3B8' }

const chip = (role) => ({
  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
  color: ROLE_COLOR[role] || '#94A3B8', background: `${ROLE_COLOR[role] || '#94A3B8'}1f`,
})

export function OrganizationCard({ disabled = false }) {
  const [data, setData] = useState(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (disabled) return
    let alive = true
    api.get('/org').then(r => { if (alive) setData(r.data) }).catch(() => { if (alive) setData(null) })
    return () => { alive = false }
  }, [disabled])

  if (disabled || !data?.organization) return null
  const { organization, role, members } = data
  const canRename = role === 'owner' || role === 'admin'

  const save = async () => {
    setSaving(true); setError('')
    try {
      const r = await api.patch('/org', { name })
      setData(d => ({ ...d, organization: { ...d.organization, name: r.data.organization.name } }))
      setEditing(false)
    } catch (e) {
      setError(e?.response?.data?.error || 'Não foi possível salvar.')
    } finally { setSaving(false) }
  }

  return (
    <section data-testid="org-card" style={{
      marginBottom: 28, padding: 16, borderRadius: 14,
      border: '1px solid var(--border)', background: 'var(--card)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'rgba(255,107,53,0.12)', color: '#FF6B35', flexShrink: 0 }}>
          <Building2 size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Empresa</div>
          {editing ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <input autoFocus value={name} maxLength={80} onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
                aria-label="Nome da empresa"
                style={{ flex: 1, minWidth: 0, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink-1)', fontSize: 14 }} />
              <button onClick={save} disabled={saving} aria-label="Salvar nome" style={iconBtn}>{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}</button>
              <button onClick={() => setEditing(false)} aria-label="Cancelar" style={iconBtn}><X size={15} /></button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: 16 }}>{organization.name || 'Sem nome'}</strong>
              {canRename && (
                <button onClick={() => { setName(organization.name || ''); setEditing(true) }} aria-label="Renomear empresa" style={{ ...iconBtn, width: 26, height: 26 }}>
                  <Pencil size={13} />
                </button>
              )}
            </div>
          )}
          {error && <div style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{error}</div>}
        </div>
        <span style={chip(role)}>Você: {ROLE_LABEL[role] || role}</span>
      </div>

      {members.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'grid', gap: 6 }}>
          {members.map(m => (
            <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email || 'sem e-mail'}</span>
              {m.status === 'invited' && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>sem login ainda</span>}
              <span style={chip(m.role)}>{ROLE_LABEL[m.role] || m.role}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const iconBtn = {
  width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink-1)', cursor: 'pointer', flexShrink: 0,
}
