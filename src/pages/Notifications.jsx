import React from 'react'
import { Bell, MessageCircle, User, Megaphone, Zap, AlertTriangle, Trash2, CheckCheck } from 'lucide-react'
import { useApp } from '@context/AppContext'
import { Layout } from '@components/Layout/Layout'

const C = { bg: 'var(--bg)', card: 'var(--card)', bd: 'var(--border)', tx: 'var(--ink-1)', mut: 'var(--ink-4)', org: '#FF6B35' }

const TYPE_META = {
  message: { icon: MessageCircle, color: '#3B82F6', label: 'Mensagem' },
  lead: { icon: User, color: '#22C55E', label: 'Lead' },
  campaign: { icon: Megaphone, color: '#7C3AED', label: 'Campanha' },
  flow: { icon: Zap, color: '#EAB308', label: 'Fluxo' },
  warning: { icon: AlertTriangle, color: '#EF4444', label: 'Alerta' },
  system: { icon: Bell, color: '#94A3B8', label: 'Sistema' },
}

const relTime = (t) => {
  if (!t) return ''
  const d = Date.now() - new Date(t).getTime()
  if (d < 60000) return 'agora'
  if (d < 3600000) return `há ${Math.floor(d / 60000)}min`
  if (d < 86400000) return `há ${Math.floor(d / 3600000)}h`
  return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export const Notifications = () => {
  const { notifications, dismiss, markAllRead, clearAll, unreadCount } = useApp()

  return (
    <Layout title="Notificações" subtitle={unreadCount > 0 ? `${unreadCount} não lidas` : 'Todas lidas'}>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
        {unreadCount > 0 && (
          <button onClick={markAllRead} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.bd}`, background: 'transparent', color: C.tx, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <CheckCheck size={14} /> Marcar todas como lidas
          </button>
        )}
        {notifications.length > 0 && (
          <button onClick={clearAll} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.bd}`, background: 'transparent', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Trash2 size={14} /> Limpar todas
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 60, textAlign: 'center' }}>
          <Bell size={36} color={C.mut} style={{ marginBottom: 12 }} />
          <p style={{ color: C.mut, fontSize: 14, margin: 0 }}>Nenhuma notificação</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {notifications.map(n => {
            const meta = TYPE_META[n.type] || TYPE_META.system
            const Icon = meta.icon
            return (
              <div key={n.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px',
                background: C.card, border: `1px solid ${C.bd}`, borderRadius: 12,
                borderLeft: !n.read ? `3px solid ${C.org}` : `3px solid transparent`,
                opacity: n.read ? 0.7 : 1,
              }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: meta.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={16} color={meta.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{n.title}</p>
                    <span style={{ fontSize: 10, color: C.mut, flexShrink: 0, whiteSpace: 'nowrap' }}>{relTime(n.time || n.created_at)}</span>
                  </div>
                  {n.message && <p style={{ margin: '4px 0 0', fontSize: 12, color: C.mut }}>{n.message}</p>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: meta.color, textTransform: 'uppercase' }}>{meta.label}</span>
                    <button onClick={() => dismiss(n.id)} style={{ background: 'none', border: 'none', color: C.mut, cursor: 'pointer', fontSize: 10, padding: 0 }}>Dispensar</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
