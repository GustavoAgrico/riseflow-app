const CACHE = 'riseflow-v1'
const URLS = ['/', '/dashboard', '/chat', '/crm', '/flow-builder']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(URLS)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))))
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  e.respondWith(
    fetch(e.request).then(r => {
      const clone = r.clone()
      caches.open(CACHE).then(c => c.put(e.request, clone))
      return r
    }).catch(() => caches.match(e.request))
  )
})

// Push notification handler
self.addEventListener('push', e => {
  const data = e.data?.json() || { title: 'RiseFlow', body: 'Nova notificação' }
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [200, 100, 200]
  }))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(clients.openWindow('/chat'))
})
