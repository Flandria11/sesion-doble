/**
 * Cartelera de un cine (hoy u otro día), leída de eCartelera: qué pelis echa y a
 * qué hora, con el enlace para comprar cada sesión. La usa el filtro
 * "Tu cine" de Añadir → En cines (la lista de cines es public/cines.json,
 * que sale de scripts/cines-ecartelera.mjs).
 *
 *   GET /api/cartelera?cine=92,0,1.html  →  { cine, dias, pelis: [{ titulo, sesiones: [{ hora, formato, url }] }] }
 *   (url vacía si ese cine no vende entradas por eCartelera)
 *
 * dias: los días que eCartelera tiene de ese cine, [{ ruta, nombre }], el
 * primero hoy. Cada uno se pide igual, con su ruta en ?cine. Yelmo, por
 * ejemplo, tiene la semana entera; Cinesa solo el día de hoy.
 *
 * Va por aquí y no desde el navegador porque eCartelera no deja leerla
 * desde otra web (CORS). La respuesta se guarda en la CDN de Vercel unas
 * horas: así se le pide a eCartelera muy de vez en cuando.
 */
const UA = 'Mozilla/5.0 (compatible; sesion-doble/1.0)'
// lo que puede venir en ?cine: las dos formas de dirección de eCartelera,
// con el día o sin él ("92,0,1.html", "92,3,1.html", "balmes-multicines/",
// "balmes-multicines/3/"); cualquier otra cosa se rechaza
const RUTA = /^(\d+,\d+,1\.html|[a-z0-9-]+\/(\d+\/)?)$/

const ACENTOS = { aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ccedil: 'ç' }
const limpio = t => t
  .replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&(\w+);/g, (m, n) => ACENTOS[n] || m)
  .replace(/\s+/g, ' ').trim()

export function leerCartelera(html) {
  const cine = limpio(/<h1 class="std-tit">([^<]+)<\/h1>/.exec(html)?.[1] || '')
  const lista = /<ul class="days">([\s\S]*?)<\/ul>/.exec(html)?.[1] || ''
  const dias = [...lista.matchAll(/href="https:\/\/www\.ecartelera\.com\/cines\/([^"]+)" title="Cartelera del ([^"]+)"/g)]
    .map(([, ruta, nombre]) => ({ ruta, nombre: limpio(nombre) }))
    .filter(d => RUTA.test(d.ruta))
  const pelis = []
  // cada peli es un bloque "titem"; se corta por ahí para no mezclar las
  // sesiones de una con el título de la siguiente
  for (const bloque of html.split('<div class="titem"').slice(1)) {
    const titulo = /<p class="tit"><a[^>]*>([^<]+)<\/a>/.exec(bloque)?.[1]
    if (!titulo) continue
    // con venta de entradas, cada hora es un enlace; en los cines que no la
    // tienen (Gran Sarrià, por ejemplo) es solo texto, y url queda vacía
    const sesiones = [...bloque.matchAll(/<(?:a|span)\b([^>]*)data-session-time="(\d{1,2}:\d{2})"[^>]*data-session-format="([^"]*)"/g)]
      .map(([, antes, hora, formato]) => ({ hora, formato: limpio(formato), url: /href="([^"]+)"/.exec(antes)?.[1] || '' }))
    pelis.push({ titulo: limpio(titulo), sesiones })
  }
  return { cine, dias, pelis }
}

export default async function handler(req, res) {
  const ruta = String(req.query.cine || '')
  if (!RUTA.test(ruta)) {
    res.status(400).json({ error: 'cine no válido' })
    return
  }
  try {
    const r = await fetch(`https://www.ecartelera.com/cines/${ruta}`, { headers: { 'User-Agent': UA } })
    if (!r.ok) throw new Error(`eCartelera respondió ${r.status}`)
    // unas páginas vienen en UTF-8 y otras en ISO-8859-1
    const juego = /charset=([\w-]+)/i.exec(r.headers.get('content-type') || '')?.[1] || 'utf-8'
    const html = new TextDecoder(juego).decode(await r.arrayBuffer())
    // tres horas en la CDN; si eCartelera fallara después, se sigue
    // sirviendo lo último bueno hasta un día
    res.setHeader('Cache-Control', 's-maxage=10800, stale-while-revalidate=86400')
    res.status(200).json(leerCartelera(html))
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) })
  }
}
