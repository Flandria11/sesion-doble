import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { cargarYT } from './lib/youtube'
import { buscar, explorar, estrenos, MODOS, ANOS, plataformas, generosLista, buscarTrailer, generos, dondeVerla } from './lib/tmdb'

/* ======================= raíz ======================= */
export default function App() {
  const [sesion, setSesion] = useState(undefined)
  const [pareja, setPareja] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSesion(s)
      setPareja(undefined)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const cargarPareja = useCallback(async () => {
    if (!sesion) return
    const { data } = await supabase
      .from('miembros')
      .select('pareja_id, parejas(codigo)')
      .eq('usuario_id', sesion.user.id)
      .maybeSingle()
    setPareja(data ? { id: data.pareja_id, codigo: data.parejas?.codigo } : null)
  }, [sesion])

  useEffect(() => { if (sesion) cargarPareja() }, [sesion, cargarPareja])

  if (sesion === undefined) return <Marco><div className="cargando">Abriendo la taquilla…</div></Marco>
  if (!sesion) return <Marco sub="Dos listas, un plan"><Acceso /></Marco>
  if (pareja === undefined) return <Marco><div className="cargando">Cargando…</div></Marco>
  if (!pareja) return <Marco sub="Falta emparejar"><Emparejar alUnir={cargarPareja} /></Marco>

  return <Principal sesion={sesion} pareja={pareja} />
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
      <p>Tú apuntas pelis y series. La otra persona las desliza y dice sí o no. Y al revés.</p>
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
    if (error) return setError('No existe ninguna pareja con ese código.')
    alUnir()
  }

  if (mio) {
    return (
      <div className="acceso">
        <h2>Tu código</h2>
        <p>Pásaselo a la otra persona. Lo mete al entrar y quedáis conectados.</p>
        <div className="codigo">{mio}</div>
        <button className="btn" onClick={alUnir}>Ya se lo he pasado</button>
      </div>
    )
  }

  return (
    <div className="acceso">
      <h2>Emparejar</h2>
      <p>Uno de los dos crea el código y el otro lo introduce. Solo hay que hacerlo una vez.</p>
      {error && <div className="error">{error}</div>}
      <button className="btn" onClick={crear} disabled={ocupado}>Crear un código</button>
      <div style={{ margin: '26px 0 10px', color: 'var(--paso)', fontSize: 13 }}>o</div>
      <input type="text" placeholder="Código de tu pareja" value={codigo}
        onChange={e => setCodigo(e.target.value.toUpperCase())}
        onKeyDown={e => e.key === 'Enter' && unirse()} />
      <button className="btn suave" onClick={unirse} disabled={ocupado || codigo.length < 4}>
        Unirme
      </button>
    </div>
  )
}

/* ======================= app principal ======================= */
function Principal({ sesion, pareja }) {
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
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    const [t, v, p, d, g] = await Promise.all([
      supabase.from('titulos').select('*').eq('pareja_id', pareja.id).order('creado'),
      supabase.from('votos').select('*'),
      supabase.from('perfiles').select('id, nombre'),
      supabase.from('descartes').select('tmdb_id, tipo')
    ])
    setTitulos(t.data || [])
    setVotos(v.data || [])
    setNombres(Object.fromEntries((p.data || []).map(x => [x.id, x.nombre || 'Tu pareja'])))
    setDescartes(d.data || [])
    setGuardados(g.data || [])
    setCargando(false)
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
  // quién votó que sí a una propuesta mía (puede haber más de un miembro)
  const quienDijoSi = id => votos.find(v => v.titulo_id === id && v.usuario_id !== yo && v.voto === 'si')?.usuario_id

  const matches = [
    ...mios.filter(t => suVoto(t.id) === 'si')
      .map(t => ({ ...t, quien: `Le gusta a ${nombres[quienDijoSi(t.id)] || 'tu pareja'}` })),
    ...suyos.filter(t => miVoto(t.id) === 'si')
      .map(t => ({ ...t, quien: `De ${nombres[t.propuesto_por] || 'tu pareja'}` }))
  ]

  async function votar(tituloId, voto) {
    setVotos(v => [...v.filter(x => !(x.titulo_id === tituloId && x.usuario_id === yo)),
      { titulo_id: tituloId, usuario_id: yo, voto }])
    await supabase.from('votos').upsert(
      { titulo_id: tituloId, usuario_id: yo, voto },
      { onConflict: 'titulo_id,usuario_id' }
    )
  }

  async function anadir(p) {
    const trailer = await buscarTrailer(p.tmdb_id, p.tipo)
    const genero = await generos(p.tmdb_id, p.tipo)
    const { error } = await supabase.from('titulos').insert({
      pareja_id: pareja.id, propuesto_por: yo,
      tmdb_id: p.tmdb_id, tipo: p.tipo, titulo: p.titulo,
      anio: p.anio, cartel: p.cartel, fondo: p.fondo,
      sinopsis: p.sinopsis, trailer, genero
    })
    if (!error) recargar()
    return !error
  }

  // Rectificar desde coincidencias: si la propuse yo, cambio el voto de la
  // otra persona no puedo, asi que retiro mi propuesta; si la propuso ella,
  // cambio mi voto.
  async function rectificar(p, voto) {
    if (p.propuesto_por === yo) {
      await quitar(p.id)
    } else {
      await votar(p.id, voto)
    }
  }

  // Los descartes son de cada uno: lo que tú no quieres ver le sigue
  // apareciendo a la otra persona, que para eso tenéis gustos distintos.
  async function descartar(p, motivo = 'no_interesa') {
    const fila = { usuario_id: yo, tmdb_id: p.tmdb_id, tipo: p.tipo, motivo }
    setDescartes(l => [
      ...l.filter(d => !(d.tmdb_id === p.tmdb_id && d.tipo === p.tipo)),
      fila
    ])

    const { error } = await supabase.from('descartes')
      .upsert(fila, { onConflict: 'usuario_id,tmdb_id,tipo' })

    if (error) {
      // sin esto el fallo se perdía en silencio y los descartes volvían
      console.error('descartes:', error)
      setAviso(`No se ha podido guardar el descarte: ${error.message}`)
      setDescartes(l => l.filter(d => !(d.tmdb_id === p.tmdb_id && d.tipo === p.tipo)))
      return
    }
    setAviso('')

    // si la habías propuesto tú, se retira
    const mia = titulos.find(t => t.tmdb_id === p.tmdb_id && t.tipo === p.tipo && t.propuesto_por === yo)
    if (mia) await quitar(mia.id)
  }

  async function recuperar(p) {
    setDescartes(l => l.filter(d => !(d.tmdb_id === p.tmdb_id && d.tipo === p.tipo)))
    const { error } = await supabase.from('descartes').delete()
      .eq('usuario_id', yo).eq('tmdb_id', p.tmdb_id).eq('tipo', p.tipo)
    if (error) {
      console.error('descartes:', error)
      setAviso(`No se ha podido deshacer: ${error.message}`)
    }
  }

  const descartada = p => descartes.some(x => x.tmdb_id === p.tmdb_id && x.tipo === p.tipo)
  const motivoDescarte = p =>
    (descartes.find(x => x.tmdb_id === p.tmdb_id && x.tipo === p.tipo) || {}).motivo

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
      setAviso(`No se ha podido guardar: ${error.message}`)
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
    setTitulos(l => l.map(t => (t.id === id ? { ...t, nota } : t)))
    const { error } = await supabase.from('titulos').update({ nota }).eq('id', id)
    if (error) setAviso(`No se ha podido guardar el comentario: ${error.message}`)
  }

  async function quitar(id) {
    setTitulos(t => t.filter(x => x.id !== id))
    await supabase.from('titulos').delete().eq('id', id)
  }

  const pestanas = [
    ['buscar', 'Añadir', 0],
    ['reel', 'Estrenos', 0],
    ['votar', 'Votar', cola.length],
    ['mias', 'Mis pelis', 0],
    ['match', 'Coinciden', matches.length]
  ]

  return (
    <div className="app">
      <header>
        <div className="bombillas"><i /><i /><i /><i /><i /><i /><i /></div>
        <h1>DOS BUTACAS</h1>
        <div className="sub">Código {pareja.codigo}</div>
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
            {vista === 'reel' && <Reel titulos={titulos} yo={yo}
                miVoto={miVoto} onAdd={anadir} onVotar={votar}
                descartada={descartada} onDescartar={descartar}
                guardada={guardada} onGuardar={guardar} />}
            {vista === 'votar' && <Votar cola={cola} nombres={nombres} onVotar={votar} />}
            {vista === 'mias' && <Mias lista={mios} suVoto={suVoto} onQuitar={quitar}
                guardados={guardados} onOlvidar={olvidar} onComentar={comentar}
                onSalir={() => supabase.auth.signOut()} codigo={pareja.codigo} />}
            {vista === 'match' && <Matches lista={matches} onRectificar={rectificar} />}
          </>
        )}
      </main>
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
    let vivo = true
    setCargando(true)
    explorar({ tipo, modo, proveedores: provs, genero, anio, calidad, pagina })
      .then(r => {
        if (!vivo) return
        setRes(ant => (pagina === 1 ? r : [...ant, ...r]))
        setError('')
      })
      .catch(() => vivo && setError('No se ha podido consultar TMDB.'))
      .finally(() => vivo && setCargando(false))
    return () => { vivo = false }
  }, [tipo, modo, provs, genero, anio, calidad, pagina, q])

  const estado = p => {
    const x = titulos.find(t => t.tmdb_id === p.tmdb_id && t.tipo === p.tipo)
    if (!x) return null
    if (x.propuesto_por === yo) return { tipo: 'mio', t: x }
    const v = miVoto(x.id)
    if (v === 'si') return { tipo: 'coincide', t: x }
    return { tipo: 'suyo', t: x }
  }

  async function actuar(p) {
    const e = estado(p)
    if (anadiendo || (e && (e.tipo === 'mio' || e.tipo === 'coincide'))) return
    setAnadiendo(p.tmdb_id)
    if (e) {
      await onVotar(e.t.id, 'si')
      setAnadiendo(null)
      setFiesta(p)
    } else {
      const ok = await onAdd(p)
      setAnadiendo(null)
      if (ok) {
        setFlash(`${p.titulo} está en tu lista`)
        setTimeout(() => setFlash(''), 2600)
      }
    }
  }

  // cualquier cambio de filtro devuelve a la primera página
  const cambiar = fn => (...a) => { fn(...a); setPagina(1); setRes([]) }
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
  const cambiarGenero = cambiar(g => { setGenero(g); if (g) saltarSiHaceFalta() })
  const cambiarAnio = cambiar(a => { setAnio(a); if (a) saltarSiHaceFalta() })
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
   * ya coincide y lo descartado. Lo que propuso ella sigue a la vista,
   * camuflado, porque ahí aún te toca decidir.
   */
  const decidido = p => {
    const e = estado(p)
    if (e && (e.tipo === 'mio' || e.tipo === 'coincide')) return true
    return descartada(p)
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
      <div className="ayuda">Toca una carátula para ver el tráiler, o el + para proponerla.</div>

      <input type="text" placeholder="Buscar una peli o serie…"
        value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />

      {explorando && (
        <>
          <div className="pestanas">
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
            <div className="plataformas">
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

      {!cargando && explorando && res.length > 0 && (
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
          <Ficha p={ficha} puesta={!!visible}
            etiquetaPuesta={visible === 'coincide' ? '¡Ya coincidís en esta!' : 'Ya la propusiste tú'}
            onCerrar={() => setFicha(null)}
            onProponer={async () => { setFicha(null); await actuar(ficha) }}
            acciones={
              <div className="rectificar">
                {guardada(ficha)
                  ? <button onClick={() => { onOlvidar(ficha); setFicha(null) }}>
                      Quitar de mi lista
                    </button>
                  : <button onClick={() => { onGuardar(ficha); setFicha(null) }}>
                      Guardar para mí
                    </button>}
                {descartada(ficha)
                  ? <button onClick={() => { onRecuperar(ficha); setFicha(null) }}>
                      {motivoDescarte(ficha) === 'vista' ? 'Marcada como vista' : 'Descartada'} · deshacer
                    </button>
                  : <>
                      <button onClick={() => { onDescartar(ficha, 'no_interesa'); setFicha(null) }}>
                        No me interesa
                      </button>
                      <button onClick={() => { onDescartar(ficha, 'vista'); setFicha(null) }}>
                        Ya vista
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

/* ---- tráiler del carrusel ----
 * Arranca SIEMPRE en silencio. iOS bloquea del todo un vídeo que intente
 * sonar sin un gesto previo, y entonces no se reproduce nada: por eso en
 * el iPhone no se veía. El sonido se activa con la API de YouTube desde
 * el propio toque, que sí es un gesto válido, y además así no hay que
 * recargar el vídeo y no se reinicia. Si la API no carga, cae a un
 * reproductor normal sin botones.
 */
function Trailer({ clave, titulo, cartel }) {
  const caja = useRef(null)
  const player = useRef(null)
  const [api, setApi] = useState(null)
  const [mudo, setMudo] = useState(true)
  const [parado, setParado] = useState(false)

  useEffect(() => {
    let vivo = true
    // YouTube sustituye el elemento que recibe, así que le damos un hijo
    // creado a mano: React no controla ese nodo y no hay conflicto
    const nido = document.createElement('div')

    cargarYT()
      .then(YT => {
        if (!vivo || !caja.current) return
        caja.current.appendChild(nido)
        player.current = new YT.Player(nido, {
          videoId: clave,
          playerVars: {
            autoplay: 1, mute: 1, controls: 0, rel: 0, modestbranding: 1,
            playsinline: 1, disablekb: 1, iv_load_policy: 3,
            loop: 1, playlist: clave,
            enablejsapi: 1, origin: window.location.origin
          },
          events: { onReady: () => vivo && setApi(true) }
        })
      })
      .catch(() => vivo && setApi(false))

    return () => {
      vivo = false
      if (player.current && player.current.destroy) player.current.destroy()
      player.current = null
      if (nido.parentNode) nido.parentNode.removeChild(nido)
    }
  }, [clave])

  // el reproductor se consulta al pulsar, nunca una copia guardada
  const mando = accion => () => {
    const pl = player.current
    if (!pl || typeof pl.getPlayerState !== 'function') return
    accion(pl)
  }
  const volumen = mando(pl => {
    if (pl.isMuted()) { pl.unMute(); pl.setVolume(70); setMudo(false) }
    else { pl.mute(); setMudo(true) }
  })
  const play = mando(pl => {
    if (pl.getPlayerState() === 1) { pl.pauseVideo(); setParado(true) }
    else { pl.playVideo(); setParado(false) }
  })

  return (
    <>
      {api === false ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${clave}?autoplay=1&mute=1` +
               `&controls=0&loop=1&playlist=${clave}&playsinline=1&rel=0&modestbranding=1`}
          title={titulo} allow="autoplay; encrypted-media" tabIndex={-1} />
      ) : (
        <div ref={caja} className="marco" />
      )}
      <div className="cortina" style={{ backgroundImage: `url(${cartel})` }} />
      {api === true && (
        <div className="mandos-video">
          <button onClick={play} aria-label={parado ? 'Reproducir' : 'Pausar'}>
            {parado ? '▶' : '❚❚'}
          </button>
          <button onClick={volumen} aria-label={mudo ? 'Activar el sonido' : 'Silenciar'}>
            {mudo ? '🔇' : '🔊'}
          </button>
        </div>
      )}
    </>
  )
}

/* ======================= estrenos en vertical ======================= */
function Reel({ titulos, yo, miVoto, onAdd, onVotar, descartada, onDescartar, guardada, onGuardar }) {
  const [lista, setLista] = useState([])
  const [pagina, setPagina] = useState(1)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [activo, setActivo] = useState(0)
  const [trailers, setTrailers] = useState({})
  const [anadiendo, setAnadiendo] = useState(null)
  const [fiesta, setFiesta] = useState(null)
  const [abierta, setAbierta] = useState(null)
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
    const e = estado(p)
    return !(e && (e.tipo === 'mio' || e.tipo === 'coincide'))
  })

  useEffect(() => {
    let vivo = true
    setCargando(true)
    estrenos(pagina)
      .then(r => {
        if (!vivo) return
        setLista(ant => (pagina === 1 ? r : [...ant, ...r]))
        setError('')
      })
      .catch(() => vivo && setError('No se han podido cargar los estrenos.'))
      .finally(() => vivo && setCargando(false))
    return () => { vivo = false }
  }, [pagina])

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
    if (e) {
      await onVotar(e.t.id, 'si')
      setAnadiendo(null)
      setFiesta(p)
    } else {
      await onAdd(p)
      setAnadiendo(null)
    }
  }

  if (cargando && !visibles.length) return <div className="cargando">Buscando estrenos…</div>
  if (error) return <div className="error">{error}</div>
  if (!visibles.length) {
    return (
      <div className="vacio">
        <b>No queda nada</b>
        Has mirado todos los estrenos que cumplen el filtro de calidad.
        Vuelve en unos días.
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
            <section className={`diapo${abierta === clave ? ' abierta' : ''}`}
              key={clave} data-i={i}>
              <div className="lienzo">
                {(p.fondo || p.cartel) && <img src={p.fondo || p.cartel} alt="" />}
                {i === activo && tr && (
                  <Trailer clave={tr} titulo={p.titulo} cartel={p.fondo || p.cartel} />
                )}
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
                  {[p.tipo === 'tv' ? 'Serie' : 'Película', p.anio, p.voto && `★ ${p.voto}`]
                    .filter(Boolean).join(' · ')}
                </div>
                <div className="tit">{p.titulo}</div>
                {p.sinopsis && (
                  <button className="sin"
                    onClick={() => setAbierta(a => (a === clave ? null : clave))}>
                    {p.sinopsis}
                  </button>
                )}

              </div>
            </section>
          )
        })}
      </div>
      {fiesta && <Fiesta p={fiesta} onCerrar={() => setFiesta(null)} />}
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

  return (
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
  )
}

/* ---- ficha con tráiler ---- */
function Ficha({ p, puesta, etiquetaPuesta, etiquetaBoton, ocultarBoton, acciones, onCerrar, onProponer }) {
  const [trailer, setTrailer] = useState(null)
  const [gen, setGen] = useState('')
  const [donde, setDonde] = useState([])
  const [abierta, setAbierta] = useState(false)

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

  return (
    <div className="telon" onClick={onCerrar}>
      <div className="panel" onClick={e => e.stopPropagation()}>
        <button className="cerrar" onClick={onCerrar} aria-label="Cerrar">×</button>
        <div className="pantallita">
          {trailer === null && <div className="cargando">Buscando tráiler…</div>}
          {trailer === '' && (p.fondo || p.cartel) && <img src={p.fondo || p.cartel} alt="" />}
          {trailer && (
            <Trailer clave={trailer} titulo={p.titulo} cartel={p.fondo || p.cartel} />
          )}
        </div>
        <div className="detalle">
          <h3>{p.titulo}</h3>
          <div className="meta">
            {[p.tipo === 'tv' ? 'Serie' : 'Película', p.anio, gen, p.voto && `★ ${p.voto} en TMDB`]
              .filter(Boolean).join(' · ')}
          </div>
          <button className={`resumen${abierta ? ' abierta' : ''}`}
            onClick={() => setAbierta(a => !a)}>
            {p.sinopsis || 'Sin sinopsis disponible en español.'}
          </button>
          {donde.length > 0 && (
            <div className="donde">
              <span>Incluida en</span>
              {donde.map(d => <img key={d.nombre} src={d.logo} alt={d.nombre} title={d.nombre} />)}
            </div>
          )}
          {trailer === '' && <div className="aviso">No hay tráiler disponible para este título.</div>}
          {!ocultarBoton && (
            <button className={`btn${puesta ? ' suave' : ''}`}
              onClick={onProponer} disabled={puesta}>
              {puesta ? (etiquetaPuesta || 'Ya está en tu lista') : (etiquetaBoton || 'Proponer')}
            </button>
          )}
          {acciones}
        </div>
      </div>
    </div>
  )
}

/* ---- reproductor con barra propia ---- */
/* ======================= votar ======================= */
/* Mismo formato que Estrenos: una tarjeta por pantalla, el tráiler sonando
   y las tres opciones abajo. El tráiler ya viene guardado con el título,
   así que aquí no hay que pedirle nada a TMDB. */
function Votar({ cola, nombres, onVotar }) {
  const [activo, setActivo] = useState(0)
  const [abierta, setAbierta] = useState(null)
  const pista = useRef(null)

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
        Cuando la otra persona proponga algo nuevo, aparecerá aquí.
      </div>
    )
  }

  return (
    <div className="pista" ref={pista}>
      {cola.map((p, i) => {
        const clave = p.id
        return (
          <section className={`diapo${abierta === clave ? ' abierta' : ''}`}
            key={clave} data-i={i}>
            <div className="lienzo">
              {(p.fondo || p.cartel) && <img src={p.fondo || p.cartel} alt="" />}
              {i === activo && p.trailer && (
                <Trailer clave={p.trailer} titulo={p.titulo} cartel={p.fondo || p.cartel} />
              )}
            </div>
            <div className="velo" />

            <div className="chip izq">{nombres[p.propuesto_por] || 'Tu pareja'}</div>
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
                  <b>{nombres[p.propuesto_por] || 'Tu pareja'}:</b> {p.nota}
                </div>
              )}
              {p.sinopsis && (
                <button className="sin"
                  onClick={() => setAbierta(a => (a === clave ? null : clave))}>
                  {p.sinopsis}
                </button>
              )}

            </div>
          </section>
        )
      })}
    </div>
  )
}

/* ======================= mis pelis ======================= */
function Mias({ lista, suVoto, onQuitar, guardados, onOlvidar, onComentar, onSalir, codigo }) {
  const [ficha, setFicha] = useState(null)
  const [pestana, setPestana] = useState('propuestas')
  const [editando, setEditando] = useState(null)
  const [texto, setTexto] = useState('')

  const texto_voto = v =>
    v === 'si' ? 'Le gusta'
    : v === 'vista' ? 'Ya la ha visto'
    : v === 'no' ? 'Descartada'
    : 'Sin votar'

  function abrirComentario(p) {
    setEditando(p.id)
    setTexto(p.nota || '')
  }
  async function guardarComentario() {
    await onComentar(editando, texto.trim())
    setEditando(null)
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
                {v === 'si' && <span className="nota">Le gusta</span>}
                {p.nota && <span className="tag">💬</span>}
              </button>
              <div className="rotulo">{p.titulo}<i>{texto_voto(v)}</i></div>
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
    <>
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
      </div>

      {pestana === 'propuestas' && (
        <>
          <div className="ayuda">Lo que has propuesto y qué ha dicho la otra persona.</div>
          {lista.length === 0
            ? <div className="vacio"><b>Lista vacía</b>Ve a Añadir y busca la primera.</div>
            : <>{bloque('Películas', pelis)}{bloque('Series', series)}</>}
        </>
      )}

      {pestana === 'mias' && (
        <>
          <div className="ayuda">Solo para ti. La otra persona no ve esta lista.</div>
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
                    </button>
                    <div className="rotulo">{p.titulo}<i>{p.anio}</i></div>
                    <button className="comentar" onClick={() => onOlvidar(p)}>Quitar</button>
                  </div>
                ))}
              </div>
            )}
        </>
      )}

      <div className="pie">
        Código de pareja: <b>{codigo}</b><br />
        <button onClick={onSalir}>Cerrar sesión</button>
      </div>

      {editando && (
        <div className="telon" onClick={() => setEditando(null)}>
          <div className="panel chico" onClick={e => e.stopPropagation()}>
            <div className="detalle">
              <h3>Tu comentario</h3>
              <div className="ayuda" style={{ marginBottom: 12 }}>
                Lo verá la otra persona al votar esta propuesta.
              </div>
              <textarea value={texto} onChange={e => setTexto(e.target.value)}
                placeholder="Esta es de mis favoritas…" maxLength={200} autoFocus />
              <button className="btn" onClick={guardarComentario}>Guardar</button>
              <button className="btn suave" onClick={() => setEditando(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {ficha && (
        <Ficha p={ficha} puesta ocultarBoton
          onCerrar={() => setFicha(null)}
          onProponer={() => setFicha(null)}
          acciones={
            <div className="rectificar">
              {ficha.id
                ? <button onClick={async () => { await onQuitar(ficha.id); setFicha(null) }}>
                    Retirar mi propuesta
                  </button>
                : <button onClick={() => { onOlvidar(ficha); setFicha(null) }}>
                    Quitar de mi lista
                  </button>}
            </div>
          } />
      )}
    </>
  )
}

/* ======================= coincidencias ======================= */
function Matches({ lista, onRectificar }) {
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
        En cuanto uno vote que sí a una propuesta del otro, aparece aquí.
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
            <div className="rotulo">{p.titulo}<i>{p.quien}</i></div>
          </div>
        ))}
      </div>
    </section>
  )

  return (
    <>
      <h2>Coincidencias</h2>
      <div className="ayuda">Os apetecen a los dos. De aquí sale el plan.</div>

      <div className="pestanas">
        <button className={juego === 'lista' ? 'activo' : ''} onClick={() => setJuego('lista')}>Lista</button>
        <button className={juego === 'ruleta' ? 'activo' : ''} onClick={() => setJuego('ruleta')}>Ruleta</button>
        <button className={juego === 'torneo' ? 'activo' : ''} onClick={() => setJuego('torneo')}>Torneo</button>
      </div>

      {juego === 'lista' && <>{bloque('Películas', pelis)}{bloque('Series', series)}</>}
      {juego === 'ruleta' && <Ruleta lista={lista} onFicha={setFicha} />}
      {juego === 'torneo' && <Torneo lista={lista} onFicha={setFicha} />}

      {ficha && (
        <Ficha p={ficha} puesta ocultarBoton
          onCerrar={() => setFicha(null)}
          onProponer={() => setFicha(null)}
          acciones={
            <div className="rectificar">
              <button onClick={() => marcar('vista')}>Ya la hemos visto</button>
              <button onClick={() => marcar('no')}>Ya no me apetece</button>
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
  const [ronda, setRonda] = useState([])
  const [pasan, setPasan] = useState([])
  const [i, setI] = useState(0)
  const [campeona, setCampeona] = useState(null)

  const pelis = lista.filter(p => p.tipo !== 'tv').length
  const series = lista.filter(p => p.tipo === 'tv').length
  const grupo = filtrar(lista, filtro)

  // El cuadro solo se rehace cuando cambian de verdad los títulos, no en
  // cada refresco en tiempo real: si no, el torneo se reiniciaba solo.
  const clave = grupo.map(p => p.id).sort().join(',')

  useEffect(() => {
    const mezcla = [...grupo].sort(() => Math.random() - 0.5)
    setRonda(mezcla); setPasan([]); setI(0); setCampeona(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])

  function rejugar() {
    const mezcla = [...grupo].sort(() => Math.random() - 0.5)
    setRonda(mezcla); setPasan([]); setI(0); setCampeona(null)
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

  const cabecera = (
    <Filtro valor={filtro} onCambio={f => setFiltro(f)} pelis={pelis} series={series} />
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
