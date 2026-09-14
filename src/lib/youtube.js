/**
 * Carga la API de YouTube una sola vez, aunque se abran varias fichas.
 * Devuelve una promesa que resuelve con el objeto global YT.
 */
let promesa = null

export function cargarYT() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT)
  if (promesa) return promesa

  promesa = new Promise((ok, mal) => {
    const anterior = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      if (typeof anterior === 'function') anterior()
      ok(window.YT)
    }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.async = true
    s.onerror = () => { promesa = null; mal(new Error('No se pudo cargar YouTube')) }
    document.head.appendChild(s)
  })

  return promesa
}

/** Convierte segundos en m:ss */
export const reloj = s => {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}
