/**
 * Cruza las notas de TMDB con las de IMDb y guarda en notas_ajustadas los
 * títulos en los que no se ponen de acuerdo (DIFERENCIA o más, en
 * cualquier sentido). La app usa esa nota para decidir qué entra en cada
 * apartado: así "Culpa mía" (7,7 en TMDB, 6,1 en IMDb) deja de colarse en
 * Top, y una peli infravalorada en TMDB puede entrar donde antes no.
 *
 * Se lanza cada semana desde GitHub Actions (.github/workflows/notas-imdb.yml)
 * o a mano:  TMDB_KEY=... DATABASE_URL=... node scripts/notas-imdb.mjs
 * Necesita el paquete pg (npm install --no-save pg).
 */
import zlib from 'node:zlib'
import pg from 'pg'

const TMDB_KEY = process.env.TMDB_KEY
const DATABASE_URL = process.env.DATABASE_URL
if (!TMDB_KEY || !DATABASE_URL) {
  console.error('Faltan TMDB_KEY o DATABASE_URL')
  process.exit(1)
}

// a partir de cuánta diferencia se corrige la nota
const DIFERENCIA = 0.7
// con menos votos en IMDb su nota no es de fiar (estrenos de hace días)
const VOTOS_IMDB_MINIMOS = 1000
// Todo lo que puede llegar a salir en la app: el suelo de Añadir (5,2 en
// pelis, 5,8 en series) menos la DIFERENCIA, y el menor mínimo de votos
// que se pide en algún apartado (Estrenos)
const UNIVERSO = {
  movie: { votos: 80, nota: 4.5, campoAnio: 'primary_release_year' },
  tv: { votos: 70, nota: 5.1, campoAnio: 'first_air_date_year' }
}
// los códigos que TMDB aún no tenía se vuelven a mirar pasado un mes
const REPASAR_SIN_CODIGO_DIAS = 30

const espera = ms => new Promise(r => setTimeout(r, ms))

async function tmdb(ruta, params = {}) {
  const q = new URLSearchParams({ api_key: TMDB_KEY, ...params })
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(`https://api.themoviedb.org/3${ruta}?${q}`)
      if (r.ok) return r.json()
      if (r.status === 404) return null
      // 429: demasiadas peticiones seguidas; se espera y se repite
    } catch { /* red: se repite */ }
    await espera(500 * (i + 1))
  }
  throw new Error(`TMDB no responde: ${ruta}`)
}

// en paralelo, pero sin pasar de "cuantas" a la vez
async function enTandas(lista, cuantas, fn) {
  const salida = []
  let i = 0
  await Promise.all(Array.from({ length: cuantas }, async () => {
    while (i < lista.length) {
      const k = i++
      salida[k] = await fn(lista[k])
    }
  }))
  return salida
}

/** Todos los títulos del universo, año a año (TMDB no pasa de 500 páginas). */
async function universo(tipo) {
  const u = UNIVERSO[tipo]
  const base = {
    include_adult: 'false',
    'vote_count.gte': String(u.votos),
    'vote_average.gte': String(u.nota),
    sort_by: 'popularity.desc'
  }
  const hasta = new Date().getFullYear() + 1
  const anios = Array.from({ length: hasta - 1900 + 1 }, (_, i) => 1900 + i)
  const titulos = new Map()
  await enTandas(anios, 8, async anio => {
    const p = { ...base, [u.campoAnio]: String(anio) }
    const primera = await tmdb(`/discover/${tipo}`, { ...p, page: '1' })
    if (!primera) return
    const paginas = Math.min(primera.total_pages || 1, 500)
    const resto = await enTandas(Array.from({ length: paginas - 1 }, (_, i) => i + 2), 4,
      pg => tmdb(`/discover/${tipo}`, { ...p, page: String(pg) }))
    for (const d of [primera, ...resto]) {
      for (const x of (d && d.results) || []) titulos.set(x.id, x.vote_average)
    }
  })
  return titulos
}

/** Notas de IMDb: el archivo público que publican cada día. */
async function notasImdb() {
  const r = await fetch('https://datasets.imdbws.com/title.ratings.tsv.gz')
  if (!r.ok) throw new Error(`IMDb ${r.status}`)
  const texto = zlib.gunzipSync(Buffer.from(await r.arrayBuffer())).toString()
  const notas = new Map()
  for (const linea of texto.split('\n').slice(1)) {
    const [id, nota, votos] = linea.split('\t')
    if (id) notas.set(id, { nota: Number(nota), votos: Number(votos) })
  }
  return notas
}

const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()

try {
  const [imdb, pelis, series] = await Promise.all([notasImdb(), universo('movie'), universo('tv')])
  console.log(`IMDb: ${imdb.size} notas · universo: ${pelis.size} pelis, ${series.size} series`)

  // códigos de IMDb ya conocidos
  const conocidos = new Map()
  const { rows } = await db.query(
    `select tmdb_id, tipo, imdb_id from public.tmdb_imdb
     where imdb_id is not null or comprobado > now() - make_interval(days => $1)`,
    [REPASAR_SIN_CODIGO_DIAS])
  for (const r of rows) conocidos.set(`${r.tipo}-${r.tmdb_id}`, r.imdb_id)

  // los que faltan se piden a TMDB y se guardan
  const faltan = [
    ...[...pelis.keys()].map(id => ['movie', id]),
    ...[...series.keys()].map(id => ['tv', id])
  ].filter(([t, id]) => !conocidos.has(`${t}-${id}`))
  console.log(`códigos de IMDb por averiguar: ${faltan.length}`)
  const nuevos = await enTandas(faltan, 25, async ([t, id]) => {
    const e = await tmdb(`/${t}/${id}/external_ids`)
    return { t, id, imdb: (e && e.imdb_id) || null }
  })
  for (let i = 0; i < nuevos.length; i += 1000) {
    const parte = nuevos.slice(i, i + 1000)
    await db.query(
      `insert into public.tmdb_imdb (tmdb_id, tipo, imdb_id, comprobado)
       select * , now() from unnest($1::int[], $2::text[], $3::text[])
       on conflict (tmdb_id, tipo) do update set imdb_id = excluded.imdb_id, comprobado = now()`,
      [parte.map(x => x.id), parte.map(x => x.t), parte.map(x => x.imdb)])
  }
  for (const x of nuevos) conocidos.set(`${x.t}-${x.id}`, x.imdb)

  // dónde no se ponen de acuerdo
  const ajustes = []
  let arriba = 0, abajo = 0
  for (const [tipo, lista] of [['movie', pelis], ['tv', series]]) {
    for (const [id, notaTmdb] of lista) {
      const i = imdb.get(conocidos.get(`${tipo}-${id}`))
      if (!i || i.votos < VOTOS_IMDB_MINIMOS) continue
      const dif = notaTmdb - i.nota
      if (Math.abs(dif) < DIFERENCIA) continue
      if (dif > 0) abajo++; else arriba++
      ajustes.push({ id, tipo, nota: i.nota })
    }
  }

  // se sustituye la tabla entera de una vez: la app nunca la ve a medias
  await db.query('begin')
  await db.query('delete from public.notas_ajustadas')
  for (let i = 0; i < ajustes.length; i += 1000) {
    const parte = ajustes.slice(i, i + 1000)
    await db.query(
      `insert into public.notas_ajustadas (tmdb_id, tipo, nota)
       select * from unnest($1::int[], $2::text[], $3::numeric[])`,
      [parte.map(x => x.id), parte.map(x => x.tipo), parte.map(x => x.nota)])
  }
  await db.query('commit')
  console.log(`notas ajustadas: ${ajustes.length} (${abajo} bajan, ${arriba} suben)`)
} catch (e) {
  await db.query('rollback').catch(() => {})
  console.error(e)
  process.exitCode = 1
} finally {
  await db.end()
}
