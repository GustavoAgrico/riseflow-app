import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'

export function useNotifications() {
  const { ownerUserId, isDemoMode } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [toasts, setToasts] = useState([])
  const loaded = useRef(false)

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

  const dismiss = useCallback(async (id) => {
    setNotifications(p => p.filter(n => n.id !== id))
    if (!isDemoMode) await supabase.from('notifications').delete().eq('id', id).catch(() => {})
  }, [isDemoMode])

  const markAllRead = useCallback(async () => {
    setNotifications(p => p.map(n => ({ ...n, read: true })))
    if (!isDemoMode && ownerUserId) {
      await supabase.from('notifications').update({ read: true }).eq('user_id', ownerUserId).eq('read', false).catch(() => {})
    }
  }, [isDemoMode, ownerUserId])

  const clearAll = useCallback(async () => {
    setNotifications([]); setToasts([])
    if (!isDemoMode && ownerUserId) {
      await supabase.from('notifications').delete().eq('user_id', ownerUserId).catch(() => {})
    }
  }, [isDemoMode, ownerUserId])

  const addNotification = useCallback(async (type, title, message) => {
    const item = { id: crypto.randomUUID?.() || (Date.now() + '-' + Math.random()), type, title, message, created_at: new Date().toISOString(), read: false }
    setNotifications(prev => [item, ...prev].slice(0, 50))
    setToasts(prev => [item, ...prev].slice(0, 4))
    playSound()
    try {
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden)
        new Notification(title, { body: message, icon: '/favicon.ico' })
    } catch {}
    setTimeout(() => setToasts(t => t.filter(n => n.id !== item.id)), 5000)

    if (!isDemoMode && ownerUserId) {
      const { data } = await supabase.from('notifications').insert({
        user_id: ownerUserId, type, title, message,
      }).select('id').single().catch(() => ({}))
      if (data?.id) setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, id: data.id } : n))
    }
  }, [isDemoMode, ownerUserId])

  useEffect(() => {
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission() } catch {}
  }, [])

  // Carrega notificações do banco ao montar
  useEffect(() => {
    if (!ownerUserId || isDemoMode || loaded.current) return
    loaded.current = true
    ;(async () => {
      const { data } = await supabase.from('notifications').select('*').eq('user_id', ownerUserId).order('created_at', { ascending: false }).limit(50)
      if (data?.length) setNotifications(data)
    })()
  }, [ownerUserId, isDemoMode])

  // Realtime: novas mensagens, leads, limites
  useEffect(() => {
    if (!ownerUserId) return
    const acct = ownerUserId
    let channel, cancelled = false
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
