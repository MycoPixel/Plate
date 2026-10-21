/* Offline shell for EnlacePlot. The HTML shell is fetched from the network first so a
   new deploy actually reaches people, falling back to the cache only when offline.
   Hashed scripts and styles are cached as they are fetched; icons and images are left
   to the network so the cache cannot grow without end. */
const CACHE = 'enlaceplot-v2'
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

/* Hashed assets never change once built, so serving them from the cache is safe and fast. */
async function cacheFirst(req) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req, { ignoreVary: true })
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) await cache.put(req, res.clone())
  return res
}

/* The HTML shell names the hashed assets, so a cached copy would pin visitors to an old
   build forever. Try the network first; the cache is only for being offline. */
async function networkFirst(req) {
  const cache = await caches.open(CACHE)
  try {
    const res = await fetch(req)
    if (res.ok) await cache.put(req, res.clone())
    return res
  } catch {
    const hit = await cache.match(req, { ignoreVary: true })
    if (hit) return hit
    throw new Error('Offline and the page is not cached yet.')
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.includes('/icons/')) return
  if (req.mode === 'navigate' || (req.headers.get('accept') ?? '').includes('text/html')) {
    event.respondWith(networkFirst(req))
    return
  }
  event.respondWith(cacheFirst(req))
})
