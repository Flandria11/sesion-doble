import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase'
import { cargarYT } from './lib/youtube'
import { buscar, explorar, estrenos, topValoradas, MODOS, ANOS, plataformas, generosLista, buscarTrailer, buscarTrailers, generos, dondeVerla, barajar } from './lib/tmdb'

/** Supabase manda el motivo repartido en varios campos; sin ellos un 400
 *  no dice nada. */
const detalle = e =>
  [e.message, e.details, e.hint, e.code && `(${e.code})`].filter(Boolean).join(' · ')

/* ======================= raíz ======================= */
export default function App() {
  const [sesion, setSesion] = useState(undefined)
  const [pareja, setPareja] = useState(undefined)
  const [parejas, setParejas] = useState([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      // Supabase refresca el token solo con recuperar el foco de la
      // pestaña o volver de otra app: si eso resetea `pareja`, toda la
      // pantalla se desmonta (por el "if (pareja === undefined)" de más
      // abajo) y se pierde el estado en marcha, como los filtros puestos
      // en Añadir. Si sigue siendo el mismo usuario, no hay nada que
      // recargar.
      setSesion(prev => {
        if (!(prev && s && prev.user.id === s.user.id)) setPareja(undefined)
        return s
      })
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Se puede pertenecer a varios grupos: con la novia, con amigos… El
  // elegido se recuerda en este dispositivo.
  const cargarPareja = useCallback(async () => {
    if (!sesion) return
    const { data } = await supabase
      .from('miembros')
      .select('pareja_id, parejas(codigo)')
      .eq('usuario_id', sesion.user.id)
    const lista = (data || []).map(x => ({ id: x.pareja_id, codigo: x.parejas?.codigo }))
    setParejas(lista)

    let elegida = null
    try {
      const guardada = localStorage.getItem('sd:pareja')
      elegida = lista.find(x => x.id === guardada) || null
    } catch (e) { /* navegación privada */ }
    setPareja(elegida || lista[0] || null)
  }, [sesion])

  useEffect(() => { if (sesion) cargarPareja() }, [sesion, cargarPareja])

  function cambiarPareja(p) {
    try { localStorage.setItem('sd:pareja', p.id) } catch (e) { /* privada */ }
    setPareja(p)
  }

  if (sesion === undefined) return <Marco><div className="cargando">Abriendo la taquilla…</div></Marco>
  if (!sesion) return <Marco sub="Dos listas, un plan"><Acceso /></Marco>
  if (pareja === undefined) return <Marco><div className="cargando">Cargando…</div></Marco>
  if (!pareja) return <Marco sub="Falta entrar en un grupo"><Emparejar alUnir={cargarPareja} /></Marco>

  return (
    <Principal key={pareja.id} sesion={sesion} pareja={pareja}
      parejas={parejas} onCambiarPareja={cambiarPareja} onRecargarParejas={cargarPareja} />
  )
}

function Marco({ children, sub }) {
  return (
    <div className="app">
      <header>
        <div className="bombillas"><i /><i /><i /><i /><i /><i /><i /></div>
        <h1>DOS BUTACAS</h1>
        {sub && <div className="sub">{sub}</div>}
      </header>
      <main>{children}</main>
    </div>
  )
}

/* ======================= acceso ======================= */
function Acceso() {
  const [modo, setModo] = useState('entrar')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function enviar() {
    setError(''); setOcupado(true)
    const r = modo === 'entrar'
      ? await supabase.auth.signInWithPassword({ email, password: pass })
      : await supabase.auth.signUp({ email, password: pass, options: { data: { nombre } } })
    setOcupado(false)
    if (r.error) setError(traducir(r.error.message))
  }

  return (
    <div className="acceso">
      <h2>{modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}</h2>
      <p>Cada uno apunta pelis y series; los demás dicen sí o no. Cuando coincidís, hay plan.</p>
      {error && <div className="error">{error}</div>}
      {modo === 'registro' && (
        <input type="text" placeholder="Tu nombre" value={nombre}
          onChange={e => setNombre(e.target.value)} autoComplete="nickname" />
      )}
      <input type="email" placeholder="Correo" value={email}
        onChange={e => setEmail(e.target.value)} autoComplete="email" />
      <input type="password" placeholder="Contraseña" value={pass}
        onChange={e => setPass(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && enviar()}
        autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} />
      <button className="btn" onClick={enviar} disabled={ocupado || !email || !pass}>
        {ocupado ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
      </button>
      <button className="enlace" onClick={() => { setModo(modo === 'entrar' ? 'registro' : 'entrar'); setError('') }}>
        {modo === 'entrar' ? 'No tengo cuenta todavía' : 'Ya tengo cuenta'}
      </button>
    </div>
  )
}

function traducir(m = '') {
  if (/Invalid login/i.test(m)) return 'Correo o contraseña incorrectos.'
  if (/already registered/i.test(m)) return 'Ese correo ya tiene cuenta. Prueba a entrar.'
  if (/at least 6/i.test(m)) return 'La contraseña necesita 6 caracteres como mínimo.'
  if (/Email not confirmed/i.test(m)) return 'Falta confirmar el correo. Revisa tu bandeja.'
  return m
}

/* ======================= emparejar ======================= */
function Emparejar({ alUnir }) {
  const [codigo, setCodigo] = useState('')
  const [mio, setMio] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function crear() {
    setError(''); setOcupado(true)
    const { data, error } = await supabase.rpc('crear_pareja')
    setOcupado(false)
    if (error) return setError(error.message)
    setMio(data)
  }

  async function unirse() {
    setError(''); setOcupado(true)
    const { error } = await supabase.rpc('unirse_pareja', { cod: codigo })
    setOcupado(false)
    if (error) return setError('No existe ningún grupo con ese código.')
    alUnir()
  }

  if (mio) {
    return (
      <div className="acceso">
        <h2>Tu código</h2>
        <p>Pásaselo a quien quieras. Lo mete al entrar y quedáis conectados.</p>
        <div className="codigo">{mio}</div>
        <button className="btn" onClick={alUnir}>Ya se lo he pasado</button>
      </div>
    )
  }

  return (
    <div className="acceso">
      <h2>Tu grupo</h2>
      <p>Uno crea el código y los demás lo introducen. Solo hay que hacerlo una vez.</p>
      {error && <div className="error">{error}</div>}
      <button className="btn" onClick={crear} disabled={ocupado}>Crear un código</button>
      <div style={{ margin: '26px 0 10px', color: 'var(--paso)', fontSize: 13 }}>o</div>
      <input type="text" placeholder="Código del grupo" value={codigo}
        onChange={e => setCodigo(e.target.value.toUpperCase())}
        onKeyDown={e => e.key === 'Enter' && unirse()} />
      <button className="btn suave" onClick={unirse} disabled={ocupado || codigo.length < 4}>
        Unirme
      </button>
    </div>
  )
}

/* ======================= app principal ======================= */
function Principal({ sesion, pareja, parejas, onCambiarPareja, onRecargarParejas }) {
  const yo = sesion.user.id
  // la pestaña se recuerda, para no volver siempre a Añadir al recargar
  const [vista, setVista] = useState(() => {
    try {
      const v = localStorage.getItem('sd:vista')
      return ['buscar', 'reel', 'votar', 'mias', 'match'].includes(v) ? v : 'buscar'
    } catch (e) {
      return 'buscar'
    }
  })

  useEffect(() => {
    try { localStorage.setItem('sd:vista', vista) } catch (e) { /* navegación privada */ }
  }, [vista])
  const [titulos, setTitulos] = useState([])
  const [votos, setVotos] = useState([])
  const [nombres, setNombres] = useState({})
  const [descartes, setDescartes] = useState([])
  const [guardados, setGuardados] = useState([])
  const [aviso, setAviso] = useState('')
  const [ajustes, setAjustes] = useState(false)
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    const [t, v, p, d, g] = await Promise.all([
      supabase.from('titulos').select('*').eq('pareja_id', pareja.id).order('creado', { ascending: false }),
      supabase.from('votos').select('*'),
      supabase.from('perfiles').select('id, nombre'),
      supabase.from('descartes').select('*'),
      supabase.from('guardados').select('*').order('creado', { ascending: false })
    ])
    // si una consulta falla, se deja lo que ya había en vez de vaciarlo:
    // mejor una lista algo vieja que una lista vacía que no es verdad
    if (!t.error) setTitulos(t.data || [])
    if (!v.error) setVotos(v.data || [])
    if (!p.error) setNombres(Object.fromEntries((p.data || []).map(x => [x.id, x.nombre || 'Alguien'])))
    if (!d.error) setDescartes(d.data || [])
    if (!g.error) setGuardados(g.data || [])
    setCargando(false)
    // si alguna consulta falla, se avisa en vez de dejar la pantalla a medias
    const fallo = [t, v, p, d, g].find(r => r && r.error)
    if (fallo) setAviso(`Error al cargar: ${fallo.error.message}`)
  }, [pareja.id])

  useEffect(() => { recargar() }, [recargar])

  // refresco en vivo: si la otra persona añade o vota, aparece solo
  useEffect(() => {
    const canal = supabase
      .channel('sesion-doble')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'titulos' }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votos' }, recargar)
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [recargar])

  const mios = titulos.filter(t => t.propuesto_por === yo)
  const suyos = titulos.filter(t => t.propuesto_por !== yo)
  const miVoto = id => votos.find(v => v.titulo_id === id && v.usuario_id === yo)?.voto
  const suVoto = id => votos.find(v => v.titulo_id === id && v.usuario_id !== yo)?.voto
  const cola = suyos.filter(t => !miVoto(t.id))
  const matches = [
    ...mios.filter(t => suVoto(t.id) === 'si'),
    ...suyos.filter(t => miVoto(t.id) === 'si')
  ]

  async function votar(tituloId, voto) {
    const anterior = votos.find(v => v.titulo_id === tituloId && v.usuario_id === yo)
    setVotos(v => [...v.filter(x => !(x.titulo_id === tituloId && x.usuario_id === yo)),
      { titulo_id: tituloId, usuario_id: yo, voto }])
    const { error } = await supabase.from('votos').upsert(
      { titulo_id: tituloId, usuario_id: yo, voto },
      { onConflict: 'titulo_id,usuario_id' }
    )
    if (error) {
      console.error('votos:', error)
      setAviso('No se ha podido guardar el voto: ' + detalle(error))
      // se deshace: sin esto, el voto se veía puesto aunque no se hubiera
      // guardado, y desaparecía solo en el siguiente refresco
      setVotos(v => {
        const sinEste = v.filter(x => !(x.titulo_id === tituloId && x.usuario_id === yo))
        return anterior ? [...sinEste, anterior] : sinEste
      })
    }
  }

  async function anadir(p, nota = '') {
    // La búsqueda de TMDB no trae ni el tráiler ni los géneros: hay que
    // pedirlos aparte. Sin esto, las propuestas se guardaban sin vídeo y
    // en Votar solo se veía la carátula.
    const [trailer, genero] = await Promise.all([
      p.trailer ? Promise.resolve(p.trailer) : buscarTrailer(p.tmdb_id, p.tipo),
      p.genero ? Promise.resolve(p.genero) : generos(p.tmdb_id, p.tipo)
    ])

    const { data, error } = await supabase.from('titulos').insert({
      pareja_id: pareja.id, propuesto_por: yo,
      tmdb_id: p.tmdb_id, tipo: p.tipo, titulo: p.titulo,
      anio: p.anio, cartel: p.cartel, fondo: p.fondo,
      sinopsis: p.sinopsis, trailer: trailer || null, genero: genero || null,
      nota: nota || null
    }).select().single()
    if (error) { console.error('titulos:', error); setAviso('No se ha podido proponer: ' + detalle(error)); return null }
    recargar()
    return data
  }

  // Los descartes son personales: lo que tú apartas, ella lo sigue viendo.
  const descartada = p => descartes.some(x => x.tmdb_id === p.tmdb_id && x.tipo === p.tipo)
  const motivoDescarte = p =>
    (descartes.find(x => x.tmdb_id === p.tmdb_id && x.tipo === p.tipo) || {}).motivo

  async function descartar(p, motivo = 'no_interesa') {
    const fila = {
      usuario_id: yo, tmdb_id: p.tmdb_id, tipo: p.tipo, motivo,
      titulo: p.titulo || '', cartel: p.cartel || '', anio: p.anio || ''
    }
    setDescartes(l => [
      ...l.filter(d => !(d.tmdb_id === p.tmdb_id && d.tipo === p.tipo)),
      fila
    ])

    const { error } = await supabase.from('descartes')
      .upsert(fila, { onConflict: 'usuario_id,tmdb_id,tipo' })

    if (error) {
      console.error('descartes:', error)
      setAviso('No se ha podido guardar: ' + detalle(error))
      setDescartes(l => l.filter(d => !(d.tmdb_id === p.tmdb_id && d.tipo === p.tipo)))
      return
    }
    setAviso('')

    // si la habías propuesto tú, se retira: no tiene sentido seguir
    // proponiendo algo que acabas de apartar
    const mia = titulos.find(t => t.tmdb_id === p.tmdb_id && t.tipo === p.tipo && t.propuesto_por === yo)
    if (mia) await quitar(mia.id)
  }

  async function recuperar(p) {
    setDescartes(l => l.filter(d => !(d.tmdb_id === p.tmdb_id && d.tipo === p.tipo)))
    const { error } = await supabase.from('descartes').delete()
      .eq('usuario_id', yo).eq('tmdb_id', p.tmdb_id).eq('tipo', p.tipo)
    if (error) setAviso(`No se ha podido deshacer: ${error.message}`)
  }

  // Lista personal: lo que te apetece a ti y no quieres proponer todavía.
  const guardada = p => guardados.some(x => x.tmdb_id === p.tmdb_id && x.tipo === p.tipo)

  async function guardar(p) {
    const fila = {
      usuario_id: yo, tmdb_id: p.tmdb_id, tipo: p.tipo, titulo: p.titulo,
      anio: p.anio || '', cartel: p.cartel || '', fondo: p.fondo || '',
      sinopsis: p.sinopsis || '', trailer: p.trailer || '', genero: p.genero || ''
    }
    setGuardados(l => [fila, ...l])
    const { error } = await supabase.from('guardados').upsert(fila, { onConflict: 'usuario_id,tmdb_id,tipo' })
    if (error) {
      setAviso('No se ha podido guardar: ' + detalle(error))
      setGuardados(l => l.filter(x => !(x.tmdb_id === p.tmdb_id && x.tipo === p.tipo)))
    }
  }

  async function olvidar(p) {
    setGuardados(l => l.filter(x => !(x.tmdb_id === p.tmdb_id && x.tipo === p.tipo)))
    await supabase.from('guardados').delete()
      .eq('usuario_id', yo).eq('tmdb_id', p.tmdb_id).eq('tipo', p.tipo)
  }

  // comentario que acompaña a una propuesta
  async function comentar(id, nota) {
    const anterior = (titulos.find(t => t.id === id) || {}).nota
    setTitulos(l => l.map(t => (t.id === id ? { ...t, nota } : t)))
    const { error } = await supabase.from('titulos').update({ nota }).eq('id', id)
    if (error) {
      setAviso('No se ha podido guardar el comentario: ' + detalle(error))
      // se deshace: si no, se veía el comentario nuevo como guardado
      // aunque el servidor lo hubiera rechazado
      setTitulos(l => l.map(t => (t.id === id ? { ...t, nota: anterior } : t)))
    }
  }

  /**
   * Rectificar desde coincidencias: si la propuse yo, no puedo cambiar el
   * voto de la otra persona, así que retiro mi propuesta. Si la propuso
   * ella, cambio mi voto. En los dos casos sale de coincidencias.
   */
  async function rectificar(p, voto) {
    if (p.propuesto_por === yo) await quitar(p.id)
    else await votar(p.id, voto)
  }

  async function quitar(id) {
    const anterior = titulos.find(x => x.id === id)
    setTitulos(t => t.filter(x => x.id !== id))
    const { error } = await supabase.from('titulos').delete().eq('id', id)
    if (error) {
      console.error('titulos:', error)
      setAviso('No se ha podido retirar la propuesta: ' + detalle(error))
      // se recupera: si no, se veía retirada aunque el borrado hubiera
      // fallado, y reaparecía sola de la nada en el siguiente refresco
      if (anterior) setTitulos(t => [...t, anterior])
    }
  }

  const pestanas = [
    ['buscar', 'Añadir', 0],
    ['reel', 'Ver', 0],
    ['votar', 'Votar', cola.length],
    ['match', 'Coinciden', matches.length],
    ['mias', 'Mis pelis', 0]
  ]

  return (
    <div className="app">
      <header>
        <div className="bombillas"><i /><i /><i /><i /><i /><i /><i /></div>
        <h1>DOS BUTACAS</h1>
        <div className="sub">Código {pareja.codigo}</div>
        <button className="perfil" onClick={() => setAjustes(true)}
          aria-label="Tu cuenta y ajustes">
          {(nombres[yo] && nombres[yo] !== 'Alguien' ? nombres[yo] : sesion.user.email)
            .trim().charAt(0).toUpperCase()}
        </button>
      </header>
      <main key={vista} className="entra">
        {aviso && (
          <div className="error" onClick={() => setAviso('')} role="alert">{aviso}</div>
        )}
        {cargando ? <div className="cargando">Cargando…</div> : (
          <>
            {vista === 'buscar' && <Anadir titulos={titulos} yo={yo} nombres={nombres}
                miVoto={miVoto} onAdd={anadir} onVotar={votar}
                descartada={descartada} motivoDescarte={motivoDescarte}
                onDescartar={descartar} onRecuperar={recuperar}
                guardada={guardada} onGuardar={guardar} onOlvidar={olvidar} />}
            {vista === 'reel' && <Ver titulos={titulos} yo={yo}
                miVoto={miVoto} onAdd={anadir} onVotar={votar}
                descartada={descartada} onDescartar={descartar}
                guardada={guardada} onGuardar={guardar} onComentar={comentar} />}
            {vista === 'votar' && <Votar cola={cola} nombres={nombres} onVotar={votar} />}
            {vista === 'mias' && <Mias lista={mios} suVoto={suVoto} onQuitar={quitar}
                guardados={guardados} guardada={guardada} onGuardar={guardar} onOlvidar={olvidar}
                descartada={descartada} motivoDescarte={motivoDescarte}
                onDescartar={descartar} onRecuperar={recuperar}
                onComentar={comentar} codigo={pareja.codigo}
                todos={titulos} votos={votos} descartes={descartes} yo={yo}
                onVotarTitulo={votar} />}
            {vista === 'match' && <Matches lista={matches} onRectificar={rectificar}
                guardada={guardada} onGuardar={guardar} onOlvidar={olvidar} />}
          </>
        )}
      </main>
      {ajustes && (
        <Ajustes yo={yo} nombres={nombres} parejas={parejas} pareja={pareja}
          email={sesion.user.email}
          onCambiarPareja={onCambiarPareja} onRecargarParejas={onRecargarParejas}
          onSalir={() => supabase.auth.signOut()}
          onCerrar={() => setAjustes(false)} />
      )}

      <nav>
        {pestanas.map(([id, texto, num]) => (
          <button key={id} className={vista === id ? 'activo' : ''} onClick={() => setVista(id)}>
            {texto}{num > 0 && <span className="num">{num}</span>}
            <span className="pin" />
          </button>
        ))}
      </nav>
    </div>
  )
}

/* ======================= añadir ======================= */
// cuántos títulos nuevos (ni propuestos, ni coincididos, ni descartados) se
// intentan reunir por carga, y cuántas páginas de TMDB como máximo se piden
// para lograrlo antes de rendirse
const OBJETIVO_NOVEDADES = 12
const PAGINAS_MAX_POR_CARGA = 6

function Anadir({ titulos, yo, nombres, miVoto, onAdd, onVotar, descartada, motivoDescarte, onDescartar, onRecuperar, guardada, onGuardar, onOlvidar }) {
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState('movie')
  const [modo, setModo] = useState('tendencias')
  const [provs, setProvs] = useState([])
  const [genero, setGenero] = useState('')
  const [anio, setAnio] = useState('')
  const [calidad, setCalidad] = useState(false)
  const [pagina, setPagina] = useState(1)

  const [plats, setPlats] = useState([])
  const [gens, setGens] = useState([])
  const [res, setRes] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [anadiendo, setAnadiendo] = useState(null)
  const [ficha, setFicha] = useState(null)
  const [fiesta, setFiesta] = useState(null)
  const [verTodo, setVerTodo] = useState(false)
  const [panel, setPanel] = useState(false)
  const [agotado, setAgotado] = useState(false)
  const filaPlats = useRef(null)
  // página real de TMDB que toca pedir a continuación: puede ir por delante
  // de `pagina` (que solo cuenta "cargas" del usuario) porque una sola carga
  // puede consumir varias páginas de TMDB hasta reunir resultados nuevos
  const proximaPaginaTmdb = useRef(1)

  // catálogos de filtros: cambian según sean pelis o series
  useEffect(() => {
    let vivo = true
    plataformas(tipo).then(p => vivo && setPlats(p)).catch(() => {})
    generosLista(tipo).then(g => vivo && setGens(g)).catch(() => {})
    return () => { vivo = false }
  }, [tipo])

  // búsqueda por texto
  useEffect(() => {
    if (q.trim().length < 2) return
    let vivo = true
    setCargando(true)
    const t = setTimeout(async () => {
      try {
        const r = await buscar(q.trim())
        if (vivo) { setRes(r); setError('') }
      } catch (e) {
        if (vivo) setError('No se ha podido consultar TMDB.')
      } finally {
        if (vivo) setCargando(false)
      }
    }, 400)
    return () => { vivo = false; clearTimeout(t) }
  }, [q])

  // exploración con filtros
  useEffect(() => {
    if (q.trim().length >= 2) return
    if (pagina === 1) {
      // Sin esto, la tarjeta más popular (la última superproducción, por
      // ejemplo) salía siempre en la primera pantalla, solo cambiando de
      // posición entre 1ª y 12ª por el barajado. Al arrancar a veces desde
      // una página más allá, algunas cargas no la traen en absoluto. Solo
      // se hace con filtros anchos (sin plataforma/género/año/nota): con
      // filtros estrechos hay pocas páginas y arrancar lejos podía dejar
      // la exploración vacía a la primera.
      const barajable = modo !== 'valoradas' && modo !== 'novedades'
      proximaPaginaTmdb.current = (barajable && !hayFiltros) ? 1 + Math.floor(Math.random() * 4) : 1
    }
    let vivo = true
    setCargando(true)
    // pequeño respiro antes de pedir y redibujar: sin esto, mover el
    // desplegable de año/género con las flechas del teclado disparaba
    // una petición y un vaciado de la lista por cada tecla, y ese trabajo
    // competía con el propio desplegable nativo hasta hacerlo ir a saltos
    const t = setTimeout(async () => {
      try {
        // Cada página de TMDB trae 20 títulos, pero aquí se esconde lo ya
        // decidido (propuesto, coincidido o descartado): si se pidiera solo
        // una página, muchas veces casi todo estaba ya visto y apenas
        // quedaban dos o tres tarjetas. Se encadenan páginas hasta reunir
        // un puñado de novedades de verdad, con un tope para no disparar
        // peticiones sin fin si los filtros son muy estrechos.
        // TMDB puede repetir un título entre páginas consecutivas (el orden
        // por popularidad se reordena entre peticiones), así que se filtran
        // duplicados por id además de por lo ya decidido
        const clave = p => `${p.tipo}-${p.tmdb_id}`
        let nuevos = []
        const vistos = new Set()
        let novedades = 0
        let vueltas = 0
        let agotadas = false
        while (vivo && vueltas < PAGINAS_MAX_POR_CARGA && novedades < OBJETIVO_NOVEDADES) {
          const r = await explorar({ tipo, modo, proveedores: provs, genero, anio, calidad, pagina: proximaPaginaTmdb.current })
          vueltas++
          proximaPaginaTmdb.current++
          if (!r.length) { agotadas = true; break }
          for (const p of r) {
            if (vistos.has(clave(p))) continue
            vistos.add(clave(p))
            nuevos.push(p)
            if (verTodo || !decidido(p)) novedades++
          }
        }
        if (!vivo) return
        // Tendencias/Populares/Cines siempre traen el mismo orden de TMDB, así
        // que cada visita repetía exactamente las mismas primeras tarjetas.
        // Se baraja aquí (no en Valoradas ni Novedades, donde el orden sí
        // significa algo: nota o fecha de estreno).
        const barajable = modo !== 'valoradas' && modo !== 'novedades'
        const listos = barajable ? barajar(nuevos) : nuevos
        setRes(ant => {
          if (pagina === 1) return listos
          const previos = new Set(ant.map(clave))
          return [...ant, ...listos.filter(p => !previos.has(clave(p)))]
        })
        setAgotado(agotadas)
        setError('')
      } catch (e) {
        if (vivo) setError('No se ha podido consultar TMDB.')
      } finally {
        if (vivo) setCargando(false)
      }
    }, 220)
    return () => { vivo = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- verTodo solo
    // decide cuánto prefetch hace falta en esta carga, no debe disparar una
    // nueva por sí solo: alternarlo ya revela lo escondido del `res` actual
  }, [tipo, modo, provs, genero, anio, calidad, pagina, q])

  const estado = p => {
    const x = titulos.find(t => t.tmdb_id === p.tmdb_id && t.tipo === p.tipo)
    if (!x) return null
    if (x.propuesto_por === yo) return { tipo: 'mio', t: x }
    const v = miVoto(x.id)
    if (v === 'si') return { tipo: 'coincide', t: x }
    return { tipo: 'suyo', t: x }
  }

  async function actuar(p, nota = '') {
    const e = estado(p)
    if (anadiendo || (e && (e.tipo === 'mio' || e.tipo === 'coincide'))) return
    setAnadiendo(p.tmdb_id)
    // el finally es el que importa: si onVotar/onAdd fallara sin avisar,
    // anadiendo se quedaba puesto para siempre y ya no dejaba tocar nada
    // más, aunque fuera en otra tarjeta
    try {
      if (e) {
        // esta ya la propuso la otra persona: si ya habías votado que no o
        // que vista, el botón de proponer no debe pisar ese voto sin avisar
        const v = miVoto(e.t.id)
        if (v === 'no' || v === 'vista') {
          setFlash(v === 'no' ? `Ya dijiste que ${p.titulo} no te interesa`
            : `Ya habías marcado ${p.titulo} como vista`)
          setTimeout(() => setFlash(''), 3200)
          return
        }
        await onVotar(e.t.id, 'si')
        setFiesta(p)
      } else {
        const ok = await onAdd(p, nota)
        if (ok) {
          setFlash(`${p.titulo} está en tu lista`)
          setTimeout(() => setFlash(''), 2600)
        }
      }
    } finally {
      setAnadiendo(null)
    }
  }

  // cualquier cambio de filtro devuelve a la primera página
  const cambiar = fn => (...a) => { fn(...a); setPagina(1); setRes([]) }
  // año y género van en un <select>: con las flechas del teclado cada
  // paso dispara este cambio, y vaciar la lista al vuelo en cada uno
  // competía con el propio desplegable nativo. Se deja lo de antes a la
  // vista un instante y la petición (ya con su respiro) la sustituye sola.
  const cambiarSuave = fn => (...a) => { fn(...a); setPagina(1) }
  const cambiarTipo = cambiar(t => {
    setTipo(t); setProvs([]); setGenero(''); setAnio(''); setCalidad(false)
    if (t === 'tv' && modo === 'cines') setModo('tendencias')
  })

  // Al elegir "En cines" quitamos las plataformas: son cosas distintas,
  // una es la sala y la otra el streaming.
  const cambiarModo = cambiar(m => {
    setModo(m)
    // en cartelera no aplicamos nada de esto: un estreno de esta semana
    // todavía no tiene votos y el filtro de calidad lo dejaría vacío
    if (m === 'cines') { setProvs([]); setGenero(''); setAnio(''); setCalidad(false) }
  })

  // Y al revés: si marcas una plataforma estando en un modo que no admite
  // filtros, pasamos a Populares en vez de enseñarte algo que no es.
  const saltarSiHaceFalta = () => {
    const m = MODOS.find(x => x.id === modo)
    if (m && !m.filtrable) setModo('populares')
  }
  const cambiarGenero = cambiarSuave(g => { setGenero(g); if (g) saltarSiHaceFalta() })
  const cambiarAnio = cambiarSuave(a => { setAnio(a); if (a) saltarSiHaceFalta() })
  const alternarCalidad = cambiar(() => {
    setCalidad(v => { if (!v) saltarSiHaceFalta(); return !v })
  })
  const alternarPlat = cambiar(id => {
    setProvs(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]))
    saltarSiHaceFalta()
  })

  const explorando = q.trim().length < 2
  const hayFiltros = provs.length > 0 || genero || anio || calidad

  /**
   * Por defecto se esconde lo que ya has decidido: tus propuestas, lo que
   * ya coincide, lo que ya votaste que no o que vista sobre una propuesta
   * suya, lo descartado y lo que has guardado para ti.
   */
  const decidido = p => {
    const e = estado(p)
    if (e && (e.tipo === 'mio' || e.tipo === 'coincide')) return true
    if (e && ['no', 'vista'].includes(miVoto(e.t.id))) return true
    return descartada(p) || guardada(p)
  }
  const visibles = verTodo ? res : res.filter(p => !decidido(p))
  const escondidas = res.length - visibles.length
  const modosVisibles = MODOS.filter(m =>
    (tipo === 'movie' || !m.soloPelis) && (!hayFiltros || m.filtrable)
  )
  const modoActual = MODOS.find(m => m.id === modo)
  const ocultarPlataformas = !!(modoActual && modoActual.sinPlataforma)

  return (
    <>
      {flash && <div className="ok">{flash}</div>}
      <h2>Añadir</h2>
      <input className="busca" type="text" placeholder="Buscar una peli o serie…"
        value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />

      {explorando && (
        <>
          <div className="pestanas chica">
            <button className={tipo === 'movie' ? 'activo' : ''}
              onClick={() => cambiarTipo('movie')}>Películas</button>
            <button className={tipo === 'tv' ? 'activo' : ''}
              onClick={() => cambiarTipo('tv')}>Series</button>
          </div>

          <div className="filtros">
            {modosVisibles.map(m => (
              <button key={m.id} className={modo === m.id ? 'activo' : ''}
                onClick={() => cambiarModo(m.id)}>{m.nombre}</button>
            ))}
          </div>

          {plats.length > 0 && !ocultarPlataformas && (
            <div className="fila-plataformas">
              {/* la fila no tenía scrollbar ni pista alguna de que seguía
                  hacia la derecha: con ratón, sin arrastre táctil, no
                  había forma de saber que se podía desplazar */}
              <button type="button" className="flecha-plats izq"
                aria-label="Ver plataformas anteriores"
                onClick={() => filaPlats.current?.scrollBy({ left: -160, behavior: 'smooth' })}>
                ‹
              </button>
              <div className="plataformas" ref={filaPlats}
                onWheel={e => {
                  if (e.deltaY === 0) return
                  e.currentTarget.scrollLeft += e.deltaY
                  e.preventDefault()
                }}>
                {plats.map(pl => (
                  <button key={pl.id}
                    className={provs.includes(pl.id) ? 'activo' : ''}
                    onClick={() => alternarPlat(pl.id)}
                    title={pl.nombre} aria-label={pl.nombre}
                    aria-pressed={provs.includes(pl.id)}>
                    <img src={pl.logo} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
              <button type="button" className="flecha-plats der"
                aria-label="Ver más plataformas"
                onClick={() => filaPlats.current?.scrollBy({ left: 160, behavior: 'smooth' })}>
                ›
              </button>
            </div>
          )}

          {ocultarPlataformas && (
            <div className="ayuda" style={{ marginTop: 12, marginBottom: 0 }}>
              Estrenos en salas de España. Aquí no aplican las plataformas.
            </div>
          )}

          {!ocultarPlataformas && (
            <>
              <div className="barra-filtros">
                <button className={`plegable${panel ? ' abierto' : ''}`}
                  onClick={() => setPanel(v => !v)} aria-expanded={panel}>
                  Más filtros
                  {(genero || anio || calidad || verTodo) && (
                    <em>{[genero, anio, calidad, verTodo].filter(Boolean).length}</em>
                  )}
                  <span className="flecha">{panel ? '▴' : '▾'}</span>
                </button>
                {hayFiltros && (
                  <button className="limpiar" onClick={() => {
                    setProvs([]); setGenero(''); setAnio(''); setCalidad(false)
                    setPagina(1); setRes([])
                  }}>Limpiar</button>
                )}
              </div>

              {panel && (
                <div className="panel-filtros">
                  <div className="barra-filtros">
                    <select value={genero} onChange={e => cambiarGenero(e.target.value)}
                      aria-label="Filtrar por género">
                      <option value="">Todos los géneros</option>
                      {gens.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
                    </select>
                    <select value={anio} onChange={e => cambiarAnio(e.target.value)}
                      aria-label="Filtrar por año">
                      {ANOS.map(a => <option key={a.id || 'todos'} value={a.id}>{a.nombre}</option>)}
                    </select>
                  </div>
                  <button className={`interruptor${calidad ? ' activo' : ''}`}
                    onClick={alternarCalidad} aria-pressed={calidad}>
                    <span className="bolita" />
                    Quitar peor valoradas
                  </button>
                  <button className={`interruptor${verTodo ? ' activo' : ''}`}
                    onClick={() => setVerTodo(v => !v)} aria-pressed={verTodo}>
                    <span className="bolita" />
                    Ver las ya decididas
                  </button>
                  {calidad && (
                    <div className="ayuda" style={{ margin: '10px 0 0' }}>
                      Solo con nota igual o superior a 6 y al menos 250 votos.
                    </div>
                  )}
                  {!verTodo && escondidas > 0 && (
                    <div className="ayuda" style={{ margin: '6px 0 0' }}>
                      {escondidas} escondida{escondidas === 1 ? '' : 's'} por estar ya propuesta{escondidas === 1 ? '' : 's'} o descartada{escondidas === 1 ? '' : 's'}.
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {provs.length > 0 && (
            <div className="ayuda" style={{ marginTop: 10, marginBottom: 0 }}>
              Solo lo incluido en la suscripción de {provs.length === 1 ? 'esa plataforma' : 'esas plataformas'} en España.
            </div>
          )}
        </>
      )}

      {error && <div className="error">{error}</div>}

      <div className="catalogo">
        {visibles.map(p => {
          const e = estado(p)
          const visible = e && (e.tipo === 'mio' || e.tipo === 'coincide') ? e.tipo : null
          const fuera = !visible && descartada && descartada(p)
          const nota = visible === 'mio' ? 'La propusiste tú'
            : visible === 'coincide' ? '¡Coincidís!'
            : fuera ? 'No te interesa'
            : [p.anio, p.tipo === 'tv' ? 'Serie' : 'Película'].filter(Boolean).join(' · ')
          return (
            <div className="tarjeta" key={`${p.tipo}-${p.tmdb_id}`}>
              <button className={`lamina${visible || fuera ? ' puesta' : ''}`}
                onClick={() => setFicha(p)}
                aria-label={`Ver información de ${p.titulo}`}>
                <img src={p.cartel} alt="" loading="lazy" />
                <span className="tag">{p.tipo === 'tv' ? 'Serie' : 'Peli'}</span>
                {p.voto && !visible && <span className="nota">★ {p.voto}</span>}
                {visible && <span className="check">{visible === 'coincide' ? '★' : '✓'}</span>}
              </button>
              <button className={`mas${visible ? ' ya' : ''}${fuera ? ' volver' : ''}`}
                onClick={() => (fuera ? onRecuperar(p) : actuar(p))}
                disabled={!!visible || anadiendo === p.tmdb_id}
                aria-label={fuera ? `Recuperar ${p.titulo}` : visible ? nota : `Proponer ${p.titulo}`}>
                {anadiendo === p.tmdb_id ? '·'
                  : visible === 'coincide' ? '★'
                  : visible ? '✓'
                  : fuera ? '↺'
                  : '+'}
              </button>
              <div className={`rotulo${visible || fuera ? ' marcado' : ''}`}>
                {p.titulo}
                <i>{nota}</i>
              </div>
            </div>
          )
        })}
      </div>

      {cargando && <div className="cargando">Cargando…</div>}

      {!cargando && explorando && res.length > 0 && !agotado && (
        <button className="btn suave" onClick={() => setPagina(n => n + 1)}>Ver más</button>
      )}

      {!cargando && visibles.length === 0 && (
        <div className="vacio">
          <b>Sin resultados</b>
          {res.length > 0 ? 'Ya has decidido sobre todas. Activa el interruptor para verlas.'
            : explorando ? 'Prueba a quitar algún filtro.' : 'Prueba con otro título.'}
        </div>
      )}

      {ficha && (() => {
        const e = estado(ficha)
        const visible = e && (e.tipo === 'mio' || e.tipo === 'coincide') ? e.tipo : null
        return (
          <Ficha p={ficha} puesta={!!visible} conNota
            etiquetaPuesta={visible === 'coincide' ? '¡Ya coincidís en esta!' : 'Ya la propusiste tú'}
            onCerrar={() => setFicha(null)}
            onProponer={async nota => { setFicha(null); await actuar(ficha, nota) }}
            acciones={
              <div className="acciones-redondas">
                <button className={`redondo${guardada(ficha) ? ' marcado' : ''}`}
                  onClick={() => { (guardada(ficha) ? onOlvidar : onGuardar)(ficha); setFicha(null) }}>
                  <span>🔖</span><i>{guardada(ficha) ? 'Guardada' : 'Para mí'}</i>
                </button>
                {descartada(ficha)
                  ? <button className="redondo"
                      aria-label={motivoDescarte(ficha) === 'vista' ? 'Marcada como vista · deshacer' : 'Descartada · deshacer'}
                      onClick={() => { onRecuperar(ficha); setFicha(null) }}>
                      <span>↺</span><i>Deshacer</i>
                    </button>
                  : <>
                      <button className="redondo"
                        onClick={() => { onDescartar(ficha, 'no_interesa'); setFicha(null) }}>
                        <span>✕</span><i>Paso</i>
                      </button>
                      <button className="redondo"
                        onClick={() => { onDescartar(ficha, 'vista'); setFicha(null) }}>
                        <span>👁</span><i>Vista</i>
                      </button>
                    </>}
              </div>
            } />
        )
      })()}

      {fiesta && <Fiesta p={fiesta} onCerrar={() => setFiesta(null)} />}
    </>
  )
}

/* ---- ventana de comentario, usada al proponer y al editar ---- */
function Comentario({ inicial = '', titulo, onGuardar, onCerrar }) {
  const [texto, setTexto] = useState(inicial)
  return createPortal(
    <div className="telon" onClick={onCerrar}>
      <div className="panel chico" onClick={e => e.stopPropagation()}>
        <div className="detalle">
          <h3>Tu comentario</h3>
          <div className="ayuda" style={{ marginBottom: 12 }}>
            {titulo ? `Sobre ${titulo}. ` : ''}Lo verán al votar esta propuesta.
          </div>
          <textarea value={texto} onChange={e => setTexto(e.target.value)}
            placeholder="Esta es de mis favoritas…" maxLength={200} autoFocus />
          <button className="btn" onClick={() => onGuardar(texto.trim())}>Guardar</button>
          <button className="btn suave" onClick={onCerrar}>Cancelar</button>
        </div>
      </div>
    </div>
    ,
    document.body
  )
}

/* ---- tráiler del carrusel ----
 * Arranca SIEMPRE en silencio. iOS bloquea del todo un vídeo que intente
 * sonar sin un gesto previo, y entonces no se reproduce nada: por eso en
 * el iPhone no se veía. El sonido se activa con la API de YouTube desde
 * el propio toque, que sí es un gesto válido, y además así no hay que
 * recargar el vídeo y no se reinicia. Si la API no carga, cae a un
 * reproductor normal sin botones.
 */
/** El sonido se recuerda en este dispositivo entre tarjetas y sesiones. */
const leerSonido = () => {
  try { return localStorage.getItem('sd:sonido') === '1' } catch (e) { return false }
}

/** iPhone/iPad (el iPad moderno se presenta como Mac, pero con toque) */
const esIOS = typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
   (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

/* TEMPORAL: registro en pantalla de lo que hace el reproductor, para ver
 * en el iPhone dónde se va el tiempo. Quitar cuando esté resuelto. */
const DEPURAR = false
// registro común (no dentro del reproductor: si este no llega a crearse,
// también hay que verlo) y un reloj que cuenta desde el último cambio
const registro = { lineas: [], t0: Date.now(), oyentes: new Set() }
function apunta(txt, reiniciar) {
  if (!DEPURAR) return
  if (reiniciar) registro.t0 = Date.now()
  const t = ((Date.now() - registro.t0) / 1000).toFixed(1)
  registro.lineas = [...registro.lineas.slice(-11), `${t}s ${txt}`]
  registro.oyentes.forEach(f => f(registro.lineas))
}
function Registro() {
  const [lineas, setLineas] = useState(registro.lineas)
  useEffect(() => {
    registro.oyentes.add(setLineas)
    return () => { registro.oyentes.delete(setLineas) }
  }, [])
  if (!DEPURAR) return null
  return createPortal(
    <pre className="depurar">{lineas.join('\n') || 'registro vacío'}</pre>,
    document.body
  )
}
const NOMBRE_ESTADO = { '-1': 'sin empezar', 0: 'terminado', 1: 'REPRODUCE', 2: 'pausa', 3: 'cargando', 5: 'preparado' }

function Trailer({ clave: pedida, titulo, cartel, tmdb }) {
  const caja = useRef(null)
  const player = useRef(null)
  const anota = apunta
  // Si el vídeo pedido no se puede reproducir (bloqueado en España, quitado
  // por el estudio...), se prueba el siguiente tráiler del título.
  // "sustituto" recuerda para qué vídeo pedido es, así al cambiar de
  // tarjeta se vuelve solo al de la nueva.
  const [sustituto, setSustituto] = useState({ de: null, clave: null })
  const clave = pedida && sustituto.de === pedida ? sustituto.clave : pedida
  const probadas = useRef({ de: null, lista: [] })
  const [api, setApi] = useState(null)
  const [mudo, setMudo] = useState(true)
  // se guarda QUÉ vídeo está pausado o ha fallado: al cambiar de tarjeta
  // el nuevo empieza limpio sin tener que reiniciar nada a mano
  const [paradoDe, setParadoDe] = useState(null)
  // true solo si lo has pausado tú con el botón (o no hay nada que ver):
  // cualquier otra pausa es iOS parando el vídeo y hay que volver a
  // arrancarlo
  const pausaMia = useRef(false)
  // Algunos tráilers de TMDB no se pueden incrustar (el estudio lo impide):
  // YouTube entonces no reproduce nada y se queda con su propio aviso de
  // "vídeo no disponible" dentro del marco. Mejor no enseñarlo: se cae a
  // la carátula, como si no hubiera tráiler.
  const [falloDe, setFalloDe] = useState(null)
  const fallo = !!clave && falloDe === clave
  const parado = !!clave && paradoDe === clave
  // El reproductor es UNO y va cambiando de vídeo (ver TrailerFlotante):
  // "querida" es el vídeo que toca ver y "cargada" el que tiene dentro
  const querida = useRef(clave)
  const cargada = useRef(null)
  // has tocado el botón del sonido en ESTE reproductor: en iOS, a partir de
  // ahí ya deja que suene, también en los vídeos siguientes
  const desbloqueado = useRef(false)
  // cuándo se cambió de vídeo por última vez (ver la pausa en onStateChange)
  const cambioEn = useRef(0)
  // lo último pedido, para los avisos de YouTube (que llegan más tarde)
  const pedidaRef = useRef(pedida)
  const tmdbRef = useRef(tmdb)
  useEffect(() => { pedidaRef.current = pedida; tmdbRef.current = tmdb })
  // el vídeo que YouTube no deja reproducir: el vigilante no insiste con él
  const fallida = useRef(null)
  // qué vídeo ha llegado a arrancar: hasta entonces la carátula lo tapa
  const [enMarchaDe, setEnMarchaDe] = useState(null)

  // red de seguridad: si al rato sigue sin moverse, que arranque en silencio

  // pone en el reproductor el vídeo que toque, sin recrearlo
  const cambiar = pl => {
    const c = querida.current
    if (!pl || typeof pl.loadVideoById !== 'function' || c === cargada.current) return
    if (!c) { pausaMia.current = true; pl.pauseVideo(); return }
    cargada.current = c
    pausaMia.current = false
    cambioEn.current = Date.now()
    anota(`cargar ${c}`)
    pl.loadVideoById(c)
  }

  // Se crea con el primer vídeo y ya no se destruye hasta salir del
  // carrusel, aunque alguna tarjeta no tenga tráiler (o aún no haya
  // llegado). Antes dependía de "hay vídeo ahora": al pasar por una de
  // esas se destruía y el siguiente era un reproductor nuevo, que tardaba
  // en cargar y en iOS volvía a pedir que activaras el sonido.
  const [hay, setHay] = useState(!!clave)
  if (clave && !hay) setHay(true)
  useEffect(() => {
    if (!hay) return
    let vivo = true
    let probadoDe = null
    // YouTube sustituye el elemento que recibe, así que le damos un hijo
    // creado a mano: React no controla ese nodo y no hay conflicto
    const nido = document.createElement('div')

    anota('pidiendo API de YouTube')
    cargarYT()
      .then(YT => {
        anota(`API ok${vivo ? '' : ' (ya no hace falta)'}${caja.current ? '' : ' SIN CAJA'}`)
        if (!vivo || !caja.current) return
        caja.current.appendChild(nido)
        cargada.current = querida.current
        anota(`crear ${querida.current}`)
        player.current = new YT.Player(nido, {
          videoId: querida.current,
          playerVars: {
            autoplay: 1, mute: 1, controls: 0, rel: 0, modestbranding: 1,
            playsinline: 1, disablekb: 1, iv_load_policy: 3,
            // sin 'origin': la API de YouTube avisa de un desajuste de
            // origen y no aporta nada aquí
            enablejsapi: 1
          },
          events: {
            onReady: e => {
              if (!vivo) return
              anota('listo')
              setApi(true)
              // si mientras cargaba ya has pasado a otra tarjeta
              if (querida.current !== cargada.current) { cambiar(e.target); return }
              // En iOS el autoplay del iframe a veces no llega a arrancar:
              // se le pide también a mano, siempre en silencio
              try { e.target.playVideo() } catch { /* sigue igual */ }
            },
            onStateChange: e => {
              if (!vivo) return
              anota(`${NOMBRE_ESTADO[e.data] ?? e.data}${e.target.isMuted() ? ' (mudo)' : ' (sonido)'}`)
              // Al terminar, YouTube enseña su pantalla final con vídeos
              // sugeridos y su logo. Rebobinamos antes de que aparezca.
              if (e.data === 0) { e.target.seekTo(0); e.target.playVideo() }
              // Ya en marcha (una vez por vídeo): se quita la carátula y, si
              // habías pedido sonido, el silencio. En iOS solo si ya has
              // tocado el botón en este reproductor: si no, no deja sonar y,
              // en vez de seguir mudo, PARA el vídeo.
              if (e.data === 1 && probadoDe !== cargada.current) {
                probadoDe = cargada.current
                setEnMarchaDe(cargada.current)
                if (leerSonido() && e.target.isMuted() && (!esIOS || desbloqueado.current)) {
                  try { e.target.unMute(); e.target.setVolume(70); setMudo(false) }
                  catch { /* si el navegador lo impide, sigue mudo */ }
                }
              }
              // sin empezar (-1) o preparado pero quieto (5): en iOS a veces
              // se queda ahí aunque se le haya pedido reproducir. Al play
              // ya, sin esperar al vigilante de abajo.
              if ((e.data === -1 || e.data === 5) && !pausaMia.current && querida.current) {
                try { e.target.playVideo() } catch { /* sigue igual */ }
              }
              // pausa que no has hecho tú: iOS lo ha parado por el sonido.
              // Justo después de cambiar de vídeo no cuenta: puede ser el
              // anterior deteniéndose, y silenciar ahí quitaba el sonido
              // al nuevo sin motivo.
              if (e.data === 2 && !pausaMia.current && !e.target.isMuted() &&
                  Date.now() - cambioEn.current > 1500) {
                anota('pausa de iOS: silencio')
                e.target.mute(); setMudo(true); e.target.playVideo()
              }
            },
            // 101/150: el embed está bloqueado para este vídeo. 100: lo
            // han quitado o es privado. En cualquier caso no hay nada que
            // reproducir aquí.
            onError: ev => {
              anota(`ERROR ${ev && ev.data}`)
              if (!vivo) return
              const mala = querida.current
              const deQue = pedidaRef.current
              if (probadas.current.de !== deQue) probadas.current = { de: deQue, lista: [] }
              probadas.current.lista.push(mala)
              const rendirse = () => { fallida.current = mala; setFalloDe(mala) }
              if (!tmdbRef.current) return rendirse()
              buscarTrailers(tmdbRef.current.id, tmdbRef.current.tipo).then(lista => {
                // ya estás en otra tarjeta: nada que hacer
                if (!vivo || pedidaRef.current !== deQue) return
                const otra = lista.find(k => !probadas.current.lista.includes(k))
                if (!otra) return rendirse()
                anota(`probando otro: ${otra}`)
                setSustituto({ de: deQue, clave: otra })
              }).catch(rendirse)
            }
          }
        })
      })
      .catch(err => { anota(`API FALLÓ: ${err && err.message}`); if (vivo) setApi(false) })

    return () => {
      anota('reproductor destruido')
      vivo = false
      if (player.current && player.current.destroy) player.current.destroy()
      player.current = null
      cargada.current = null
      if (nido.parentNode) nido.parentNode.removeChild(nido)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hay])

  // Vigilante: mientras haya vídeo y no lo hayas pausado tú, que no se
  // quede quieto. iOS a veces no arranca un vídeo o lo para por su cuenta
  // (por ejemplo, si el reproductor se crea mientras la pantalla aún está
  // apareciendo con el fundido: por eso el primero no arrancaba y al
  // bajar y volver a subir sí). Si tras varios intentos sigue quieto con
  // sonido, es que iOS no lo deja sonar: entonces se silencia y arranca.
  useEffect(() => {
    if (!hay) return
    let quietas = 0
    const t = setInterval(() => {
      const pl = player.current
      if (!pl || typeof pl.getPlayerState !== 'function' ||
          pausaMia.current || !querida.current ||
          fallida.current === querida.current) { quietas = 0; return }
      try {
        if (![-1, 2, 5].includes(pl.getPlayerState())) { quietas = 0; return }
        quietas++
        anota(`vigilante: quieto x${quietas}`)
        if (quietas >= 3 && !pl.isMuted()) { anota('vigilante: silencio'); pl.mute(); setMudo(true) }
        pl.playVideo()
      } catch { /* reproductor ya destruido */ }
    }, 700)
    return () => clearInterval(t)
  }, [hay])

  // cambio de tarjeta: mismo reproductor, otro vídeo
  useEffect(() => {
    // el reloj del registro cuenta desde que cambias de tarjeta
    anota(`tarjeta: ${clave || 'sin vídeo (aún)'}`, true)
    querida.current = clave
    cambiar(player.current)
  }, [clave])

  // el reproductor se consulta al pulsar, nunca una copia guardada
  const mando = accion => () => {
    const pl = player.current
    if (!pl || typeof pl.getPlayerState !== 'function') return
    accion(pl)
  }
  const volumen = mando(pl => {
    const encender = pl.isMuted()
    anota(encender ? 'botón: sonido' : 'botón: silencio')
    if (encender) { desbloqueado.current = true; pl.unMute(); pl.setVolume(70); setMudo(false) }
    else { pl.mute(); setMudo(true) }
    try { localStorage.setItem('sd:sonido', encender ? '1' : '0') } catch { /* privada */ }
  })
  const play = mando(pl => {
    if (pl.getPlayerState() === 1) { pausaMia.current = true; pl.pauseVideo(); setParadoDe(clave) }
    else { pausaMia.current = false; pl.playVideo(); setParadoDe(null) }
  })

  // oculto en vez de quitarlo: el marco guarda el reproductor, y sacarlo
  // del DOM obligaría a crearlo de nuevo en la siguiente tarjeta
  const oculto = fallo || !clave

  return (
    <>
      {api === false ? (
        clave && !fallo && (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${clave}?autoplay=1&mute=1` +
                 `&controls=0&loop=1&playlist=${clave}&playsinline=1&rel=0&modestbranding=1`}
            title={titulo} allow="autoplay; encrypted-media" tabIndex={-1} />
        )
      ) : (
        <div ref={caja} className="marco" style={oculto ? { visibility: 'hidden' } : undefined} />
      )}
      {!oculto && (
        // Tapa el vídeo hasta que de verdad arranca y se retira en ese
        // momento, no a un tiempo fijo: antes esperaba siempre 2 s aunque
        // ya estuviera en marcha. Sin la API no hay aviso de arranque y se
        // queda la retirada por tiempo de siempre ("sola").
        <div key={clave}
          className={`cortina${api === false ? ' sola' : enMarchaDe === clave ? ' fuera' : ''}`}
          style={{ backgroundImage: `url(${cartel})` }} />
      )}
      {api === true && !oculto && (
        <>
          {/* en el centro, justo encima del botón de YouTube, que no
              responde porque el vídeo no recibe el toque */}
          <button className={`centro${parado ? ' visible' : ''}`}
            onClick={play} aria-label={parado ? 'Reproducir' : 'Pausar'}>
            {parado ? '▶' : '❚❚'}
          </button>
          <div className="mandos-video">
            {/* en iOS el vídeo arranca mudo aunque ya hubieras activado el
                sonido: el botón lo avisa pulsando, para que se note que
                hace falta un toque (solo una vez: luego se mantiene) */}
            <button className={mudo && leerSonido() ? 'pedir' : ''}
              onClick={volumen} aria-label={mudo ? 'Activar el sonido' : 'Silenciar'}>
              {mudo ? '🔇' : '🔊'}
            </button>
          </div>
        </>
      )}
    </>
  )
}

/* ---- un solo tráiler para todo el carrusel ----
 * Antes cada tarjeta montaba su propio reproductor: al bajar había que
 * cargar YouTube de cero (tardaba) y en iOS el sonido se perdía en cada
 * tarjeta, porque solo deja sonar al reproductor que has tocado. Ahora
 * hay uno solo, colocado encima de la tarjeta que estás viendo (dentro
 * de la pista, así se desplaza con ella), que cambia de vídeo al pasar.
 */
function TrailerFlotante({ pista, activo, cuenta, clave, titulo, cartel, tmdb }) {
  const [sitio, setSitio] = useState(null)
  const yo = useRef(null)

  useLayoutEffect(() => {
    // La pista se saca del propio elemento, no de la ref del padre: al
    // montar, el efecto del hijo corre ANTES de que React rellene la ref
    // del padre, así que pista.current aún era null y en la primera
    // tarjeta nunca se colocaba el tráiler (no arrancaba ni salía el
    // botón del sonido hasta bajar y volver a subir).
    const caja = (yo.current && yo.current.parentNode) || pista.current
    if (!caja) return
    const medir = () => {
      const d = caja.querySelector(`.diapo[data-i="${activo}"]`)
      setSitio(d ? { top: d.offsetTop, height: d.offsetHeight } : null)
    }
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(caja)
    return () => obs.disconnect()
  }, [pista, activo, cuenta])

  useEffect(() => {
    apunta(`flotante: tarjeta ${activo}, sitio ${sitio ? `${sitio.top}/${sitio.height}` : 'NO'}, vídeo ${clave || 'no'}`)
  }, [activo, sitio, clave])

  return (
    <div className="flotante" ref={yo}
      style={sitio ? { top: sitio.top, height: sitio.height } : { display: 'none' }}>
      <Trailer clave={sitio ? clave || null : null} titulo={titulo} cartel={cartel} tmdb={tmdb} />
      <Registro />
    </div>
  )
}

/* Lo que se estaba viendo en Estrenos. Vive fuera del componente para que
 * al cambiar de pestaña y volver no se pierda: si no, se recargaba todo y
 * volvías a la primera tarjeta. */
const memoriaReel = { lista: [], pagina: 1, scroll: 0 }

/* Lo mismo, pero para el apartado "Top" de esa misma pantalla. */
const memoriaTop = { lista: [], pagina: 1, scroll: 0 }

/* Tarjeta que se puede deslizar a los lados, como Tinder: a la derecha
 * cuenta como "sí" y a la izquierda como "paso". El desplazamiento
 * vertical (pasar a la siguiente tarjeta) lo sigue llevando la pista con
 * su propio scroll; aquí solo se atiende el gesto cuando es más
 * horizontal que vertical, así los dos conviven sin pisarse. */
const UMBRAL_DESLIZAR = 110

function Deslizable({ className, dataI, onSi, onNo, children }) {
  const [dx, setDx] = useState(0)
  const [modo, setModo] = useState('quieto') // quieto | arrastrando | volando
  const inicio = useRef(null)
  const arrastro = useRef(false)

  const empezar = e => {
    // los botones y controles del vídeo siguen funcionando con su propio toque
    if (e.target.closest('button, .mandos-video, .centro')) return
    inicio.current = { x: e.clientX, y: e.clientY }
    arrastro.current = false
    setModo('arrastrando')
    setDx(0)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const mover = e => {
    if (!inicio.current) return
    const dif = e.clientX - inicio.current.x
    const alto = e.clientY - inicio.current.y
    if (Math.abs(dif) > 6 || Math.abs(alto) > 6) arrastro.current = true
    // si el gesto es más vertical que horizontal, se deja para el scroll
    // de la pista y no se mueve la tarjeta
    if (Math.abs(dif) >= Math.abs(alto)) setDx(dif)
  }
  const volar = (lado, accion) => {
    setModo('volando')
    setDx(lado === 'si' ? 900 : -900)
    setTimeout(() => accion && accion(), 220)
  }
  const soltar = e => {
    if (!inicio.current) return
    inicio.current = null
    // se libera a mano en vez de fiarse del navegador: dentro de una pista
    // con scroll-snap, en Android a veces el pointerup no suelta la
    // captura del todo, y el siguiente toque (aunque fuera en un botón)
    // se quedaba sin respuesta hasta que algo más lo desatascaba
    try { e && e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ya liberado */ }
    if (dx > UMBRAL_DESLIZAR) volar('si', onSi)
    else if (dx < -UMBRAL_DESLIZAR) volar('no', onNo)
    else { setModo('quieto'); setDx(0) }
  }
  // red de seguridad: si el navegador suelta la captura por su cuenta
  // (cambia de gesto, pierde el foco...) sin pasar por soltar(), el
  // estado se queda a medias y bloquea el siguiente toque. Esto lo repone.
  const perderCaptura = () => {
    inicio.current = null
    arrastro.current = false
    setModo('quieto')
    setDx(0)
  }
  // si la sinopsis estaba abierta y el usuario solo tocó para arrastrar
  // (sin llegar al umbral), evita que el toque cuente como un clic normal.
  // Los botones quedan fuera: un dedo real casi nunca toca del todo quieto,
  // y sin esta excepción ese temblor de unos pocos píxeles bastaba para que
  // Proponer/Paso/Vista no respondieran, aunque el dedo acabara soltando
  // justo encima del botón.
  const clicDurante = e => {
    if (e.target.closest('button, .mandos-video, .centro')) return
    if (arrastro.current) { e.preventDefault(); e.stopPropagation() }
  }

  const estilo = dx === 0 ? undefined : {
    transform: `translateX(${dx}px) rotate(${dx / 18}deg)`,
    transition: modo === 'arrastrando' ? 'none' : 'transform .25s ease'
  }

  return (
    <section className={className} data-i={dataI} style={estilo}
      onPointerDown={empezar} onPointerMove={mover}
      onPointerUp={soltar} onPointerCancel={soltar}
      onLostPointerCapture={perderCaptura}
      onClickCapture={clicDurante}>
      {Math.abs(dx) > 12 && (
        <div className={`sello ${dx > 0 ? 'si' : 'no'}`}
          style={{ opacity: Math.min(Math.abs(dx) / UMBRAL_DESLIZAR, 1) }}>
          {dx > 0 ? 'Me gusta' : 'Paso'}
        </div>
      )}
      {children}
    </section>
  )
}

/* La sinopsis solo se puede "abrir" si de verdad hay texto oculto: si ya
 * se ve entera (cabe en el hueco de siempre), tocarla no debía cambiar
 * nada, y antes sí lo hacía (se reordenaba el fondo aunque no aparecía
 * ni una palabra nueva). Se mide una vez montada, comparando lo que
 * ocupa el texto con lo que se deja ver en su estado normal. */
function Sinopsis({ texto, abierta, onAlternar }) {
  const ref = useRef(null)
  const [truncado, setTruncado] = useState(false)

  useEffect(() => {
    // desplegada no hace falta medir: lo único que importa entonces es
    // poder volver a cerrarla, y eso ya lo cubre "abierta" más abajo. Si
    // se sigue midiendo aquí, al desplegar cabe entera (hay mucho más
    // sitio) y se marcaba como "no truncada", perdiendo el toque para
    // volver a cerrarla
    if (abierta) return
    const el = ref.current
    if (!el) return
    // más de un par de píxeles: a veces el redondeo del navegador deja
    // 2-3px de diferencia aunque el texto quepa entero
    const medir = () => setTruncado(el.scrollHeight - el.clientHeight > 8)
    medir()
    // la tipografía (Anton/Karla) llega por @import y puede tardar en
    // cargar: si se mide antes, el texto cambia de alto al llegar la
    // fuente real y la medida se queda desfasada (parecía "tocable"
    // aunque ya se viera entero, o al revés)
    document.fonts && document.fonts.ready.then(medir)
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [texto, abierta])

  if (!texto) return null
  const interactivo = truncado || abierta
  if (!interactivo) return <div className="sin" ref={ref}>{texto}</div>

  return (
    <div className="sin" ref={ref} role="button" tabIndex={0}
      onClick={onAlternar} onKeyDown={e => e.key === 'Enter' && onAlternar()}>
      {texto}
    </div>
  )
}

/* ======================= estrenos en vertical =======================
 * También sirve para "Joyas" (Añadir): mismas tarjetas y el mismo gesto,
 * pero pidiendo los títulos con otra función y guardando el progreso en
 * otra memoria, para no mezclar las dos listas.
 */
function Reel({ titulos, yo, miVoto, onAdd, onVotar, descartada, onDescartar, guardada, onGuardar, onComentar,
  cargar = estrenos, memoria = memoriaReel,
  textoCargando = 'Buscando estrenos…',
  textoError = 'No se han podido cargar los estrenos.',
  vacioTitulo = 'No queda nada',
  vacioTexto = 'Has mirado todos los estrenos que cumplen el filtro de calidad. Vuelve en unos días.' }) {
  const [lista, setLista] = useState(memoria.lista)
  const [pagina, setPagina] = useState(memoria.pagina)
  const [cargando, setCargando] = useState(memoria.lista.length === 0)
  const [error, setError] = useState('')
  const [activo, setActivo] = useState(0)
  const [trailers, setTrailers] = useState({})
  const [anadiendo, setAnadiendo] = useState(null)
  const [fiesta, setFiesta] = useState(null)
  const [abierta, setAbierta] = useState(null)
  const [recien, setRecien] = useState(null)   // recién propuesta, por si quieres comentarla
  const [comentando, setComentando] = useState(null)
  const [avisoVoto, setAvisoVoto] = useState('')
  const pista = useRef(null)

  const estado = p => {
    const x = titulos.find(t => t.tmdb_id === p.tmdb_id && t.tipo === p.tipo)
    if (!x) return null
    if (x.propuesto_por === yo) return { tipo: 'mio', t: x }
    return { tipo: miVoto(x.id) === 'si' ? 'coincide' : 'suyo', t: x }
  }

  /**
   * Se calcula una sola vez y se usa en todas partes: en la rejilla, en el
   * detector de cuál estás viendo y al pedir el tráiler. Si cada sitio
   * filtrara a su manera, el índice de la tarjeta visible no coincidiría
   * con el de la lista y el tráiler saldría de otra película, o de ninguna.
   */
  const visibles = lista.filter(p => {
    if (descartada(p)) return false
    if (guardada(p)) return false
    const e = estado(p)
    if (e && (e.tipo === 'mio' || e.tipo === 'coincide')) return false
    if (e && ['no', 'vista'].includes(miVoto(e.t.id))) return false
    return true
  })

  useEffect(() => {
    // si volvemos con la lista ya cargada, no se vuelve a pedir
    if (pagina === memoria.pagina && memoria.lista.length) return
    let vivo = true
    setCargando(true)
    cargar(pagina)
      .then(r => {
        if (!vivo) return
        // al pedir más, se descartan las que ya estaban: con el orden
        // barajado podrían repetirse entre tandas
        setLista(ant => {
          if (pagina === 1) return r
          const claves = new Set(ant.map(x => `${x.tipo}-${x.tmdb_id}`))
          return [...ant, ...r.filter(x => !claves.has(`${x.tipo}-${x.tmdb_id}`))]
        })
        setError('')
      })
      .catch(() => vivo && setError(textoError))
      .finally(() => vivo && setCargando(false))
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina])

  // se guarda lo cargado y dónde estabas, para el regreso: memoria vive
  // fuera de React a propósito (ver memoriaReel/memoriaTop), así que
  // mutarla aquí es justo el mecanismo, no un descuido
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    memoria.lista = lista
    memoria.pagina = pagina
  }, [lista, pagina, memoria])

  useEffect(() => {
    const caja = pista.current
    if (!caja) return
    if (memoria.scroll) caja.scrollTop = memoria.scroll
    const alDesplazar = () => { memoria.scroll = caja.scrollTop }
    caja.addEventListener('scroll', alDesplazar, { passive: true })
    return () => caja.removeEventListener('scroll', alDesplazar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista.length])

  // cuál se está viendo: la que ocupa la pantalla
  useEffect(() => {
    const caja = pista.current
    if (!caja) return
    const ojo = new IntersectionObserver(
      entradas => entradas.forEach(e => {
        if (e.isIntersecting) setActivo(Number(e.target.dataset.i))
      }),
      { root: caja, threshold: 0.6 }
    )
    caja.querySelectorAll('.diapo').forEach(d => ojo.observe(d))
    return () => ojo.disconnect()
  }, [visibles.length])

  // Se piden el tráiler de la tarjeta actual y el de la siguiente, para
  // que al bajar arranque sin esperas. Solo la clave del vídeo: el
  // reproductor se monta únicamente en la que estás viendo.
  useEffect(() => {
    let vivo = true
    for (const p of [visibles[activo], visibles[activo + 1]]) {
      if (!p) continue
      const clave = `${p.tipo}-${p.tmdb_id}`
      if (trailers[clave] !== undefined) continue
      buscarTrailer(p.tmdb_id, p.tipo).then(t => {
        if (vivo) setTrailers(x => ({ ...x, [clave]: t || '' }))
      })
    }
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, visibles.length, trailers])

  // al acercarse al final se pide la siguiente tanda
  useEffect(() => {
    if (!cargando && visibles.length && activo >= visibles.length - 3) {
      setPagina(n => (n < 5 ? n + 1 : n))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, visibles.length, cargando])

  async function proponer(p) {
    const e = estado(p)
    if (anadiendo || (e && (e.tipo === 'mio' || e.tipo === 'coincide'))) return
    setAnadiendo(p.tmdb_id)
    // el finally es el que importa: si onVotar/onAdd fallara sin avisar,
    // anadiendo se quedaba puesto para siempre y ya no dejaba tocar nada
    // más, aunque fuera en otra tarjeta
    try {
      if (e) {
        // esta ya la propuso la otra persona: si ya habías votado que no o
        // que vista, el botón de proponer no debe pisar ese voto sin avisar
        const v = miVoto(e.t.id)
        if (v === 'no' || v === 'vista') {
          setAvisoVoto(v === 'no' ? `Ya dijiste que ${p.titulo} no te interesa`
            : `Ya habías marcado ${p.titulo} como vista`)
          setTimeout(() => setAvisoVoto(''), 3200)
          return
        }
        await onVotar(e.t.id, 'si')
        setFiesta(p)
      } else {
        const fila = await onAdd(p)
        if (fila) {
          setRecien({ ...fila, titulo: p.titulo })
          setTimeout(() => setRecien(r => (r && r.id === fila.id ? null : r)), 6000)
        }
      }
    } finally {
      setAnadiendo(null)
    }
  }

  if (cargando && !visibles.length) return <div className="cargando">{textoCargando}</div>
  if (error) return <div className="error">{error}</div>
  if (!visibles.length) {
    return (
      <div className="vacio">
        <b>{vacioTitulo}</b>
        {vacioTexto}
      </div>
    )
  }

  return (
    <>
      <div className="pista" ref={pista}>
        {visibles.map((p, i) => {
          const clave = `${p.tipo}-${p.tmdb_id}`
          const tr = trailers[clave]
          const e = estado(p)
          const puesto = e && (e.tipo === 'mio' || e.tipo === 'coincide')
          return (
            <Deslizable className={`diapo${abierta === clave ? ' abierta' : ''}`}
              dataI={i} key={clave}
              onSi={() => proponer(p)} onNo={() => onDescartar(p, 'no_interesa')}>
              <div className="lienzo">
                {(p.fondo || p.cartel) && <img src={p.fondo || p.cartel} alt="" />}
              </div>
              <div className="velo" />

              <div className="torre">
                <button className={`redondo principal${puesto ? ' hecho' : ''}`}
                  onClick={() => proponer(p)}
                  disabled={!!puesto || anadiendo === p.tmdb_id}>
                  <span>{puesto ? '✓' : '+'}</span>
                  <i>{puesto ? 'Puesta' : 'Proponer'}</i>
                </button>
                <button className="redondo" onClick={() => onDescartar(p, 'no_interesa')}>
                  <span>✕</span><i>Paso</i>
                </button>
                <button className="redondo" onClick={() => onDescartar(p, 'vista')}>
                  <span>👁</span><i>Vista</i>
                </button>
                <button className={`redondo${guardada(p) ? ' marcado' : ''}`}
                  onClick={() => onGuardar(p)} disabled={guardada(p)}>
                  <span>🔖</span><i>{guardada(p) ? 'Guardada' : 'Para mí'}</i>
                </button>
              </div>

              <div className="cuerpo">
                <div className="meta">
                  {[p.tipo === 'tv' ? 'Serie' : 'Película', p.anio, p.genero, p.voto && `★ ${p.voto}`]
                    .filter(Boolean).join(' · ')}
                </div>
                <div className="tit">{p.titulo}</div>
                <Sinopsis texto={p.sinopsis} abierta={abierta === clave}
                  onAlternar={() => setAbierta(a => (a === clave ? null : clave))} />

              </div>
            </Deslizable>
          )
        })}
        {visibles[activo] && (
          <TrailerFlotante pista={pista} activo={activo} cuenta={visibles.length}
            clave={trailers[`${visibles[activo].tipo}-${visibles[activo].tmdb_id}`]}
            titulo={visibles[activo].titulo}
            cartel={visibles[activo].fondo || visibles[activo].cartel}
            tmdb={{ id: visibles[activo].tmdb_id, tipo: visibles[activo].tipo }} />
        )}
      </div>
      {recien && !comentando && (
        <div className="propuesta-hecha">
          <span>{recien.titulo} está en tu lista</span>
          <button onClick={() => setComentando(recien)}>Comentar</button>
        </div>
      )}
      {avisoVoto && (
        <div className="propuesta-hecha"><span>{avisoVoto}</span></div>
      )}

      {comentando && (
        <Comentario titulo={comentando.titulo} inicial={comentando.nota || ''}
          onCerrar={() => setComentando(null)}
          onGuardar={async nota => {
            await onComentar(comentando.id, nota)
            setComentando(null); setRecien(null)
          }} />
      )}

      {fiesta && <Fiesta p={fiesta} onCerrar={() => setFiesta(null)} />}
    </>
  )
}

/* ======================= pestaña "Ver" =======================
 * Dos apartados sobre las mismas tarjetas: Estrenos (lo más reciente,
 * hasta año y medio) y Top (lo mejor valorado de ahí para atrás, sin
 * repetir lo que ya sale en Estrenos). El interruptor flota encima del
 * tráiler en vez de ir en el flujo normal, para no robarle alto a la
 * tarjeta: .pista ya tiene su alto calculado y un elemento más ahí
 * arriba la dejaría cortada por abajo.
 */
function Ver(props) {
  const [sub, setSub] = useState('estrenos')
  return (
    <>
      <div className="sub-ver">
        <button className={sub === 'estrenos' ? 'activo' : ''}
          onClick={() => setSub('estrenos')}>Estrenos</button>
        <button className={sub === 'top' ? 'activo' : ''}
          onClick={() => setSub('top')}>Top</button>
      </div>
      {sub === 'estrenos'
        ? <Reel key="estrenos" {...props} />
        : <Reel key="top" {...props}
            cargar={topValoradas} memoria={memoriaTop}
            textoCargando="Buscando lo mejor…"
            textoError="No se han podido cargar los títulos."
            vacioTitulo="No hay más"
            vacioTexto="Ya has mirado todo lo mejor de más de año y medio. Vuelve en unos días." />}
    </>
  )
}

/* ---- celebración de coincidencia ---- */
function Fiesta({ p, onCerrar }) {
  const [fase, setFase] = useState('entrando')

  useEffect(() => {
    const esc = e => e.key === 'Escape' && onCerrar()
    document.addEventListener('keydown', esc)
    // las dos carátulas se juntan y al chocar se revela el título
    const a = setTimeout(() => setFase('chocando'), 620)
    const b = setTimeout(() => setFase('hecho'), 1000)
    return () => {
      document.removeEventListener('keydown', esc)
      clearTimeout(a); clearTimeout(b)
    }
  }, [onCerrar])

  return createPortal(
    <div className="telon fiesta" onClick={onCerrar}>
      <div className={`confeti ${fase}`} onClick={e => e.stopPropagation()}>
        <div className="destellos" aria-hidden="true">
          {Array.from({ length: 14 }).map((_, i) => (
            <i key={i} style={{ '--n': i }} />
          ))}
        </div>

        <div className="choque">
          <div className="mitad izquierda"><img src={p.cartel} alt="" /></div>
          <div className="mitad derecha"><img src={p.cartel} alt="" /></div>
          <div className="fogonazo" aria-hidden="true" />
        </div>

        <h2>¡Habéis coincidido!</h2>
        <div className="lead">A los dos os apetece</div>
        <div className="titulo-fiesta">{p.titulo}</div>
        <button className="btn" onClick={onCerrar}>Seguir mirando</button>
      </div>
    </div>
    ,
    document.body
  )
}

/* Para que el botón de "atrás" del móvil cierre la ficha en vez de salir
 * de la app: al abrirla metemos un paso de historial, y "atrás" lo
 * consume y dispara el cierre en vez de navegar fuera. Si se cierra de
 * otra forma (la cruz, tocar fuera), deshacemos ese paso para que la
 * historia no se quede con un hueco apuntando aquí. */
function useCerrarConAtras(onCerrar) {
  useEffect(() => {
    let porAtras = false
    window.history.pushState({ ficha: true }, '')
    const atras = () => { porAtras = true; onCerrar() }
    window.addEventListener('popstate', atras)
    return () => {
      window.removeEventListener('popstate', atras)
      if (!porAtras) window.history.back()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/* ---- ficha con tráiler ---- */
/* La ficha usa el mismo formato que Estrenos y Votar: una tarjeta a
 * pantalla completa con el tráiler de fondo. La diferencia es que aquí no
 * se desliza: es una sola y se cierra con la X o tocando fuera.
 */
function Ficha({ p, puesta, etiquetaPuesta, etiquetaBoton, ocultarBoton, acciones, conNota, onCerrar, onProponer }) {
  const [trailer, setTrailer] = useState(null)
  const [gen, setGen] = useState('')
  const [donde, setDonde] = useState([])
  const [abierta, setAbierta] = useState(false)
  const [nota, setNota] = useState('')

  useEffect(() => {
    let vivo = true
    buscarTrailer(p.tmdb_id, p.tipo).then(t => vivo && setTrailer(t || ''))
    generos(p.tmdb_id, p.tipo).then(g => vivo && setGen(g))
    dondeVerla(p.tmdb_id, p.tipo).then(d => vivo && setDonde(d))
    return () => { vivo = false }
  }, [p.tmdb_id, p.tipo])

  useEffect(() => {
    const esc = e => e.key === 'Escape' && onCerrar()
    document.addEventListener('keydown', esc)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', esc)
      document.body.style.overflow = ''
    }
  }, [onCerrar])

  useCerrarConAtras(onCerrar)

  return createPortal(
    <div className="telon grande" onClick={onCerrar}>
      <section className={`diapo suelta${abierta ? ' abierta' : ''}`}
        onClick={e => e.stopPropagation()}>
        <div className="lienzo">
          {(p.fondo || p.cartel) && <img src={p.fondo || p.cartel} alt="" />}
          {trailer && <Trailer clave={trailer} titulo={p.titulo} cartel={p.fondo || p.cartel}
            tmdb={{ id: p.tmdb_id, tipo: p.tipo }} />}
        </div>
        <div className="velo" />

        <button className="cerrar" onClick={onCerrar} aria-label="Cerrar">×</button>

        <div className="cuerpo">
          <div className="meta">
            {[p.tipo === 'tv' ? 'Serie' : 'Película', p.anio, gen, p.voto && `★ ${p.voto}`]
              .filter(Boolean).join(' · ')}
          </div>
          <div className="tit">{p.titulo}</div>

          <Sinopsis texto={p.sinopsis || 'Sin sinopsis disponible en español.'} abierta={abierta}
            onAlternar={() => setAbierta(a => !a)} />

          {donde.length > 0 && (
            <div className="donde">
              <span>En</span>
              {donde.map(d => <img key={d.nombre} src={d.logo} alt={d.nombre} title={d.nombre} />)}
            </div>
          )}

          {/* comentario y botones van aparte: el hueco de encima es lo que
              sube el título y la sinopsis sin mover esto de abajo */}
          <div className="pie-ficha">
            {!ocultarBoton && conNota && !puesta && (
              <textarea className="nota-corta" value={nota}
                onChange={e => setNota(e.target.value)} maxLength={200}
                placeholder="Comentario (opcional)" />
            )}
            {!ocultarBoton && (
              <button className={`btn${puesta ? ' suave' : ''}`}
                onClick={() => onProponer(nota.trim())} disabled={puesta}>
                {puesta ? (etiquetaPuesta || 'Ya está en tu lista') : (etiquetaBoton || 'Proponer')}
              </button>
            )}
            {acciones}
          </div>
        </div>
      </section>
    </div>
    ,
    document.body
  )
}

/* Las propuestas guardadas antes del arreglo no tienen la clave del
 * tráiler. En vez de dejarlas sin vídeo, se busca en el momento. */
function useTrailerDe(p) {
  const guardado = p ? p.trailer : null
  const tmdb = p ? p.tmdb_id : null
  const tipo = p ? p.tipo : null
  const de = `${tipo}-${tmdb}`
  // se recuerda de qué título es lo buscado: al pasar de tarjeta no se
  // cuela el vídeo de la anterior mientras llega el nuevo
  const [buscado, setBuscado] = useState({ de: null, clave: null })

  useEffect(() => {
    if (!tmdb || guardado) return
    let vivo = true
    buscarTrailer(tmdb, tipo).then(t => vivo && setBuscado({ de, clave: t || null }))
    return () => { vivo = false }
  }, [tmdb, tipo, guardado, de])

  if (!p) return null
  if (guardado) return guardado
  return buscado.de === de ? buscado.clave : null
}

/* ======================= votar ======================= */
/* Mismo formato que Estrenos: una tarjeta por pantalla, el tráiler sonando
   y las tres opciones abajo. El tráiler ya viene guardado con el título,
   así que aquí no hay que pedirle nada a TMDB. */
function Votar({ cola, nombres, onVotar }) {
  const [activo, setActivo] = useState(0)
  const [abierta, setAbierta] = useState(null)
  const pista = useRef(null)
  const actual = cola[activo]
  const claveVideo = useTrailerDe(actual)

  useEffect(() => {
    const caja = pista.current
    if (!caja) return
    const ojo = new IntersectionObserver(
      entradas => entradas.forEach(e => {
        if (e.isIntersecting) setActivo(Number(e.target.dataset.i))
      }),
      { root: caja, threshold: 0.6 }
    )
    caja.querySelectorAll('.diapo').forEach(d => ojo.observe(d))
    return () => ojo.disconnect()
  }, [cola.length])

  if (!cola.length) {
    return (
      <div className="vacio">
        <b>Nada que votar</b>
        Cuando alguien proponga algo nuevo, aparecerá aquí.
      </div>
    )
  }

  return (
    <div className="pista" ref={pista}>
      {cola.map((p, i) => {
        const clave = p.id
        return (
          <Deslizable className={`diapo${abierta === clave ? ' abierta' : ''}`}
            dataI={i} key={clave}
            onSi={() => onVotar(p.id, 'si')} onNo={() => onVotar(p.id, 'no')}>
            <div className="lienzo">
              {(p.fondo || p.cartel) && <img src={p.fondo || p.cartel} alt="" />}
            </div>
            <div className="velo" />

            <div className="chip der">{nombres[p.propuesto_por] || 'Alguien'}</div>
            <div className="torre">
              <button className="redondo principal" onClick={() => onVotar(p.id, 'si')}>
                <span>♥</span><i>Me apetece</i>
              </button>
              <button className="redondo" onClick={() => onVotar(p.id, 'no')}>
                <span>✕</span><i>Paso</i>
              </button>
              <button className="redondo" onClick={() => onVotar(p.id, 'vista')}>
                <span>👁</span><i>Vista</i>
              </button>
            </div>

            <div className="cuerpo">
              <div className="meta">
                {[p.tipo === 'tv' ? 'Serie' : 'Película', p.anio, p.genero]
                  .filter(Boolean).join(' · ')}
              </div>
              <div className="tit">{p.titulo}</div>
              {p.nota && (
                <div className="comentario">
                  <b>{nombres[p.propuesto_por] || 'Alguien'}:</b> {p.nota}
                </div>
              )}
              <Sinopsis texto={p.sinopsis} abierta={abierta === clave}
                onAlternar={() => setAbierta(a => (a === clave ? null : clave))} />

            </div>
          </Deslizable>
        )
      })}
      {actual && (
        <TrailerFlotante pista={pista} activo={activo} cuenta={cola.length}
          clave={claveVideo} titulo={actual.titulo}
          cartel={actual.fondo || actual.cartel}
          tmdb={actual.tmdb_id ? { id: actual.tmdb_id, tipo: actual.tipo } : null} />
      )}
    </div>
  )
}

/* ======================= ajustes ======================= */
function Ajustes({ yo, nombres, parejas, pareja, email, onCambiarPareja, onRecargarParejas, onSalir, onCerrar }) {
  const [seccion, setSeccion] = useState('cuenta')
  const [nombre, setNombre] = useState(nombres[yo] === 'Alguien' ? '' : (nombres[yo] || ''))
  const [pass, setPass] = useState('')
  const [codigo, setCodigo] = useState('')
  const [ok, setOk] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const limpiar = () => { setOk(''); setError('') }

  async function guardarNombre() {
    setOcupado(true); limpiar()
    const { error } = await supabase.from('perfiles').update({ nombre: nombre.trim() }).eq('id', yo)
    setOcupado(false)
    if (error) setError(error.message)
    else { setOk('Nombre guardado'); onRecargarParejas() }
  }

  async function cambiarPass() {
    if (pass.length < 8) return setError('La contraseña necesita 8 caracteres como mínimo.')
    setOcupado(true); limpiar()
    const { error } = await supabase.auth.updateUser({ password: pass })
    setOcupado(false)
    if (error) setError(error.message)
    else { setOk('Contraseña cambiada'); setPass('') }
  }

  async function crearGrupo() {
    setOcupado(true); limpiar()
    const { data, error } = await supabase.rpc('crear_pareja')
    setOcupado(false)
    if (error) return setError(error.message)
    setOk(`Grupo creado. Su código es ${data}`)
    await onRecargarParejas()
  }

  async function unirseGrupo() {
    setOcupado(true); limpiar()
    const { error } = await supabase.rpc('unirse_pareja', { cod: codigo })
    setOcupado(false)
    if (error) return setError('No existe ningún grupo con ese código.')
    setCodigo(''); setOk('Te has unido al grupo')
    await onRecargarParejas()
  }

  return createPortal(
    <div className="telon" onClick={onCerrar}>
      <div className="panel chico" onClick={e => e.stopPropagation()}>
        <button className="cerrar" onClick={onCerrar} aria-label="Cerrar">×</button>
        <div className="detalle">
          <h3>Tu cuenta</h3>

          <div className="pestanas fina" style={{ marginTop: 14 }}>
            <button className={seccion === 'cuenta' ? 'activo' : ''}
              onClick={() => { setSeccion('cuenta'); limpiar() }}>Cuenta</button>
            <button className={seccion === 'grupos' ? 'activo' : ''}
              onClick={() => { setSeccion('grupos'); limpiar() }}>
              Grupos <em>{parejas.length}</em>
            </button>
          </div>

          {ok && <div className="ok" style={{ marginTop: 14 }}>{ok}</div>}
          {error && <div className="error">{error}</div>}

          {seccion === 'cuenta' && (
            <>
              <div className="bloque-ajuste">
                <label>Correo</label>
                <div className="dato">{email}</div>
                <div className="ayuda" style={{ marginTop: 6, marginBottom: 0 }}>
                  El correo no se puede cambiar desde aquí.
                </div>
              </div>

              <div className="bloque-ajuste">
                <label>Nombre</label>
                <div className="ayuda">Es el que ven los demás en tus propuestas.</div>
                <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
                  placeholder="Tu nombre" />
                <button className="btn suave" onClick={guardarNombre}
                  disabled={ocupado || !nombre.trim()}>Guardar nombre</button>
              </div>

              <div className="bloque-ajuste">
                <label>Contraseña</label>
                <input type="password" value={pass} onChange={e => setPass(e.target.value)}
                  placeholder="Nueva contraseña" autoComplete="new-password" />
                <button className="btn suave" onClick={cambiarPass}
                  disabled={ocupado || !pass}>Cambiar contraseña</button>
              </div>

              <div className="bloque-ajuste">
                <button className="btn suave peligro" onClick={onSalir}>Cerrar sesión</button>
              </div>
            </>
          )}

          {seccion === 'grupos' && (
            <>
              <div className="bloque-ajuste">
                <label>Tus grupos</label>
                <div className="ayuda">
                  Cada grupo lleva sus propias listas y coincidencias, separadas del resto.
                </div>
                <div className="grupos">
                  {parejas.map(p => (
                    <button key={p.id}
                      className={`grupo-fila${p.id === pareja.id ? ' activo' : ''}`}
                      onClick={() => { onCambiarPareja(p); onCerrar() }}>
                      <span>Código {p.codigo}</span>
                      {p.id === pareja.id && <i>En uso</i>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bloque-ajuste">
                <label>Unirte a otro</label>
                <div className="ayuda">Pide el código a quien ya esté dentro.</div>
                <div className="anadir">
                  <input type="text" value={codigo} placeholder="Código del grupo"
                    onChange={e => setCodigo(e.target.value.toUpperCase())} />
                  <button onClick={unirseGrupo} disabled={ocupado || codigo.length < 4}>+</button>
                </div>
              </div>

              <div className="bloque-ajuste">
                <label>Empezar uno nuevo</label>
                <div className="ayuda">Te dará un código para pasárselo a quien quieras.</div>
                <button className="btn suave" onClick={crearGrupo} disabled={ocupado}>
                  Crear un grupo
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    ,
    document.body
  )
}

/* ======================= mis pelis ======================= */
function Mias({ lista, suVoto, onQuitar, guardados, guardada, onGuardar, onOlvidar,
  descartada, motivoDescarte, onDescartar, onRecuperar, onComentar, codigo,
  todos, votos, descartes, yo, onVotarTitulo }) {
  const [ficha, setFicha] = useState(null)
  const [pestana, setPestana] = useState('propuestas')
  const [editando, setEditando] = useState(null)
  const [texto, setTexto] = useState('')

  const texto_voto = v =>
    v === 'si' ? '♥ Le gusta'
    : v === 'vista' ? '👁 Vista'
    : v === 'no' ? '✕ Descartada'
    : 'Sin votar'

  function abrirComentario(p) {
    setEditando(p.id)
    setTexto(p.nota || '')
  }
  const pelis = lista.filter(p => p.tipo !== 'tv')
  const series = lista.filter(p => p.tipo === 'tv')

  const bloque = (titulo, grupo) => grupo.length > 0 && (
    <section className="grupo" key={titulo}>
      <h3>{titulo} <span>{grupo.length}</span></h3>
      <div className="catalogo">
        {grupo.map(p => {
          const v = suVoto(p.id)
          return (
            <div className="tarjeta" key={p.id}>
              <button className={`lamina${v === 'no' ? ' puesta' : ''}`}
                onClick={() => setFicha(p)}
                aria-label={`Ver información de ${p.titulo}`}>
                <img src={p.cartel} alt="" loading="lazy" />
                {p.nota && <span className="tag">💬</span>}
                <span className={`sello-foto ${v || ''}`}>{texto_voto(v)}</span>
              </button>
              <div className="rotulo">{p.titulo}</div>
              <button className="comentar" onClick={() => abrirComentario(p)}>
                {p.nota ? 'Editar comentario' : 'Comentar'}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )

  return (
    <div className="mis-pelis">
      <h2>Mis pelis</h2>

      <div className="pestanas fina">
        <button className={pestana === 'propuestas' ? 'activo' : ''}
          onClick={() => setPestana('propuestas')}>
          Propuestas <em>{lista.length}</em>
        </button>
        <button className={pestana === 'mias' ? 'activo' : ''}
          onClick={() => setPestana('mias')}>
          Para mí <em>{guardados.length}</em>
        </button>
        <button className={pestana === 'historial' ? 'activo' : ''}
          onClick={() => setPestana('historial')}>
          Historial
        </button>
      </div>

      {pestana === 'propuestas' && (
        <>
          <div className="ayuda">Lo que has propuesto y qué han dicho.</div>
          {lista.length === 0
            ? <div className="vacio"><b>Lista vacía</b>Ve a Añadir y busca la primera.</div>
            : <>{bloque('Películas', pelis)}{bloque('Series', series)}</>}
        </>
      )}

      {pestana === 'mias' && (
        <>
          <div className="ayuda">Solo para ti. Nadie más ve esta lista.</div>
          {guardados.length === 0
            ? <div className="vacio"><b>Nada guardado</b>Usa «Para mí» en Estrenos o en la ficha de cualquier título.</div>
            : (
              <div className="catalogo">
                {guardados.map(p => (
                  <div className="tarjeta" key={`${p.tipo}-${p.tmdb_id}`}>
                    <button className="lamina" onClick={() => setFicha(p)}
                      aria-label={`Ver información de ${p.titulo}`}>
                      <img src={p.cartel} alt="" loading="lazy" />
                      <span className="tag">{p.tipo === 'tv' ? 'Serie' : 'Peli'}</span>
                      {descartada(p) && (
                        <span className={`sello-foto ${motivoDescarte(p) === 'vista' ? 'vista' : 'no'}`}>
                          {motivoDescarte(p) === 'vista' ? '👁 Vista' : '✕ No interesa'}
                        </span>
                      )}
                    </button>
                    <div className="rotulo">{p.titulo}<i>{p.anio}</i></div>
                    <button className="comentar" onClick={() => onOlvidar(p)}>Quitar</button>
                  </div>
                ))}
              </div>
            )}
        </>
      )}

      {pestana === 'historial' && (
        <Historial todos={todos} votos={votos} descartes={descartes} yo={yo}
          onRecuperar={onRecuperar} onVotar={onVotarTitulo}
          guardada={guardada} onGuardar={onGuardar} onOlvidar={onOlvidar} />
      )}

      <div className="pie">Código del grupo: <b>{codigo}</b></div>

      {editando && (
        <Comentario titulo={(lista.find(x => x.id === editando) || {}).titulo}
          inicial={texto}
          onCerrar={() => setEditando(null)}
          onGuardar={async nota => { await onComentar(editando, nota); setEditando(null) }} />
      )}

      {ficha && (
        <Ficha p={ficha} puesta ocultarBoton
          onCerrar={() => setFicha(null)}
          onProponer={() => setFicha(null)}
          acciones={
            <div className="acciones-redondas">
              {ficha.id
                ? <>
                    <button className={`redondo${guardada(ficha) ? ' marcado' : ''}`}
                      onClick={() => (guardada(ficha) ? onOlvidar : onGuardar)(ficha)}>
                      <span>🔖</span><i>{guardada(ficha) ? 'Guardada' : 'Para mí'}</i>
                    </button>
                    <button className="redondo"
                      onClick={async () => { await onQuitar(ficha.id); setFicha(null) }}>
                      <span>🗑</span><i>Retirar</i>
                    </button>
                  </>
                : <>
                    <button className="redondo marcado" onClick={() => onOlvidar(ficha)}>
                      <span>🔖</span><i>Guardada</i>
                    </button>
                    {descartada(ficha)
                      ? <button className="redondo"
                          aria-label={motivoDescarte(ficha) === 'vista' ? 'Marcada como vista · deshacer' : 'No te interesa · deshacer'}
                          onClick={() => onRecuperar(ficha)}>
                          <span>↺</span><i>Deshacer</i>
                        </button>
                      : <>
                          <button className="redondo" onClick={() => onDescartar(ficha, 'no_interesa')}>
                            <span>✕</span><i>Paso</i>
                          </button>
                          <button className="redondo" onClick={() => onDescartar(ficha, 'vista')}>
                            <span>👁</span><i>Vista</i>
                          </button>
                        </>}
                  </>}
            </div>
          } />
      )}
    </div>
  )
}

/* ======================= coincidencias ======================= */
function Matches({ lista, onRectificar, guardada, onGuardar, onOlvidar }) {
  const [ficha, setFicha] = useState(null)
  const [juego, setJuego] = useState('lista')

  async function marcar(voto) {
    await onRectificar(ficha, voto)
    setFicha(null)
  }

  if (!lista.length) {
    return (
      <div className="vacio">
        <b>Todavía ninguna</b>
        En cuanto dos digáis que sí a lo mismo, aparece aquí.
      </div>
    )
  }

  const pelis = lista.filter(p => p.tipo !== 'tv')
  const series = lista.filter(p => p.tipo === 'tv')

  const bloque = (titulo, grupo) => grupo.length > 0 && (
    <section className="grupo">
      <h3>{titulo} <span>{grupo.length}</span></h3>
      <div className="catalogo">
        {grupo.map(p => (
          <div className="tarjeta" key={p.id}>
            <button className="lamina" onClick={() => setFicha(p)}
              aria-label={`Ver información de ${p.titulo}`}>
              <img src={p.cartel} alt="" loading="lazy" />
            </button>
            <div className="rotulo">{p.titulo}</div>
          </div>
        ))}
      </div>
    </section>
  )

  return (
    <>
      <h2>Coincidencias</h2>
      <div className="ayuda">Os apetecen a los dos. De aquí sale el plan.</div>

      {juego === 'lista'
        ? <button className="chip-juego" onClick={() => setJuego('ruleta')}>🎲 Juego</button>
        : <button className="chip-juego" onClick={() => setJuego('lista')}>← Lista</button>}

      {juego !== 'lista' && (
        <div className="pestanas">
          <button className={juego === 'ruleta' ? 'activo' : ''} onClick={() => setJuego('ruleta')}>Ruleta</button>
          <button className={juego === 'torneo' ? 'activo' : ''} onClick={() => setJuego('torneo')}>Torneo</button>
        </div>
      )}

      {juego === 'lista' && (
        <>
          {bloque('Películas', pelis)}
          {bloque('Series', series)}
        </>
      )}
      {juego === 'ruleta' && <Ruleta lista={lista} onFicha={setFicha} />}
      {juego === 'torneo' && <Torneo lista={lista} onFicha={setFicha} />}

      {ficha && (
        <Ficha p={ficha} puesta ocultarBoton
          onCerrar={() => setFicha(null)}
          onProponer={() => setFicha(null)}
          acciones={
            <div className="acciones-redondas">
              <button className="redondo" onClick={() => marcar('vista')}>
                <span>👁</span><i>Vista</i>
              </button>
              <button className={`redondo${guardada(ficha) ? ' marcado' : ''}`}
                onClick={() => (guardada(ficha) ? onOlvidar : onGuardar)(ficha)}>
                <span>🔖</span><i>{guardada(ficha) ? 'Guardada' : 'Para mí'}</i>
              </button>
              <button className="redondo" onClick={() => marcar('no')}>
                <span>✕</span><i>Paso</i>
              </button>
            </div>
          } />
      )}
    </>
  )
}

/* ---- historial: qué ha dicho cada uno de cada título ----
 * Coincidencias solo guarda lo que os gusta a los dos. Aquí se ve todo
 * lo demás: lo descartado y lo ya visto, y de quién es cada voto.
 */
function Historial({ todos, votos, descartes, yo, onRecuperar, onVotar, guardada, onGuardar, onOlvidar }) {
  const [estado, setEstado] = useState('no')
  const [ficha, setFicha] = useState(null)

  const miVoto = id => {
    const v = votos.find(x => x.titulo_id === id && x.usuario_id === yo)
    return v ? v.voto : null
  }

  /**
   * Tus decisiones vienen de dos sitios: lo que apartaste en Estrenos o en
   * Añadir (tabla de descartes, que solo ves tú) y lo que votaste que no o
   * que ya habías visto sobre las propuestas de la otra persona.
   */
  const deDescartes = descartes
    .filter(d => d.titulo)     // las guardadas antes de tener título no se pueden pintar
    .map(d => ({
      clave: `d-${d.tipo}-${d.tmdb_id}`,
      titulo: d.titulo, cartel: d.cartel, anio: d.anio,
      tipo: d.tipo, tmdb_id: d.tmdb_id,
      estado: d.motivo === 'vista' ? 'vista' : 'no',
      origen: 'descarte',
      dato: d
    }))

  const deVotos = todos
    .filter(t => t.propuesto_por !== yo && ['no', 'vista'].includes(miVoto(t.id)))
    .map(t => ({
      clave: `v-${t.id}`,
      titulo: t.titulo, cartel: t.cartel, anio: t.anio,
      tipo: t.tipo, tmdb_id: t.tmdb_id,
      estado: miVoto(t.id),
      origen: 'voto',
      dato: t
    }))

  const fichas = [...deDescartes, ...deVotos]
  const cuenta = e => fichas.filter(f => f.estado === e).length
  const visibles = fichas.filter(f => f.estado === estado)

  async function deshacer(f) {
    if (f.origen === 'descarte') await onRecuperar(f.dato)
    else await onVotar(f.dato.id, 'si')
  }

  // "Recuperar" no decía qué iba a pasar; con el estado delante queda claro
  const etiquetaDeshacer = f => f.estado === 'vista' ? 'Me apetece verla de nuevo' : 'Sí me apetece'

  return (
    <>
      <div className="ayuda">
        Tus decisiones. La otra persona no ve esta pantalla.
      </div>

      <div className="filtros">
        {[['no', 'No me interesan'], ['vista', 'Ya vistas']].map(([id, nombre]) => (
          <button key={id} className={estado === id ? 'activo' : ''}
            onClick={() => setEstado(id)}>
            {nombre} · {cuenta(id)}
          </button>
        ))}
      </div>

      {visibles.length === 0
        ? <div className="vacio"><b>Nada aquí</b>Todavía no has apartado nada en este apartado.</div>
        : (
          <div className="catalogo">
            {visibles.map(f => (
              <div className="tarjeta" key={f.clave}>
                <button className="lamina puesta" onClick={() => setFicha(f)}
                  aria-label={`Ver información de ${f.titulo}`}>
                  {f.cartel && <img src={f.cartel} alt="" loading="lazy" />}
                </button>
                <div className="rotulo">{f.titulo}<i>{f.anio}</i></div>
              </div>
            ))}
          </div>
        )}

      {ficha && (
        <Ficha p={ficha.dato} puesta ocultarBoton
          onCerrar={() => setFicha(null)}
          onProponer={() => setFicha(null)}
          acciones={
            <div className="acciones-redondas">
              <button className="redondo" aria-label={etiquetaDeshacer(ficha)}
                onClick={async () => { await deshacer(ficha); setFicha(null) }}>
                <span>↺</span><i>{ficha.estado === 'vista' ? 'De nuevo' : 'Me interesa'}</i>
              </button>
              <button className={`redondo${guardada(ficha.dato) ? ' marcado' : ''}`}
                onClick={() => (guardada(ficha.dato) ? onOlvidar : onGuardar)(ficha.dato)}>
                <span>🔖</span><i>{guardada(ficha.dato) ? 'Guardada' : 'Para mí'}</i>
              </button>
            </div>
          } />
      )}
    </>
  )
}

/* ---- selector común de los juegos ---- */
function Filtro({ valor, onCambio, pelis, series }) {
  const opciones = [
    ['todas', 'Todas', pelis + series],
    ['movie', 'Películas', pelis],
    ['tv', 'Series', series]
  ].filter(([, , n]) => n > 0)

  if (opciones.length < 2) return null

  return (
    <div className="pestanas fina">
      {opciones.map(([id, nombre, n]) => (
        <button key={id} className={valor === id ? 'activo' : ''} onClick={() => onCambio(id)}>
          {nombre} <em>{n}</em>
        </button>
      ))}
    </div>
  )
}

const filtrar = (lista, f) =>
  f === 'movie' ? lista.filter(p => p.tipo !== 'tv')
  : f === 'tv' ? lista.filter(p => p.tipo === 'tv')
  : lista

/* ---- ruleta: que decida el azar ---- */
function Ruleta({ lista, onFicha }) {
  const [filtro, setFiltro] = useState('todas')
  const [girando, setGirando] = useState(false)
  const [actual, setActual] = useState(null)
  const [elegida, setElegida] = useState(null)

  const pelis = lista.filter(p => p.tipo !== 'tv').length
  const series = lista.filter(p => p.tipo === 'tv').length
  const grupo = filtrar(lista, filtro)

  function cambiarFiltro(f) {
    setFiltro(f); setElegida(null); setActual(null)
  }

  function girar() {
    if (girando || !grupo.length) return
    setElegida(null)
    setGirando(true)
    let vueltas = 0
    const total = 18 + Math.floor(Math.random() * 8)
    const paso = () => {
      setActual(grupo[Math.floor(Math.random() * grupo.length)])
      vueltas++
      if (vueltas < total) {
        // va frenando poco a poco, como una ruleta de verdad
        setTimeout(paso, 60 + Math.pow(vueltas / total, 3) * 340)
      } else {
        const fin = grupo[Math.floor(Math.random() * grupo.length)]
        setActual(fin); setElegida(fin); setGirando(false)
      }
    }
    paso()
  }

  const p = actual
  return (
    <div className="ruleta">
      <Filtro valor={filtro} onCambio={cambiarFiltro} pelis={pelis} series={series} />
      <div className={`tambor${girando ? ' girando' : ''}`}>
        {p
          ? <img src={p.cartel} alt="" />
          : <div className="hueco">Dale al botón y que decida la suerte</div>}
      </div>
      {elegida && (
        <div className="veredicto">
          <span>Esta noche toca</span>
          <button onClick={() => onFicha(elegida)}>{elegida.titulo}</button>
        </div>
      )}
      <button className="btn" onClick={girar} disabled={girando || !grupo.length}>
        {girando ? 'Girando…' : elegida ? 'Otra vez' : 'Girar'}
      </button>
      <div className="contador">{grupo.length} en juego</div>
    </div>
  )
}

/* ---- torneo: eliminatorias hasta que quede una ---- */
function Torneo({ lista, onFicha }) {
  const [filtro, setFiltro] = useState('todas')
  const [tope, setTope] = useState(8)   // cuántas entran al cuadro
  const [ronda, setRonda] = useState([])
  const [pasan, setPasan] = useState([])
  const [i, setI] = useState(0)
  const [campeona, setCampeona] = useState(null)

  const pelis = lista.filter(p => p.tipo !== 'tv').length
  const series = lista.filter(p => p.tipo === 'tv').length
  const grupo = filtrar(lista, filtro)

  // El cuadro solo se rehace cuando cambian de verdad los títulos, no en
  // cada refresco en tiempo real: si no, el torneo se reiniciaba solo.
  const clave = grupo.map(p => p.id).sort().join(',') + '|' + tope

  // Con muchas coincidencias, un cuadro completo son decenas de duelos.
  // Se coge una muestra al azar del tamaño elegido.
  const preparar = () => {
    const mezcla = barajar(grupo)
    return tope === 0 ? mezcla : mezcla.slice(0, tope)
  }

  useEffect(() => {
    setRonda(preparar()); setPasan([]); setI(0); setCampeona(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])

  function rejugar() {
    setRonda(preparar()); setPasan([]); setI(0); setCampeona(null)
  }

  function cerrarRonda(siguientes) {
    if (siguientes.length === 1) { setCampeona(siguientes[0]); return }
    setRonda(siguientes); setPasan([]); setI(0)
  }

  function elegir(ganadora) {
    const siguientes = [...pasan, ganadora]
    const resto = i + 2
    if (resto < ronda.length) {
      if (resto === ronda.length - 1) {
        // sobra una suelta: pasa directa a la siguiente ronda
        cerrarRonda([...siguientes, ronda[resto]])
      } else {
        setPasan(siguientes); setI(resto)
      }
    } else {
      cerrarRonda(siguientes)
    }
  }

  const duelos = Math.max(0, (tope === 0 ? grupo.length : Math.min(tope, grupo.length)) - 1)

  const cabecera = (
    <>
      <Filtro valor={filtro} onCambio={f => setFiltro(f)} pelis={pelis} series={series} />
      <div className="filtros">
        {[[8, '8'], [16, '16'], [32, '32'], [0, 'Todas']].map(([n, nombre]) => (
          <button key={n} className={tope === n ? 'activo' : ''}
            onClick={() => setTope(n)}
            disabled={n !== 0 && n > grupo.length}>
            {nombre}
          </button>
        ))}
      </div>
      <div className="ayuda" style={{ margin: '8px 0 0' }}>
        {duelos} duelo{duelos === 1 ? '' : 's'} hasta la ganadora.
      </div>
    </>
  )

  if (grupo.length < 2) {
    return (
      <>
        {cabecera}
        <div className="vacio"><b>Hacen falta dos</b>Con una sola no hay torneo.</div>
      </>
    )
  }

  if (campeona) {
    return (
      <div className="ruleta">
        {cabecera}
        <div className="tambor"><img src={campeona.cartel} alt="" /></div>
        <div className="veredicto">
          <span>Ganadora del torneo</span>
          <button onClick={() => onFicha(campeona)}>{campeona.titulo}</button>
        </div>
        <button className="btn" onClick={rejugar}>Jugar otra vez</button>
      </div>
    )
  }

  const a = ronda[i], b = ronda[i + 1]
  if (!a || !b) return <>{cabecera}<div className="cargando">Preparando el cuadro…</div></>

  const quedan = ronda.length
  const fase = quedan === 2 ? 'Final'
    : quedan <= 4 ? 'Semifinal'
    : quedan <= 8 ? 'Cuartos'
    : `Ronda de ${quedan}`

  return (
    <div className="torneo">
      {cabecera}
      <div className="fase">{fase}</div>
      <div className="duelo">
        {[a, b].map(p => (
          <button className="aspirante" key={p.id} onClick={() => elegir(p)}>
            <img src={p.cartel} alt="" />
            <span>{p.titulo}</span>
          </button>
        ))}
      </div>
      <div className="contador">
        Duelo {Math.floor(i / 2) + 1} de {Math.floor(quedan / 2)} · toca la que prefieras
      </div>
    </div>
  )
}
