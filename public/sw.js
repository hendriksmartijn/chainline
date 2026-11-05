/* Chainline service worker: push, notificatie-acties en een offline-statusscherm. */
const CACHE = 'chainline-v1'
const OFFLINE_URL = '/offline'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, '/icons/192'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

// Alleen navigaties: online altijd vers (de status moet kloppen), offline een nette melding.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)))
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Chainline', body: event.data ? event.data.text() : '' }
  }
  const options = {
    body: data.body || '',
    tag: data.tag,
    renotify: true,
    icon: '/icons/192',
    badge: '/icons/96',
    data: { url: data.url || '/', componentId: data.componentId },
    // Actieknoppen werken op Android/desktop; iOS negeert ze en valt terug op de klik (deep link).
    actions: data.waxAction ? [{ action: 'waxed', title: 'Gewaxt ✓' }] : [],
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Chainline', options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const { url, componentId } = event.notification.data || {}

  if (event.action === 'waxed' && componentId) {
    event.waitUntil(
      fetch(`/api/components/${componentId}/waxed`, { method: 'POST', credentials: 'same-origin' })
        .then((res) => {
          if (!res.ok) throw new Error(String(res.status))
          return self.registration.showNotification('Gewaxt ✓', { body: 'Teller staat weer op 0 wax-km.', tag: event.notification.tag, icon: '/icons/192' })
        })
        // Niet ingelogd of offline: open het één-tap-scherm.
        .catch(() => openUrl(`/wax/${componentId}`)),
    )
    return
  }
  event.waitUntil(openUrl(url || '/'))
})

async function openUrl(url) {
  const target = new URL(url, self.location.origin).href
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const c of all) {
    if ('focus' in c) {
      await c.navigate(target).catch(() => {})
      return c.focus()
    }
  }
  return self.clients.openWindow(target)
}
