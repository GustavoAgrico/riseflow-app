import React from 'react'
import { Inbox } from 'lucide-react'

export const EmptyState = ({ icon: Icon = Inbox, title = 'Nada por aqui', message, action, onAction }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '48px 24px', textAlign: 'center',
  }}>
    <div style={{
      width: 64, height: 64, borderRadius: 16,
      background: 'linear-gradient(135deg, rgba(255,107,53,0.12), rgba(124,58,237,0.12))',
      display: 'grid', placeItems: 'center', marginBottom: 16,
    }}>
      <Icon size={28} style={{ color: 'var(--ink-3)' }} />
    </div>
    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-1)', margin: '0 0 6px' }}>{title}</p>
    {message && <p style={{ fontSize: 13, color: 'var(--ink-4)', margin: 0, maxWidth: 320 }}>{message}</p>}
    {action && onAction && (
      <button
        onClick={onAction}
        style={{
          marginTop: 16, padding: '8px 20px', borderRadius: 10,
          border: 'none', background: '#FF6B35', color: '#fff',
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}
      >
        {action}
      </button>
    )}
  </div>
)
