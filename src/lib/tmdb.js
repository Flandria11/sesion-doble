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

function normalizar(x, tipoForzado, mapaGeneros) {
  const tipo = tipoForzado || x.media_type
  const esPeli = tipo === 'movie'
  const genero = mapaGeneros && x.genre_ids
    ? x.genre_ids.slice(0, 2).map(id => mapaGeneros[id]).filter(Boolean).join(' · ')
    : ''
  return {
    tmdb_id: x.id,
    tipo: esPeli ? 'movie' : 'tv',
    titulo: esPeli ? x.title : x.name,
    anio: ((esPeli ? x.release_date : x.first_air_date) || '').slice(0, 4),
    cartel: cartel(x.poster_path),
    fondo: fondo(x.backdrop_path),
    sinopsis: x.overview || '',
    voto: x.vote_average ? x.vote_average.toFixed(1) : '',
    genero
  }
}

const limpiar = (lista, tipo, mapaGeneros) =>
  (lista || [])
    .filter(x => tipo || x.media_type === 'movie' || x.media_type === 'tv')
    .filter(x => x.poster_path)
    .map(x => normalizar(x, tipo, mapaGeneros))

/**
 * Nombres de género por id, para pintarlos en las tarjetas sin pedirlos
 * uno a uno: /discover ya trae genre_ids, solo falta el nombre. La
 * lista es fija (apenas cambia), así que se pide una sola vez por sesión.
 */
const cacheGeneros = {}
async function mapaGeneros(tipo) {
  if (cacheGeneros[tipo]) return cacheGeneros[tipo]
  const d = await pedir(`/genre/${tipo === 'tv' ? 'tv' : 'movie'}/list`)
  const mapa = Object.fromEntries((d.genres || []).map(g => [g.id, g.name]))
  cacheGeneros[tipo] = mapa
  return mapa
}

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
const VOTOS = { valoradas: 1000, calidad: 350, normal: 80 }
const NOTA_MINIMA = 6
const NOTA_MINIMA_TV = 6.5
const NOTA_MINIMA_ANADIR = 5
const NOTA_MINIMA_ANADIR_TV = 5.5
const NOTA_MINIMA_TOP = 7
const NOTA_MINIMA_TOP_TV = 7.7
const NOTA_MINIMA_ESTRENOS = 6.2
const NOTA_MINIMA_ESTRENOS_TV = 6.7
const NOTA_MINIMA_ANIMACION_TOP = 7.5
const NOTA_MINIMA_ANIMACION_TOP_TV = 8.1

/**
 * Suelo de calidad en Añadir aunque no se active el interruptor: sin
 * esto colaban pelis de serie Z con nota de 2 con tal de tener algo de
 * votos. Tendencias/Populares/Cines/Valoradas siguen ordenados como
 * los da TMDB (por eso salen antes las más populares); esto solo
 * recorta lo que se cuela por detrás.
 */
const filtrarBase = (lista, esPeli) =>
  lista.filter(x =>
    x.vote_average >= (esPeli ? NOTA_MINIMA_ANADIR : NOTA_MINIMA_ANADIR_TV) &&
    x.vote_count >= VOTOS.normal
  )

/**
 * En cines es distinto: son estrenos de los últimos días, así que casi
 * ninguno llega a los 80 votos del suelo normal. Exigirlo dejaba la lista
 * en nada. Aquí solo se corta lo que sí tiene datos suficientes para saber
 * que es mala (20 votos) y aun así no llega a la nota mínima; lo recién
 * estrenado sin apenas votos pasa igual.
 */
const filtrarCines = lista =>
  lista.filter(x => x.vote_count < 20 || x.vote_average >= NOTA_MINIMA_ANADIR)

export async function explorar({ tipo = 'movie', modo = 'tendencias', proveedores = [], genero = '', anio = '', calidad = false, pagina = 1 } = {}) {
  const esPeli = tipo !== 'tv'
  const base = { page: String(pagina) }
  const filtrando = proveedores.length > 0 || genero || anio || calidad

  if (!filtrando) {
    if (modo === 'cines' && esPeli) {
      const d = await pedir('/movie/now_playing', { ...base, region: REGION })
      return limpiar(filtrarCines(d.results), 'movie')
    }
    if (modo === 'tendencias') {
      const d = await pedir(`/trending/${esPeli ? 'movie' : 'tv'}/week`, base)
      return limpiar(filtrarBase(d.results, esPeli), esPeli ? 'movie' : 'tv')
    }
    if (modo === 'populares') {
      const d = await pedir(`/${esPeli ? 'movie' : 'tv'}/popular`, { ...base, region: REGION })
      return limpiar(filtrarBase(d.results, esPeli), esPeli ? 'movie' : 'tv')
    }
    if (modo === 'valoradas') {
      const d = await pedir(`/${esPeli ? 'movie' : 'tv'}/top_rated`, { ...base, region: REGION })
      return limpiar(filtrarBase(d.results, esPeli), esPeli ? 'movie' : 'tv')
    }
  }

  // /discover: acepta plataformas, género y orden
  const p = {
    ...base,
    watch_region: REGION,
    include_adult: 'false',
    'vote_count.gte': String(
      modo === 'valoradas' ? VOTOS.valoradas : calidad ? VOTOS.calidad : VOTOS.normal
    ),
    'vote_average.gte': String(
      calidad
        ? (esPeli ? NOTA_MINIMA : NOTA_MINIMA_TV)
        : (esPeli ? NOTA_MINIMA_ANADIR : NOTA_MINIMA_ANADIR_TV)
    )
  }

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
export const barajar = l => {
  const a = [...l]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export async function estrenos(pagina = 1) {
  const hoy = new Date()
  const dia = t => new Date(hoy.getTime() - t * 864e5).toISOString().slice(0, 10)


  /**
   * El listón sube con la antigüedad. Una película de hace dos semanas no
   * ha tenido tiempo de acumular votos; una de hace un año sí, así que si
   * apenas tiene, por algo será. Las series piden bastante menos: acumulan
   * votos más despacio porque hay que verse varios episodios antes de
   * puntuar, así que con el mismo listón que las pelis casi no salían.
   */
  const ventanas = [
    { desde: dia(92),  hasta: dia(0),   votos: '100', votosTv: '70' },
    { desde: dia(184), hasta: dia(93),  votos: '200', votosTv: '140' },
    { desde: dia(400), hasta: dia(185), votos: '400', votosTv: '280' },
    { desde: dia(548), hasta: dia(401), votos: '600', votosTv: '420' }
  ]

  // Las páginas van en orden (1, 2, 3...) y la variedad viene de barajar
  // cada ventana por dentro (ver abajo). Antes la primera tanda era una
  // página al azar entre la 1 y la 3 y la segunda ya la 4: si tocaba la 3,
  // la 1 y la 2 (los estrenos más recientes) no salían en toda la sesión.
  const comun = {
    page: String(pagina),
    watch_region: REGION,
    with_watch_monetization_types: 'flatrate',
    include_adult: 'false'
  }

  const [mapaPelis, mapaSeries] = await Promise.all([mapaGeneros('movie'), mapaGeneros('tv')])

  const tandas = await Promise.all(
    ventanas.flatMap(v => [
      pedir('/discover/movie', {
        ...comun,
        'vote_count.gte': v.votos,
        'vote_average.gte': String(NOTA_MINIMA_ESTRENOS),
        sort_by: 'primary_release_date.desc',
        'primary_release_date.gte': v.desde,
        'primary_release_date.lte': v.hasta
      }).then(d => limpiar(d.results, 'movie', mapaPelis)).catch(() => []),
      pedir('/discover/tv', {
        ...comun,
        'vote_count.gte': v.votosTv,
        'vote_average.gte': String(NOTA_MINIMA_ESTRENOS_TV),
        sort_by: 'first_air_date.desc',
        'first_air_date.gte': v.desde,
        'first_air_date.lte': v.hasta
      }).then(d => limpiar(d.results, 'tv', mapaSeries)).catch(() => [])
    ])
  )

  // Cada ventana se baraja por dentro, pero las más recientes siguen
  // saliendo antes: así hay variedad sin perder el sentido de "estrenos".
  const salida = []
  const vistos = new Set()
  for (let v = 0; v < ventanas.length; v++) {
    const mezcla = barajar([...tandas[v * 2], ...tandas[v * 2 + 1]])
    for (const x of mezcla) {
      const clave = `${x.tipo}-${x.tmdb_id}`
      if (vistos.has(clave)) continue
      vistos.add(clave)
      salida.push(x)
    }
  }
  return salida
}

const GENERO_ANIMACION = 16

/**
 * La animación (sobre todo el anime en series) copa el top por nota:
 * tiene un público muy fiel que puntúa alto y en masa. Se le exige más
 * nota que al resto (distinta para pelis y series) y además se deja
 * pasar como mucho 1 de cada 6, para que siga saliendo pero sin
 * comerse el resto.
 */
function limitarAnimacion(resultados, notaMinima) {
  const anim = resultados.filter(x => x.genre_ids?.includes(GENERO_ANIMACION) && x.vote_average >= notaMinima)
  const resto = resultados.filter(x => !x.genre_ids?.includes(GENERO_ANIMACION))
  const maxAnim = Math.ceil(resto.length / 5)
  return [...resto, ...anim.slice(0, maxAnim)]
}

/**
 * Lo mejor valorado de hace más de año y medio: el complemento de
 * Estrenos, que ya cubre hasta ahí, así que aquí no hace falta elegir
 * año ni repetir lo que se ve del otro lado. Las páginas se recorren en
 * un orden al azar (ver ordenTop) y cada tanda se baraja: si no, saldrían
 * siempre las mismas en el mismo orden cada vez que se abre.
 *
 * El mínimo de votos es alto (3000 en pelis) a propósito: con 300 se
 * colaban títulos de nicho (un drama coreano, una serie infantil...) con
 * nota muy alta pero votados por un puñado de fans, compitiendo de tú a
 * tú con títulos que ha visto todo el mundo. En series el listón baja a
 * 2000: acumulan votos más despacio que las pelis (hay que verse varios
 * episodios antes de puntuar) y con 3000 casi no quedaba ninguna. Se
 * ordena por popularidad y no por nota para que, dentro de ese grupo ya
 * filtrado por calidad, salgan antes los títulos que la gente realmente
 * conoce.
 */
// Top recorre TODAS las páginas de TMDB en un orden al azar (con ventaja
// para las más populares), distinto cada vez que se abre, y sin repetir. Antes empezaba
// siempre entre las 3 primeras (las más populares) y seguía en orden:
// por eso salían tanto las mismas.
let ordenTop = null
// cuántas páginas hay de cada tipo: cambia poco, se guarda un día
const TOTALES_TOP = 'sd:top-totales'

async function totalesTop(comun, filtroPelis, filtroSeries) {
  try {
    const g = JSON.parse(localStorage.getItem(TOTALES_TOP) || 'null')
    if (g && Date.now() - g.t < 864e5) return g
  } catch { /* sin almacenamiento: se pregunta */ }
  const [a, b] = await Promise.all([
    pedir('/discover/movie', { ...comun, ...filtroPelis, page: '1' }),
    pedir('/discover/tv', { ...comun, ...filtroSeries, page: '1' })
  ])
  // TMDB no deja pasar de la página 500
  const t = { t: Date.now(), pelis: Math.min(a.total_pages || 1, 500), series: Math.min(b.total_pages || 1, 500) }
  try { localStorage.setItem(TOTALES_TOP, JSON.stringify(t)) } catch { /* privada */ }
  return t
}

/**
 * Las páginas 1..n en un orden al azar, pero con más papeletas para las
 * primeras (las más populares, porque se ordena por popularidad): la
 * página p pesa 1/p. Así, de las 6 primeras páginas que salen (3 tandas),
 * unas 3,5 son de las 10 más populares, frente a ~1 con un orden al azar
 * normal; el resto sigue saliendo, solo que más adelante.
 */
function alAzarConPeso(n) {
  return Array.from({ length: n }, (_, i) => i + 1)
    .map(p => ({ p, k: -Math.log(Math.random() || 1e-9) * p }))
    .sort((a, b) => a.k - b.k)
    .map(x => x.p)
}

export async function topValoradas(pagina = 1) {
  const hace = new Date(Date.now() - 548 * 864e5).toISOString().slice(0, 10)

  const comun = {
    watch_region: REGION,
    include_adult: 'false',
    sort_by: 'popularity.desc'
  }
  const filtroPelis = { 'vote_count.gte': '3000', 'vote_average.gte': String(NOTA_MINIMA_TOP), 'primary_release_date.lte': hace }
  const filtroSeries = { 'vote_count.gte': '2000', 'vote_average.gte': String(NOTA_MINIMA_TOP_TV), 'first_air_date.lte': hace }

  if (pagina === 1 || !ordenTop) {
    const tot = await totalesTop(comun, filtroPelis, filtroSeries)
    ordenTop = { pelis: alAzarConPeso(tot.pelis), series: alAzarConPeso(tot.series) }
  }

  // Dos páginas de películas por cada una de series: salen más pelis que
  // series (unas 2 de cada 3). Si ya no quedan páginas de un tipo, esa
  // parte viene vacía; cuando se acaban las dos, la tanda sale vacía y la
  // lista sabe que ha llegado al final.
  const pagPelis = [ordenTop.pelis[2 * (pagina - 1)], ordenTop.pelis[2 * (pagina - 1) + 1]]
  const pagSeries = ordenTop.series[pagina - 1]
  const pide = (ruta, filtro, pg, tipo, mapa, notaAnim) => (pg
    ? pedir(ruta, { ...comun, ...filtro, page: String(pg) })
        .then(d => limpiar(limitarAnimacion(d.results, notaAnim), tipo, mapa))
        .catch(() => [])
    : Promise.resolve([]))

  const [mapaPelis, mapaSeries] = await Promise.all([mapaGeneros('movie'), mapaGeneros('tv')])

  const [pelis1, pelis2, series] = await Promise.all([
    ...pagPelis.map(pg => pide('/discover/movie', filtroPelis, pg, 'movie', mapaPelis, NOTA_MINIMA_ANIMACION_TOP)),
    pide('/discover/tv', filtroSeries, pagSeries, 'tv', mapaSeries, NOTA_MINIMA_ANIMACION_TOP_TV)
  ])

  return barajar([...pelis1, ...pelis2, ...series])
}

/**
 * Busca el tráiler en YouTube. Prioriza España; si no lo hay,
 * cae al original en vez de dejarlo vacío.
 */
// Los tráileres de otro país (el "UK Trailer", el australiano...) a menudo
// están bloqueados en España y YouTube no deja reproducirlos: pasa, por
// ejemplo, con "Una noche al año". Se dejan para el final.
const DE_OTRO_PAIS = /\b(uk|u\.k\.|australia|australian|canada|canadian|india|irish|nz|new zealand|south africa)\b/i

const listas = new Map()

/**
 * Todos los tráileres de YouTube de un título, del mejor al peor: primero
 * en español, luego en inglés; tráileres antes que teasers, y los de otro
 * país al final. Si el primero no se puede reproducir, el reproductor
 * prueba el siguiente.
 */
export function buscarTrailers(tmdbId, tipo) {
  const clave = `${tipo}-${tmdbId}`
  if (listas.has(clave)) return listas.get(clave)
  const ruta = `/${tipo === 'tv' ? 'tv' : 'movie'}/${tmdbId}/videos`
  const promesa = (async () => {
    // los dos idiomas a la vez: uno detrás de otro se notaba al arrancar
    const respuestas = await Promise.all(['es-ES', 'en-US'].map(idioma =>
      pedir(ruta, { language: idioma }).catch(() => ({ results: [] }))))
    const claves = []
    const nota = x => (x.type === 'Trailer' ? 0 : 2) + (DE_OTRO_PAIS.test(x.name || '') ? 1 : 0)
    // el español primero, luego el inglés: el orden del array lo mantiene
    for (const d of respuestas) {
      ;(d.results || [])
        .filter(x => x.site === 'YouTube' && (x.type === 'Trailer' || x.type === 'Teaser'))
        .sort((x, y) => nota(x) - nota(y))
        .forEach(x => { if (!claves.includes(x.key)) claves.push(x.key) })
    }
    // Último recurso, solo si no hay ni tráiler ni teaser: la cabecera de
    // la serie, un clip o un reportaje (a "Pequeñas mentirosas" solo le
    // quedan esos). Tomas falsas y "detrás de las cámaras" no: no dan
    // idea de qué va.
    if (!claves.length) {
      const orden = ['Opening Credits', 'Clip', 'Featurette']
      for (const d of respuestas) {
        ;(d.results || [])
          .filter(x => x.site === 'YouTube' && orden.includes(x.type))
          .sort((x, y) => orden.indexOf(x.type) - orden.indexOf(y.type))
          .forEach(x => { if (!claves.includes(x.key)) claves.push(x.key) })
      }
    }
    return claves
  })()
  listas.set(clave, promesa)
  // si falla del todo, que se pueda volver a pedir
  promesa.then(l => { if (!l.length) listas.delete(clave) })
  return promesa
}

/** El mejor tráiler de un título (clave de YouTube), o '' si no hay. */
export async function buscarTrailer(tmdbId, tipo) {
  const l = await buscarTrailers(tmdbId, tipo)
  return l[0] || ''
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
