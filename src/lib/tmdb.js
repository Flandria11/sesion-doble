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

export const MODOS = [
  { id: 'tendencias', nombre: 'Tendencias', ambos: true },
  { id: 'cines', nombre: 'En cines', soloPelis: true },
  { id: 'novedades', nombre: 'Novedades', ambos: true },
  { id: 'populares', nombre: 'Populares', ambos: true },
  { id: 'valoradas', nombre: 'Mejor valoradas', ambos: true }
]

/**
 * Plataformas disponibles en España, pedidas a TMDB para que la lista
 * no se quede desfasada cuando alguna cambie de nombre o desaparezca.
 */
export async function plataformas(tipo = 'movie') {
  const d = await pedir(`/watch/providers/${tipo === 'tv' ? 'tv' : 'movie'}`, { watch_region: REGION })
  return (d.results || [])
    .sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99))
    .slice(0, 12)
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
export async function explorar({ tipo = 'movie', modo = 'tendencias', proveedores = [], genero = '', pagina = 1 } = {}) {
  const esPeli = tipo !== 'tv'
  const base = { page: String(pagina) }
  const filtrando = proveedores.length > 0 || genero

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
    'vote_count.gte': modo === 'valoradas' ? '300' : '40'
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
