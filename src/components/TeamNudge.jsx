// Recado do gestor ("Chamar" do Monitor do time) aparecendo na tela da pessoa chamada.
// O evento chega para a conta inteira; só mostra para o membro destinatário.
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Megaphone, X, MessageSquare } from 'lucide-react'
import socket, { authenticateSocket } from '@services/socket'
import { useAuth } from '@context/AuthContext'

export function TeamNudgeListener() {
  const { memberRecord, isDemoMode, user } = useAuth()
  const [nudge, setNudge] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (isDemoMode || !user || !memberRecord) return
    authenticateSocket()
    const on = (p) => { if (p?.memberId && p.memberId === memberRecord.id) setNudge(p) }
    socket.on('team_nudge', on)
    return () => socket.off('team_nudge', on)
  }, [isDemoMode, user, memberRecord])

  if (!nudge) return null
  return (
    <div role="alertdialog" aria-live="assertive" aria-label="Recado do gestor" className="rf-bubble-up"
      style={{ position: 'fixed', left: '50%', top: 16, transform: 'translateX(-50%)', zIndex: 1200, width: 'min(420px, calc(100vw - 24px))', fontFamily: "'DM Sans', sans-serif",
        background: 'var(--panel)', color: 'var(--ink-1)', border: '1px solid rgba(255,107,53,0.5)', borderRadius: 18, padding: 16,
        boxShadow: '0 24px 60px rgba(0,0,0,0.45), 0 0 0 4px rgba(255,107,53,0.12)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span className="rf-tip-badge" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#FF9A2E,#FF6A1F)', flexShrink: 0 }}><Megaphone size={20} color="#1A0B02" /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#FF8A3D' }}>Recado de {nudge.from}</div>
          <p style={{ margin: '4px 0 0', fontSize: 14.5, lineHeight: 1.5 }}>{nudge.message}</p>
        </div>
        <button onClick={() => setNudge(null)} aria-label="Fechar recado" style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', display: 'flex' }}><X size={17} /></button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button onClick={() => setNudge(null)} style={{ minHeight: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-1)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Ok, entendi</button>
        <button onClick={() => { setNudge(null); navigate('/chat') }} style={{ minHeight: 38, padding: '0 14px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#FF9A2E,#FF6A1F)', color: '#1A0B02', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <MessageSquare size={15} /> Abrir Chat
        </button>
      </div>
    </div>
  )
}

export default TeamNudgeListener
