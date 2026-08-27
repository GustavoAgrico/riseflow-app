import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'

export function useNotifications() {
  const { ownerUserId } = useAuth()
  const [notifications, setNotifications] = useState([]) // histórico (sino) — máx 20
  const [toasts, setToasts] = useState([])               // transitórios — máx 4

  // Som de notificação gerado via AudioContext (sem arquivo de áudio).
  const playSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = 800; osc.type = 'sine'; gain.gain.value = 0.3
      osc.start(); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3); osc.stop(ctx.currentTime + 0.3)
    } catch {}
  }

  const dismissToast = useCallback((id) => setToasts(t => t.filter(n => n.id !== id)), [])
  const dismiss = useCallback((id) => setNotifications(p => p.filter(n => n.id !== id)), [])
  const markAllRead = useCallback(() => setNotifications(p => p.map(n => ({ ...n, read: true }))), [])
  const clearAll = useCallback(() => { setNotifications([]); setToasts([]) }, [])

  const addNotification = useCallback((type, title, message) => {
    const item = { id: Date.now() + Math.random(), type, title, message, time: new Date(), read: false }
    setNotifications(prev => [item, ...prev].slice(0, 20))
    setToasts(prev => [item, ...prev].slice(0, 4))
    playSound()
    try {
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden)
        new Notification(title, { body: message, icon: '/favicon.ico' })
    } catch {}
    setTimeout(() => setToasts(t => t.filter(n => n.id !== item.id)), 5000)
  }, [])

  // Pede permissão de notificação do browser apenas 1 vez.
  useEffect(() => {
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission() } catch {}
  }, [])

  // Tempo real (schema real: messages.direction='inbound', clients=leads, usage). Falha → segue sem realtime.
  useEffect(() => {
    if (!ownerUserId) return
    // Escuta os eventos da CONTA (dono). Membros de equipe usam o ownerUserId,
    // então recebem em tempo real o que acontece no sistema, igual ao dono.
    const acct = ownerUserId
    let channel
    let cancelled = false
    ;(async () => {
      try {
        if (cancelled) return
        channel = supabase.channel('notifications_' + acct)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `user_id=eq.${acct}` }, ({ new: m }) => {
            if (m?.direction === 'inbound') addNotification('message', 'Nova mensagem', (m.content ?? '').slice(0, 50) || 'Mensagem recebida')
          })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clients', filter: `user_id=eq.${acct}` }, ({ new: c }) => {
            addNotification('lead', 'Novo lead', c?.name || 'Novo contato adicionado')
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'usage', filter: `user_id=eq.${acct}` }, ({ new: u }) => {
            if (u && u.messages_limit > 0 && u.messages_sent >= u.messages_limit * 0.8)
              addNotification('warning', 'Limite próximo', `${u.messages_sent}/${u.messages_limit} mensagens usadas`)
          })
          .subscribe()
      } catch (e) { console.warn('[Notif] realtime indisponível:', e?.message ?? e) }
    })()
    return () => { cancelled = true; try { if (channel) supabase.removeChannel(channel) } catch {} }
  }, [addNotification, ownerUserId])

  const unreadCount = notifications.filter(n => !n.read).length
  return { notifications, toasts, addNotification, dismiss, dismissToast, markAllRead, clearAll, unreadCount }
}
