const KEY = import.meta.env.VITE_TMDB_KEY
const BASE = 'https://api.themoviedb.org/3'
const REGION = 'ES'

export const cartel = p => (p ? `https://image.tmdb.org/t/p/w500${p}` : '')
export const fondo = p => (p ? `https://image.tmdb.org/t/p/w780${p}` : '')
export const logo = p => (p ? `https://image.tmdb.org/t/p/w92${p}` : '')

async function pedir(ruta, params = {}) {
  const q = new URLSearchParams({ api_key: KEY, language: 'es-ES', ...params })
  const r = await fetch(`${BASE}${ruta}?${q}`)
  if (!r.ok) throw new Error(`TMDB ${r.status}`)
  return r.json()
}

function normalizar(x, tipoForzado) {
  const tipo = tipoForzado || x.media_type
  const esPeli = tipo === 'movie'
  return {
    tmdb_id: x.id,
    tipo: esPeli ? 'movie' : 'tv',
    titulo: esPeli ? x.title : x.name,
    anio: ((esPeli ? x.release_date : x.first_air_date) || '').slice(0, 4),
    cartel: cartel(x.poster_path),
    fondo: fondo(x.backdrop_path),
    sinopsis: x.overview || '',
    voto: x.vote_average ? x.vote_average.toFixed(1) : ''
  }
}

const limpiar = (lista, tipo) =>
  (lista || [])
    .filter(x => tipo || x.media_type === 'movie' || x.media_type === 'tv')
    .filter(x => x.poster_path)
    .map(x => normalizar(x, tipo))

/** Busca películas y series a la vez. */
export async function buscar(texto) {
  const d = await pedir('/search/multi', { query: texto, include_adult: 'false' })
  return limpiar(d.results)
}

/* ------------------------------------------------------------------ *
 * Catálogos de exploración
 * ------------------------------------------------------------------ */

/**
 * `filtrable` marca los modos que TMDB puede combinar con plataforma o
 * género. Tendencias y En cines son listas cerradas que no admiten
 * filtros, así que se ocultan cuando hay alguno puesto en vez de
 * devolver otra cosa por detrás.
 */
export const MODOS = [
  { id: 'tendencias', nombre: 'Tendencias', filtrable: false },
  { id: 'cines', nombre: 'En cines', soloPelis: true, filtrable: false, sinPlataforma: true },
  { id: 'novedades', nombre: 'Novedades', filtrable: true },
  { id: 'populares', nombre: 'Populares', filtrable: true },
  { id: 'valoradas', nombre: 'Mejor valoradas', filtrable: true }
]

/**
 * Plataformas disponibles en España, pedidas a TMDB para que la lista
 * no se quede desfasada cuando alguna cambie de nombre o desaparezca.
 */
// Las que más se usan en España van primero; el resto detrás, por la
// prioridad que les da TMDB. No hardcodeamos identificadores, solo el
// orden: si alguna cambia de nombre o desaparece, la lista sigue siendo
// la que TMDB dice que opera en España.
const PREFERIDAS = [
  'netflix', 'amazon prime video', 'prime video', 'disney plus', 'disney+',
  'max', 'hbo max', 'movistar plus', 'filmin', 'apple tv', 'skyshowtime',
  'rakuten tv', 'atresplayer', 'crunchyroll', 'flixolé', 'mubi'
]

const rango = nombre => {
  const n = nombre.toLowerCase()
  const i = PREFERIDAS.findIndex(p => n.includes(p))
  return i === -1 ? 999 : i
}

export async function plataformas(tipo = 'movie') {
  const d = await pedir(`/watch/providers/${tipo === 'tv' ? 'tv' : 'movie'}`, { watch_region: REGION })
  return (d.results || [])
    .sort((a, b) => {
      const ra = rango(a.provider_name), rb = rango(b.provider_name)
      if (ra !== rb) return ra - rb
      return (a.display_priority ?? 99) - (b.display_priority ?? 99)
    })
    .slice(0, 20)
    .map(x => ({ id: x.provider_id, nombre: x.provider_name, logo: logo(x.logo_path) }))
}

/** Géneros, para el filtro desplegable. */
export async function generosLista(tipo = 'movie') {
  const d = await pedir(`/genre/${tipo === 'tv' ? 'tv' : 'movie'}/list`)
  return (d.genres || []).map(g => ({ id: g.id, nombre: g.name }))
}

/**
 * Un único punto de entrada para explorar. Si hay plataformas o género
 * seleccionados usamos /discover, que es el que admite filtros; si no,
 * las listas rápidas de TMDB, que traen mejores resultados.
 */
/**
 * Opciones del filtro de año. Los últimos sueltos, y hacia atrás por
 * décadas: nadie quiere buscar "1997" exacto.
 */
export const ANOS = [
  { id: '', nombre: 'Cualquier año' },
  { id: '2026', nombre: '2026' },
  { id: '2025', nombre: '2025' },
  { id: '2024', nombre: '2024' },
  { id: '2023', nombre: '2023' },
  { id: '2022', nombre: '2022' },
  { id: 'd2020', nombre: 'Años 2020', desde: '2020-01-01', hasta: '2029-12-31' },
  { id: 'd2010', nombre: 'Años 2010', desde: '2010-01-01', hasta: '2019-12-31' },
  { id: 'd2000', nombre: 'Años 2000', desde: '2000-01-01', hasta: '2009-12-31' },
  { id: 'd1990', nombre: 'Años 90', desde: '1990-01-01', hasta: '1999-12-31' },
  { id: 'd1980', nombre: 'Años 80', desde: '1980-01-01', hasta: '1989-12-31' },
  { id: 'ant', nombre: 'Antes de 1980', hasta: '1979-12-31' }
]

/**
 * Mínimos de votos. Un 9 con cuatro votos no significa nada, así que
 * cualquier filtro por nota necesita también un mínimo de participación.
 * No lo subo más porque el cine español recibe muchos menos votos que el
 * americano, y un listón alto se lo lleva por delante.
 */
const VOTOS = { valoradas: 1000, calidad: 250, normal: 40 }
const NOTA_MINIMA = 6

export async function explorar({ tipo = 'movie', modo = 'tendencias', proveedores = [], genero = '', anio = '', calidad = false, pagina = 1 } = {}) {
  const esPeli = tipo !== 'tv'
  const base = { page: String(pagina) }
  const filtrando = proveedores.length > 0 || genero || anio || calidad

  if (!filtrando) {
    if (modo === 'cines' && esPeli) {
      const d = await pedir('/movie/now_playing', { ...base, region: REGION })
      return limpiar(d.results, 'movie')
    }
    if (modo === 'tendencias') {
      const d = await pedir(`/trending/${esPeli ? 'movie' : 'tv'}/week`, base)
      return limpiar(d.results, esPeli ? 'movie' : 'tv')
    }
    if (modo === 'populares') {
      const d = await pedir(`/${esPeli ? 'movie' : 'tv'}/popular`, { ...base, region: REGION })
      return limpiar(d.results, esPeli ? 'movie' : 'tv')
    }
    if (modo === 'valoradas') {
      const d = await pedir(`/${esPeli ? 'movie' : 'tv'}/top_rated`, { ...base, region: REGION })
      return limpiar(d.results, esPeli ? 'movie' : 'tv')
    }
  }

  // /discover: acepta plataformas, género y orden
  const p = {
    ...base,
    watch_region: REGION,
    include_adult: 'false',
    'vote_count.gte': String(
      modo === 'valoradas' ? VOTOS.valoradas : calidad ? VOTOS.calidad : VOTOS.normal
    )
  }
  if (calidad) p['vote_average.gte'] = String(NOTA_MINIMA)

  // filtro de año: los sueltos por año exacto, las décadas por rango
  if (anio) {
    const campo = esPeli ? 'primary_release_date' : 'first_air_date'
    const op = ANOS.find(a => a.id === anio)
    if (op && (op.desde || op.hasta)) {
      if (op.desde) p[`${campo}.gte`] = op.desde
      if (op.hasta) p[`${campo}.lte`] = op.hasta
    } else if (esPeli) {
      p.primary_release_year = anio
    } else {
      p.first_air_date_year = anio
    }
  }
  if (proveedores.length) {
    p.with_watch_providers = proveedores.join('|')
    p.with_watch_monetization_types = 'flatrate'
  }
  if (genero) p.with_genres = String(genero)

  if (modo === 'valoradas') p.sort_by = 'vote_average.desc'
  else if (modo === 'novedades') {
    p.sort_by = esPeli ? 'primary_release_date.desc' : 'first_air_date.desc'
    const hoy = new Date().toISOString().slice(0, 10)
    if (esPeli) p['primary_release_date.lte'] = hoy
    else p['first_air_date.lte'] = hoy
  } else if (modo === 'cines' && esPeli) {
    const hace = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)
    const hoy = new Date().toISOString().slice(0, 10)
    p['primary_release_date.gte'] = hace
    p['primary_release_date.lte'] = hoy
    p.with_release_type = '2|3'
    p.sort_by = 'popularity.desc'
  } else {
    p.sort_by = 'popularity.desc'
  }

  const d = await pedir(`/discover/${esPeli ? 'movie' : 'tv'}`, p)
  return limpiar(d.results, esPeli ? 'movie' : 'tv')
}

/**
 * Novedades del último año que ya se pueden ver en alguna plataforma de
 * España. Es lo que alimenta la bobina de tráilers.
 */
export async function recientes(pagina = 1, tipo = 'movie') {
  const esPeli = tipo !== 'tv'
  const campo = esPeli ? 'primary_release_date' : 'first_air_date'
  const hace = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10)
  const hoy = new Date().toISOString().slice(0, 10)

  const d = await pedir(`/discover/${esPeli ? 'movie' : 'tv'}`, {
    page: String(pagina),
    watch_region: REGION,
    with_watch_monetization_types: 'flatrate',
    include_adult: 'false',
    sort_by: 'popularity.desc',
    'vote_count.gte': '30',
    [`${campo}.gte`]: hace,
    [`${campo}.lte`]: hoy
  })
  return limpiar(d.results, esPeli ? 'movie' : 'tv').filter(x => x.fondo)
}

/**
 * Estrenos recientes que ya se pueden ver en plataformas en España.
 * Mezcla películas y series alternándolas.
 *
 * El listón de calidad es más bajo que en el resto de la app a propósito:
 * un estreno de hace dos meses no ha tenido tiempo de acumular votos, y
 * con el mínimo de 250 que usamos en Añadir esto saldría vacío.
 */
export async function estrenos(pagina = 1) {
  const hoy = new Date()
  const desde = new Date(hoy.getTime() - 400 * 864e5).toISOString().slice(0, 10)
  const hasta = hoy.toISOString().slice(0, 10)

  const comun = {
    page: String(pagina),
    watch_region: REGION,
    with_watch_monetization_types: 'flatrate',
    include_adult: 'false',
    'vote_count.gte': '100',
    'vote_average.gte': '6.2'
  }

  const [pelis, series] = await Promise.all([
    pedir('/discover/movie', {
      ...comun,
      sort_by: 'primary_release_date.desc',
      'primary_release_date.gte': desde,
      'primary_release_date.lte': hasta
    }).then(d => limpiar(d.results, 'movie')).catch(() => []),
    pedir('/discover/tv', {
      ...comun,
      sort_by: 'first_air_date.desc',
      'first_air_date.gte': desde,
      'first_air_date.lte': hasta
    }).then(d => limpiar(d.results, 'tv')).catch(() => [])
  ])

  // alternamos una y una para que no salgan todas las pelis seguidas
  const mezcla = []
  for (let i = 0; i < Math.max(pelis.length, series.length); i++) {
    if (pelis[i]) mezcla.push(pelis[i])
    if (series[i]) mezcla.push(series[i])
  }
  return mezcla
}

/**
 * Busca el tráiler en YouTube. Prioriza España; si no lo hay,
 * cae al original en vez de dejarlo vacío.
 */
export async function buscarTrailer(tmdbId, tipo) {
  const ruta = `/${tipo === 'tv' ? 'tv' : 'movie'}/${tmdbId}/videos`
  for (const idioma of ['es-ES', 'en-US']) {
    try {
      const d = await pedir(ruta, { language: idioma })
      const v = (d.results || []).find(
        x => x.site === 'YouTube' && (x.type === 'Trailer' || x.type === 'Teaser')
      )
      if (v) return v.key
    } catch (e) {
      /* probamos el siguiente idioma */
    }
  }
  return ''
}

/** Géneros legibles de un título, para la ficha. */
export async function generos(tmdbId, tipo) {
  try {
    const d = await pedir(`/${tipo === 'tv' ? 'tv' : 'movie'}/${tmdbId}`)
    return (d.genres || []).map(g => g.name).slice(0, 2).join(' · ')
  } catch (e) {
    return ''
  }
}

/** Dónde se puede ver en España. Se usa en la ficha. */
export async function dondeVerla(tmdbId, tipo) {
  try {
    const d = await pedir(`/${tipo === 'tv' ? 'tv' : 'movie'}/${tmdbId}/watch/providers`)
    const es = (d.results || {})[REGION]
    if (!es) return []
    const vistos = new Set()
    return [...(es.flatrate || []), ...(es.free || [])]
      .filter(x => !vistos.has(x.provider_id) && vistos.add(x.provider_id))
      .slice(0, 4)
      .map(x => ({ nombre: x.provider_name, logo: logo(x.logo_path) }))
  } catch (e) {
    return []
  }
}
