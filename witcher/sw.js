/*
 * Service worker — strategia split:
 *   - CODICE (html/css/js/json):  network-first, fallback cache (offline-safe ma sempre fresco)
 *   - IMMAGINI/asset statici:     cache-first (raramente cambiano, evita download ripetuti)
 *
 * BUMP `CACHE` ogni volta che cambi i file core; le vecchie cache vengono ripulite in 'activate'.
 */
const CACHE = 'twow-v6'

const V = 'v=6'
const CORE = [
  './',
  './index.html',
  './style.css?' + V,
  './data.js?' + V,
  './witchers.js?' + V,
  './pixelate.js?' + V,
  './app.js?' + V,
  './manifest.json',
  './public/ui/bg.png',
  './public/ui/esagono_base.png',
  './public/ui/cerchio_base.png',
  './public/ui/box-missione.png',
  './public/ui/finestra_di_dialogo.png'
]

const isCode = (url) => /\.(html|css|js|json)(\?|$)/.test(url) || url.endsWith('/')

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => {})))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return

  const url = e.request.url

  if (isCode(url)) {
    // Network-first: prova la rete, aggiorna cache, ricadi su cache solo se offline
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match(e.request))
    )
  } else {
    // Cache-first per asset statici
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {})
            return res
          })
      )
    )
  }
})
