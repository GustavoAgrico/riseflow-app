import React from 'react'
import { MessageCircle, User, Megaphone, Zap, AlertTriangle, Bell } from 'lucide-react'

// Tipo → ícone (lucide) + cor da borda lateral
const TYPES = {
  message:  { color: '#0891B2', Icon: MessageCircle },
  lead:     { color: '#7C3AED', Icon: User },
  campaign: { color: '#059669', Icon: Megaphone },
  flow:     { color: '#D97706', Icon: Zap },
  warning:  { color: '#EF4444', Icon: AlertTriangle },
  system:   { color: '#6B7280', Icon: Bell },
}
const hhmm = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export const NotificationToast = ({ notifications = [], onDismiss }) => {
  if (!notifications.length) return null
  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'DM Sans, sans-serif' }}>
      <style>{`@keyframes ntSlideIn{from{transform:translateX(110%);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
      {notifications.slice(0, 4).map(n => {
        const t = TYPES[n.type] ?? TYPES.system
        return (
          <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 320, maxWidth: 380,
            background: '#1E293B', borderLeft: `4px solid ${t.color}`, borderRadius: 10, padding: '12px 16px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)', animation: 'ntSlideIn .3s ease' }}>
            <t.Icon size={18} color={t.color} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#F8FAFC' }}>{n.title}</p>
              {n.message && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94A3B8', wordBreak: 'break-word' }}>{n.message}</p>}
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#64748B' }}>{hhmm(n.time)}</p>
            </div>
            <button onClick={() => onDismiss(n.id)} aria-label="Fechar" style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
          </div>
        )
      })}
    </div>
  )
}
