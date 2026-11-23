// ZF CRM service worker — lets the app open and work without a connection.
const CACHE = 'zf-crm-v3'          // app shell + assets
const API_CACHE = 'zf-api-v1'      // last known data for offline viewing
const TILE_CACHE = 'zf-tiles-v1'   // map tiles already seen (so the map works offline)
const MAX_TILES = 3000
const STATIC = ['/', '/index.html', '/manifest.json']

// Read-only data the map and booking screens need while offline
const API_OFFLINE = [/^\/api\/knocks\/$/, /^\/api\/contacts\/$/, /^\/api\/deals\/$/, /^\/api\/services$/, /^\/api\/auth\/me$/]

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  const keep = [CACHE, API_CACHE, TILE_CACHE]
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// Logout → forget cached data
self.addEventListener('message', (e) => {
  if (e.data === 'clear-api-cache') e.waitUntil(caches.delete(API_CACHE))
})

async function trimTiles() {
  const c = await caches.open(TILE_CACHE)
  const keys = await c.keys()
  if (keys.length > MAX_TILES) await Promise.all(keys.slice(0, keys.length - MAX_TILES).map((k) => c.delete(k)))
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Map tiles: cache first, fill cache as the user browses the map
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith(
      caches.open(TILE_CACHE).then(async (c) => {
        const hit = await c.match(req)
        if (hit) return hit
        try {
          const res = await fetch(req)
          if (res && res.ok) { c.put(req, res.clone()); trimTiles() }
          return res
        } catch {
          return new Response('', { status: 504 })
        }
      })
    )
    return
  }

  if (url.origin !== self.location.origin) return

  // API: only a few read-only lists are kept, network first, cached copy when offline
  if (url.pathname.startsWith('/api/')) {
    if (!API_OFFLINE.some((re) => re.test(url.pathname))) return
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(API_CACHE).then((c) => c.put(req, copy)) }
          return res
        })
        .catch(async () => (await caches.open(API_CACHE).then((c) => c.match(req, { ignoreVary: true })))
          || new Response(JSON.stringify({ detail: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } }))
    )
    return
  }

  // Pages: network first, cached app when offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/index.html', copy)); return res })
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  // Static assets (JS, CSS, images): cache first
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res && res.status === 200 && res.type !== 'opaque') {
        const clone = res.clone()
        caches.open(CACHE).then((c) => c.put(req, clone))
      }
      return res
    }))
  )
})
