/* Service worker: карта и панорамы работают без интернета.
 *  - файлы планов и панорам (/api/files/...) — сначала из кэша (они не меняются);
 *  - данные карты (/api/public/...) — сначала из сети, без сети — сохранённая копия;
 *  - сама страница и скрипты — из кэша с фоновым обновлением.
 * Запросы редактора и все POST не кэшируются.
 */
const SHELL = 'space-map-shell-v1'
const DATA = 'space-map-data-v1'
const FILES = 'space-map-files-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/favicon.svg', '/plans/generic.svg'])).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  const keep = new Set([SHELL, DATA, FILES])
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))))
  self.clients.claim()
})

async function cacheFirst(req, name) {
  const cache = await caches.open(name)
  const hit = await cache.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) cache.put(req, res.clone())
  return res
}

async function networkFirst(req, name) {
  const cache = await caches.open(name)
  try {
    const res = await fetch(req)
    if (res.ok) cache.put(req, res.clone())
    return res
  } catch {
    const hit = await cache.match(req)
    if (hit) return hit
    throw new Error('offline')
  }
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name)
  const hit = await cache.match(req)
  const update = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res }).catch(() => null)
  return hit || (await update) || Response.error()
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/api/files/')) {
    e.respondWith(cacheFirst(req, FILES))
  } else if (url.pathname.startsWith('/api/public/')) {
    e.respondWith(networkFirst(req, DATA))
  } else if (url.pathname.startsWith('/api/')) {
    // редактор и прочее API — только сеть
  } else if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, SHELL).catch(() => caches.match('/', { ignoreSearch: true })))
  } else {
    e.respondWith(staleWhileRevalidate(req, SHELL))
  }
})
