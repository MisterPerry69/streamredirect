'use strict'
/*
 * pixelate(src, blockSize)
 *   Restituisce una promise con un data-URL dell'immagine "mosaicizzata".
 *   - blockSize = quanti pixel di quadretto (più grande = effetto più visibile).
 *
 * Funziona via canvas: downscale nearest-neighbor + upscale nearest-neighbor.
 * I risultati sono cache-ati per (src,blockSize), così ogni immagine si elabora
 * UNA volta sola.
 */
const _pxCache = new Map()

function pixelate(src, blockSize = 6) {
  const key = src + '|' + blockSize
  if (_pxCache.has(key)) return _pxCache.get(key)
  const p = new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const W = 96, H = 96
      const small = Math.max(2, Math.floor(W / blockSize))
      const c1 = document.createElement('canvas')
      c1.width = small; c1.height = small
      const x1 = c1.getContext('2d')
      x1.imageSmoothingEnabled = false
      x1.drawImage(img, 0, 0, small, small)
      const c2 = document.createElement('canvas')
      c2.width = W; c2.height = H
      const x2 = c2.getContext('2d')
      x2.imageSmoothingEnabled = false
      x2.drawImage(c1, 0, 0, W, H)
      resolve(c2.toDataURL('image/png'))
    }
    img.onerror = () => resolve(src) // fallback all'originale
    img.src = src
  })
  _pxCache.set(key, p)
  return p
}

/* Applica pixelate a un <img> esistente quando l'effetto è pronto. */
function applyPixelate(imgEl, src, blockSize = 6) {
  imgEl.src = src
  pixelate(src, blockSize).then((dataUrl) => {
    if (imgEl.isConnected) imgEl.src = dataUrl
  })
}
