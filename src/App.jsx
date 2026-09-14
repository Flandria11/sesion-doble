import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { buscar, catalogo, CATALOGOS, buscarTrailer, generos } from './lib/tmdb'

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
        <h1>SESIÓN DOBLE</h1>
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
  const [vista, setVista] = useState('buscar')
  const [titulos, setTitulos] = useState([])
  const [votos, setVotos] = useState([])
  const [nombres, setNombres] = useState({})
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    const [t, v, p] = await Promise.all([
      supabase.from('titulos').select('*').eq('pareja_id', pareja.id).order('creado'),
      supabase.from('votos').select('*'),
      supabase.from('perfiles').select('id, nombre')
    ])
    setTitulos(t.data || [])
    setVotos(v.data || [])
    setNombres(Object.fromEntries((p.data || []).map(x => [x.id, x.nombre || 'Tu pareja'])))
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

  async function quitar(id) {
    setTitulos(t => t.filter(x => x.id !== id))
    await supabase.from('titulos').delete().eq('id', id)
  }

  const pestanas = [
    ['buscar', 'Añadir', 0],
    ['votar', 'Votar', cola.length],
    ['mias', 'Mis pelis', 0],
    ['match', 'Coinciden', matches.length]
  ]

  return (
    <div className="app">
      <header>
        <div className="bombillas"><i /><i /><i /><i /><i /><i /><i /></div>
        <h1>SESIÓN DOBLE</h1>
        <div className="sub">Código {pareja.codigo}</div>
      </header>
      <main>
        {cargando ? <div className="cargando">Cargando…</div> : (
          <>
            {vista === 'buscar' && <Anadir yaPuesto={mios} onAdd={anadir} />}
            {vista === 'votar' && <Votar cola={cola} nombres={nombres} onVotar={votar} />}
            {vista === 'mias' && <Mias lista={mios} suVoto={suVoto} onQuitar={quitar} onSalir={() => supabase.auth.signOut()} codigo={pareja.codigo} />}
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
function Anadir({ yaPuesto, onAdd }) {
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('tendencias')
  const [pagina, setPagina] = useState(1)
  const [res, setRes] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [anadiendo, setAnadiendo] = useState(null)
  const [ficha, setFicha] = useState(null)

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

  useEffect(() => {
    if (q.trim().length >= 2) return
    let vivo = true
    setCargando(true)
    catalogo(filtro, pagina)
      .then(r => {
        if (!vivo) return
        setRes(ant => (pagina === 1 ? r : [...ant, ...r]))
        setError('')
      })
      .catch(() => vivo && setError('No se ha podido consultar TMDB.'))
      .finally(() => vivo && setCargando(false))
    return () => { vivo = false }
  }, [filtro, pagina, q])

  const puesto = p => yaPuesto.some(x => x.tmdb_id === p.tmdb_id && x.tipo === p.tipo)

  async function proponer(p) {
    if (puesto(p) || anadiendo) return
    setAnadiendo(p.tmdb_id)
    const ok = await onAdd(p)
    setAnadiendo(null)
    if (ok) {
      setFlash(`${p.titulo} está en tu lista`)
      setTimeout(() => setFlash(''), 2600)
    }
  }

  function cambiarFiltro(id) {
    setFiltro(id); setPagina(1); setRes([])
  }

  const explorando = q.trim().length < 2

  return (
    <>
      {flash && <div className="ok">{flash}</div>}
      <h2>Añadir</h2>
      <div className="ayuda">Toca una carátula para ver el tráiler, o el + para proponerla directamente.</div>

      <input type="text" placeholder="Buscar una peli o serie…"
        value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />

      {explorando && (
        <div className="filtros">
          {CATALOGOS.map(c => (
            <button key={c.id} className={filtro === c.id ? 'activo' : ''}
              onClick={() => cambiarFiltro(c.id)}>{c.nombre}</button>
          ))}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="catalogo">
        {res.map(p => (
          <div className="tarjeta" key={`${p.tipo}-${p.tmdb_id}`}>
            <button className={`lamina${puesto(p) ? ' puesta' : ''}`}
              onClick={() => setFicha(p)}
              aria-label={`Ver información de ${p.titulo}`}>
              <img src={p.cartel} alt="" loading="lazy" />
              <span className="tag">{p.tipo === 'tv' ? 'Serie' : 'Peli'}</span>
              {p.voto && <span className="nota">★ {p.voto}</span>}
              {puesto(p) && <span className="check">✓</span>}
            </button>
            <button className={`mas${puesto(p) ? ' ya' : ''}`}
              onClick={() => proponer(p)}
              disabled={puesto(p) || anadiendo === p.tmdb_id}
              aria-label={puesto(p) ? 'Ya está en tu lista' : `Proponer ${p.titulo}`}>
              {puesto(p) ? '✓' : anadiendo === p.tmdb_id ? '·' : '+'}
            </button>
            <div className="rotulo">
              {p.titulo}
              <i>{[p.anio, p.tipo === 'tv' ? 'Serie' : 'Película'].filter(Boolean).join(' · ')}</i>
            </div>
          </div>
        ))}
      </div>

      {cargando && <div className="cargando">Cargando…</div>}

      {!cargando && explorando && res.length > 0 && (
        <button className="btn suave" onClick={() => setPagina(n => n + 1)}>Ver más</button>
      )}

      {!cargando && !explorando && res.length === 0 && (
        <div className="vacio"><b>Sin resultados</b>Prueba con otro título.</div>
      )}

      {ficha && (
        <Ficha p={ficha} puesta={puesto(ficha)}
          onCerrar={() => setFicha(null)}
          onProponer={async () => { await proponer(ficha); setFicha(null) }} />
      )}
    </>
  )
}

/* ---- ficha con tráiler ---- */
function Ficha({ p, puesta, ocultarBoton, acciones, onCerrar, onProponer }) {
  const [trailer, setTrailer] = useState(null)
  const [gen, setGen] = useState('')
  const [sonido, setSonido] = useState(false)

  useEffect(() => {
    let vivo = true
    buscarTrailer(p.tmdb_id, p.tipo).then(t => vivo && setTrailer(t || ''))
    generos(p.tmdb_id, p.tipo).then(g => vivo && setGen(g))
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

  const src = trailer
    ? `https://www.youtube-nocookie.com/embed/${trailer}` +
      `?autoplay=1&mute=${sonido ? 0 : 1}&playsinline=1&modestbranding=1&rel=0&fs=1`
    : ''

  return (
    <div className="telon" onClick={onCerrar}>
      <div className="panel" onClick={e => e.stopPropagation()}>
        <button className="cerrar" onClick={onCerrar} aria-label="Cerrar">×</button>
        <div className="pantallita">
          {trailer === null && <div className="cargando">Buscando tráiler…</div>}
          {trailer === '' && (p.fondo || p.cartel) && <img src={p.fondo || p.cartel} alt="" />}
          {trailer && (
            <iframe key={sonido ? 'con' : 'sin'} src={src}
              title={`Tráiler de ${p.titulo}`}
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen />
          )}
          {trailer && (
            <button className={`altavoz${sonido ? ' activo' : ''}`}
              onClick={() => setSonido(s => !s)}
              aria-label={sonido ? 'Silenciar tráiler' : 'Activar sonido del tráiler'}>
              {sonido ? '🔊' : '🔇'}
            </button>
          )}
        </div>
        <div className="detalle">
          <h3>{p.titulo}</h3>
          <div className="meta">
            {[p.tipo === 'tv' ? 'Serie' : 'Película', p.anio, gen, p.voto && `★ ${p.voto} en TMDB`]
              .filter(Boolean).join(' · ')}
          </div>
          <p>{p.sinopsis || 'Sin sinopsis disponible en español.'}</p>
          {trailer === '' && <div className="aviso">No hay tráiler disponible para este título.</div>}
          {!ocultarBoton && (
            <button className={`btn${puesta ? ' suave' : ''}`}
              onClick={onProponer} disabled={puesta}>
              {puesta ? 'Ya está en tu lista' : 'Proponer'}
            </button>
          )}
          {acciones}
        </div>
      </div>
    </div>
  )
}

/* ======================= votar ======================= */
function Votar({ cola, nombres, onVotar }) {
  if (!cola.length) {
    return (
      <div className="vacio">
        <b>Nada que votar</b>
        Cuando la otra persona añada algo, aparecerá aquí automáticamente.
      </div>
    )
  }
  const p = cola[0]
  return (
    <>
      <div className="baraja">
        {cola[1] && <Carta key={cola[1].id} p={cola[1]} detras nombres={nombres} />}
        <Carta key={p.id} p={p} nombres={nombres} onVotar={onVotar} />
      </div>
      <div className="votos">
        <button className="vNo" onClick={() => onVotar(p.id, 'no')}>No me llama</button>
        <button className="vVista" onClick={() => onVotar(p.id, 'vista')}>Ya vista</button>
        <button className="vSi" onClick={() => onVotar(p.id, 'si')}>Me apetece</button>
      </div>
      <div className="contador">Quedan {cola.length} · desliza la tarjeta o usa los botones</div>
    </>
  )
}

function Carta({ p, detras, nombres, onVotar }) {
  const el = useRef(null)
  const si = useRef(null)
  const no = useRef(null)
  const [video, setVideo] = useState(false)
  const [sonido, setSonido] = useState(false)

  // el tráiler arranca solo, mudo, pasado un segundo sobre la carátula
  useEffect(() => {
    if (detras || !p.trailer) return
    const t = setTimeout(() => setVideo(true), 1000)
    return () => clearTimeout(t)
  }, [p.trailer, detras])

  useEffect(() => {
    const c = el.current
    if (!c || detras || !onVotar) return
    let x0 = null, y0 = 0, dx = 0, activo = false

    const abajo = e => {
      if (e.target.closest('button')) return
      x0 = e.clientX; y0 = e.clientY; activo = false
      c.classList.remove('suave')
    }
    const mover = e => {
      if (x0 === null) return
      const ax = e.clientX - x0, ay = e.clientY - y0
      if (!activo) {
        if (Math.abs(ax) < 8 && Math.abs(ay) < 8) return
        if (Math.abs(ay) > Math.abs(ax)) { x0 = null; return }
        activo = true
        try { c.setPointerCapture(e.pointerId) } catch { /* da igual */ }
      }
      dx = ax
      c.style.transform = `translateX(${dx}px) rotate(${dx / 24}deg)`
      if (si.current) si.current.style.opacity = dx > 0 ? Math.min(dx / 90, 1) : 0
      if (no.current) no.current.style.opacity = dx < 0 ? Math.min(-dx / 90, 1) : 0
    }
    const soltar = () => {
      if (x0 === null) return
      const d = dx; x0 = null; dx = 0
      c.classList.add('suave')
      if (activo && Math.abs(d) > 95) {
        c.style.transform = `translateX(${d > 0 ? 700 : -700}px) rotate(${d / 11}deg)`
        c.style.opacity = '0'
        setTimeout(() => onVotar(p.id, d > 0 ? 'si' : 'no'), 190)
      } else {
        c.style.transform = ''
        if (si.current) si.current.style.opacity = 0
        if (no.current) no.current.style.opacity = 0
      }
      activo = false
    }

    c.addEventListener('pointerdown', abajo)
    c.addEventListener('pointermove', mover)
    c.addEventListener('pointerup', soltar)
    c.addEventListener('pointercancel', soltar)
    return () => {
      c.removeEventListener('pointerdown', abajo)
      c.removeEventListener('pointermove', mover)
      c.removeEventListener('pointerup', soltar)
      c.removeEventListener('pointercancel', soltar)
    }
  }, [p.id, detras, onVotar])

  const src = p.trailer
    ? `https://www.youtube-nocookie.com/embed/${p.trailer}?autoplay=1&mute=${sonido ? 0 : 1}` +
      `&controls=0&loop=1&playlist=${p.trailer}&playsinline=1&modestbranding=1&rel=0`
    : ''

  return (
    <article ref={el} className={`carta${detras ? ' detras' : ''}`}>
      <div className="lienzo">
        {(p.fondo || p.cartel) && <img src={p.fondo || p.cartel} alt="" />}
        {video && src && <iframe src={src} title={p.titulo} allow="autoplay; encrypted-media" />}
      </div>
      <div className="velo" />
      <div className="chip izq">{nombres[p.propuesto_por] || 'Tu pareja'}</div>
      {video && (
        <button className="chip der" onClick={() => setSonido(s => !s)}>
          {sonido ? 'Silenciar' : 'Con sonido'}
        </button>
      )}
      <div ref={si} className="marca mSi">SÍ</div>
      <div ref={no} className="marca mNo">NO</div>
      <div className="cuerpo">
        <div className="tit">{p.titulo}</div>
        <div className="meta">
          {[p.tipo === 'tv' ? 'Serie' : 'Película', p.anio, p.genero].filter(Boolean).join(' · ')}
        </div>
        {p.sinopsis && <div className="sin">{p.sinopsis}</div>}
      </div>
    </article>
  )
}

/* ======================= mis pelis ======================= */
function Mias({ lista, suVoto, onQuitar, onSalir, codigo }) {
  const [ficha, setFicha] = useState(null)

  const texto = v =>
    v === 'si' ? 'Le gusta'
    : v === 'vista' ? 'Ya la ha visto'
    : v === 'no' ? 'Descartada'
    : 'Sin votar'

  async function retirar() {
    await onQuitar(ficha.id)
    setFicha(null)
  }

  return (
    <>
      <h2>Mis propuestas</h2>
      <div className="ayuda">Lo que has propuesto y qué ha dicho la otra persona.</div>
      {lista.length === 0
        ? <div className="vacio"><b>Lista vacía</b>Ve a Añadir y busca la primera.</div>
        : (
          <div className="catalogo">
            {lista.map(p => {
              const v = suVoto(p.id)
              return (
                <div className="tarjeta" key={p.id}>
                  <button className={`lamina${v === 'no' ? ' puesta' : ''}`}
                    onClick={() => setFicha(p)}
                    aria-label={`Ver información de ${p.titulo}`}>
                    <img src={p.cartel} alt="" loading="lazy" />
                    <span className="tag">{p.tipo === 'tv' ? 'Serie' : 'Peli'}</span>
                    {v === 'si' && <span className="nota">Le gusta</span>}
                  </button>
                  <div className="rotulo">{p.titulo}<i>{texto(v)}</i></div>
                </div>
              )
            })}
          </div>
        )}
      <div className="pie">
        Código de pareja: <b>{codigo}</b><br />
        <button onClick={onSalir}>Cerrar sesión</button>
      </div>
      {ficha && (
        <Ficha p={ficha} puesta ocultarBoton
          onCerrar={() => setFicha(null)}
          onProponer={() => setFicha(null)}
          acciones={
            <div className="rectificar">
              <button onClick={retirar}>Retirar mi propuesta</button>
            </div>
          } />
      )}
    </>
  )
}

/* ======================= coincidencias ======================= */
function Matches({ lista, onRectificar }) {
  const [ficha, setFicha] = useState(null)

  if (!lista.length) {
    return (
      <div className="vacio">
        <b>Todavía ninguna</b>
        En cuanto uno vote que sí a una propuesta del otro, aparece aquí.
      </div>
    )
  }

  async function marcar(voto) {
    await onRectificar(ficha, voto)
    setFicha(null)
  }

  return (
    <>
      <h2>Coincidencias</h2>
      <div className="ayuda">Os apetecen a los dos. De aquí sale el plan.</div>
      <div className="catalogo">
        {lista.map(p => (
          <div className="tarjeta" key={p.id}>
            <button className="lamina" onClick={() => setFicha(p)}
              aria-label={`Ver información de ${p.titulo}`}>
              <img src={p.cartel} alt="" loading="lazy" />
              <span className="tag">{p.tipo === 'tv' ? 'Serie' : 'Peli'}</span>
            </button>
            <div className="rotulo">{p.titulo}<i>{p.quien}</i></div>
          </div>
        ))}
      </div>
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
