/* Offline shell for EnlacePlot. Hashed scripts and styles are cached as they are fetched;
   icons and images are left to the network so the cache cannot grow without end. */
const CACHE = 'enlaceplot-v1'
const KEEP = [CACHE]

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((n) => !KEEP.includes(n)).map((n) => caches.delete(n)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || data.type !== 'cache' || !Array.isArray(data.urls)) return
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await Promise.all(
        data.urls.map(async (raw) => {
          try {
            const url = new URL(raw, self.location.href)
            if (url.origin !== self.location.origin) return
            if (url.pathname.includes('/icons/')) return
            const res = await fetch(url.href, { cache: 'reload' })
            if (res.ok) await cache.put(url.href, res)
          } catch {
            /* one failed asset must not stop the rest */
          }
        }),
      )
    })(),
  )
})

async function cacheFirst(req) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req, { ignoreVary: true })
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) await cache.put(req, res.clone())
  return res
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.includes('/icons/')) return
  event.respondWith(cacheFirst(req))
})
