const CACHE = 'riseflow-v2'
const PRECACHE = ['/', '/dashboard', '/chat', '/crm', '/flow-builder']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ))
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const url = e.request.url

  // Ignore non-http(s) requests (chrome-extension, data:, etc.)
  if (!url.startsWith('http')) return

  // Never intercept auth, API, or Supabase requests — always go to network
  if (
    url.includes('/auth/') ||
    url.includes('/api/') ||
    url.includes('supabase.co') ||
    url.includes('googleapis.com') ||
    url.includes('accounts.google.com')
  ) return

  if (e.request.method !== 'GET') return

  e.respondWith(
    fetch(e.request).then(r => {
      // Only cache successful static asset responses (JS, CSS, images, fonts)
      const ct = r.headers.get('content-type') || ''
      const isStaticAsset = ct.includes('javascript') || ct.includes('css') ||
        ct.includes('image') || ct.includes('font') || ct.includes('woff')
      if (r.ok && isStaticAsset) {
        const clone = r.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {})
      }
      return r
    }).catch(() => caches.match(e.request))
  )
})

self.addEventListener('push', e => {
  const data = e.data?.json() || { title: 'RiseFlow', body: 'Nova notificação' }
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [200, 100, 200],
  }))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(clients.openWindow('/chat'))
})
