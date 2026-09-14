const KEY = import.meta.env.VITE_TMDB_KEY
const BASE = 'https://api.themoviedb.org/3'

export const cartel = p => (p ? `https://image.tmdb.org/t/p/w500${p}` : '')
export const fondo = p => (p ? `https://image.tmdb.org/t/p/w780${p}` : '')

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

/** Busca peliculas y series a la vez. */
export async function buscar(texto) {
  const d = await pedir('/search/multi', { query: texto, include_adult: 'false' })
  return limpiar(d.results)
}

/**
 * Catalogos de exploracion. Cada uno es un filtro de la pestana Anadir.
 * region / watch_region = ES para que los estrenos sean los de aqui.
 */
export const CATALOGOS = [
  { id: 'tendencias', nombre: 'Tendencias' },
  { id: 'cines', nombre: 'En cines' },
  { id: 'plataformas', nombre: 'En streaming' },
  { id: 'peliculas', nombre: 'Pelis populares' },
  { id: 'series', nombre: 'Series populares' },
  { id: 'joyas', nombre: 'Mejor valoradas' }
]

export async function catalogo(id, pagina = 1) {
  const p = { page: String(pagina) }
  switch (id) {
    case 'cines': {
      const d = await pedir('/movie/now_playing', { ...p, region: 'ES' })
      return limpiar(d.results, 'movie')
    }
    case 'peliculas': {
      const d = await pedir('/movie/popular', { ...p, region: 'ES' })
      return limpiar(d.results, 'movie')
    }
    case 'series': {
      const d = await pedir('/tv/popular', p)
      return limpiar(d.results, 'tv')
    }
    case 'joyas': {
      const d = await pedir('/movie/top_rated', { ...p, region: 'ES' })
      return limpiar(d.results, 'movie')
    }
    case 'plataformas': {
      const d = await pedir('/discover/movie', {
        ...p,
        watch_region: 'ES',
        with_watch_monetization_types: 'flatrate',
        sort_by: 'popularity.desc',
        'vote_count.gte': '80'
      })
      return limpiar(d.results, 'movie')
    }
    default: {
      const d = await pedir('/trending/all/week', p)
      return limpiar(d.results)
    }
  }
}

/**
 * Busca el trailer en YouTube. Prioriza Espana; si no lo hay,
 * cae al original en vez de dejarlo vacio.
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

/** Generos legibles, para la ficha. */
export async function generos(tmdbId, tipo) {
  try {
    const d = await pedir(`/${tipo === 'tv' ? 'tv' : 'movie'}/${tmdbId}`)
    return (d.genres || []).map(g => g.name).slice(0, 2).join(' · ')
  } catch (e) {
    return ''
  }
}
