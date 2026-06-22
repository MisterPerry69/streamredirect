/* Service worker minimale: cache-first, per uso offline al tavolo.
   Bump CACHE quando cambi i file per forzare l'aggiornamento. */
const CACHE = 'twow-v1'
const CORE = [
  './',
  './index.html',
  './style.css',
  './data.js',
  './app.js',
  './manifest.json',
  './public/ui/bg.png',
  './public/ui/esagono_base.png',
  './public/ui/cerchio_base.png',
  './public/ui/box-missione.png',
  './public/ui/finestra_di_dialogo.png'
]

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => {})))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  )
  self.clients.claim()
})
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request)
          .then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {})
            return res
          })
          .catch(() => hit)
    )
  )
})
