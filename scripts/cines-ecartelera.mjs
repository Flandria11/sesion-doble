/**
 * Directorio de cines de España para el filtro "Tu cine" de Añadir → En
 * cines. Sale de eCartelera: cada página de provincia lista sus cines
 * agrupados por municipio, así que con las 52 provincias está todo.
 * Se guarda en public/cines.json; los cines cambian poco, así que basta
 * con volver a lanzarlo de vez en cuando:  node scripts/cines-ecartelera.mjs
 *
 * La cartelera de cada cine (pelis y sesiones del día) no va aquí: la
 * lee al momento la función api/cartelera.js.
 */
import { writeFile } from 'node:fs/promises'

const BASE = 'https://www.ecartelera.com/cines/'
const UA = 'Mozilla/5.0 (compatible; sesion-doble/1.0)'
const espera = ms => new Promise(r => setTimeout(r, ms))

// eCartelera sirve unas páginas en UTF-8 y otras en ISO-8859-1: se mira
// la cabecera para no estropear los acentos
async function pagina(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  const juego = /charset=([\w-]+)/i.exec(r.headers.get('content-type') || '')?.[1] || 'utf-8'
  return new TextDecoder(juego).decode(await r.arrayBuffer())
}

const limpio = t => t
  .replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ').trim()

const indice = await pagina(BASE)
const provincias = [...new Map(
  [...indice.matchAll(/href="https:\/\/www\.ecartelera\.com\/cines\/(0,\d+,0)\.html"[^>]*>([^<]+)</g)]
    .map(m => [m[1], limpio(m[2])])
)]
console.log(`${provincias.length} provincias`)

const cines = []
for (const [id, provincia] of provincias) {
  const html = await pagina(`${BASE}${id}.html`)
  const bloques = html.matchAll(/<h2 class="prov"><a[^>]*>([^<]+)<\/a><\/h2>\s*<ul class="cine">([\s\S]*?)<\/ul>/g)
  for (const [, ciudad, lista] of bloques) {
    for (const [, ruta, nombre] of lista.matchAll(/href="https:\/\/www\.ecartelera\.com\/cines\/([^"]+)" title="Cartelera de ([^"]+)"/g)) {
      cines.push({ ruta, nombre: limpio(nombre), ciudad: limpio(ciudad), provincia })
    }
  }
  await espera(400)
}

const unicos = [...new Map(cines.map(c => [c.ruta, c])).values()]
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
await writeFile(new URL('../public/cines.json', import.meta.url), JSON.stringify(unicos))
console.log(`${unicos.length} cines en public/cines.json`)
