/**
 * Carga la API de YouTube una sola vez, aunque haya varias tarjetas.
 * Devuelve una promesa con el objeto global YT.
 */
let promesa = null

export function cargarYT() {
  if (typeof window === 'undefined') return Promise.reject(new Error('sin navegador'))
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
    s.onerror = () => { promesa = null; mal(new Error('no se pudo cargar YouTube')) }
    document.head.appendChild(s)
    // si tarda demasiado, que el reproductor pueda seguir sin la API
    setTimeout(() => mal(new Error('tiempo agotado')), 8000)
  })

  return promesa
}
