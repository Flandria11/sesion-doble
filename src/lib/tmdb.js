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

/** Busca películas y series a la vez. */
export async function buscar(texto) {
  const d = await pedir('/search/multi', { query: texto, include_adult: 'false' })
  return (d.results || [])
    .filter(x => x.media_type === 'movie' || x.media_type === 'tv')
    .filter(x => x.poster_path)
    .map(normalizar)
}

/** Lo que está de moda ahora mismo, para cuando no sabes qué buscar. */
export async function tendencias() {
  const d = await pedir('/trending/all/week')
  return (d.results || [])
    .filter(x => x.media_type === 'movie' || x.media_type === 'tv')
    .filter(x => x.poster_path)
    .map(normalizar)
}

function normalizar(x) {
  const esPeli = x.media_type === 'movie'
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

/** Géneros legibles, para la ficha. */
export async function generos(tmdbId, tipo) {
  try {
    const d = await pedir(`/${tipo === 'tv' ? 'tv' : 'movie'}/${tmdbId}`)
    return (d.genres || []).map(g => g.name).slice(0, 2).join(' · ')
  } catch (e) {
    return ''
  }
}
