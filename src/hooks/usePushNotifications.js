import { useState, useEffect, useCallback } from 'react'
import api from '@services/api'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

export function usePushNotifications() {
  const [permission, setPermission] = useState('default')
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY

  useEffect(() => {
    if (!supported) return
    setPermission(Notification.permission)
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription().then(sub => setSubscribed(!!sub))
    ).catch(() => {})
  }, [supported])

  const subscribe = useCallback(async () => {
    if (!supported) return false
    setLoading(true)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') { setLoading(false); return false }

      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      }
      await api.post('/api/push/subscribe', { subscription: sub.toJSON() })
      setSubscribed(true)
      setLoading(false)
      return true
    } catch (err) {
      console.error('[push] subscribe failed:', err)
      setLoading(false)
      return false
    }
  }, [supported])

  const unsubscribe = useCallback(async () => {
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint })
        await sub.unsubscribe()
      }
      setSubscribed(false)
    } catch (err) {
      console.error('[push] unsubscribe failed:', err)
    }
    setLoading(false)
  }, [])

  return { supported, permission, subscribed, loading, subscribe, unsubscribe }
}
