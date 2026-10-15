import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

/**
 * Si algo falla al pintar, React desmonta la app entera y solo quedaba el
 * fondo lila, sin nada que tocar. Esto enseña qué ha fallado y deja
 * recargar (y volver a Inicio, por si el fallo era de la pestaña guardada).
 */
class SiFalla extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error(error, info.componentStack) }
  render() {
    if (!this.state.error) return this.props.children
    const recargar = volverAInicio => {
      try { if (volverAInicio) localStorage.setItem('sd:vista', 'buscar') } catch { /* privada */ }
      window.location.reload()
    }
    return (
      <div className="app">
        <div className="vacio">
          <b>Algo ha fallado</b>
          <span style={{ display: 'block', margin: '8px 0 14px', wordBreak: 'break-word' }}>
            {String(this.state.error?.message || this.state.error)}
          </span>
          <button className="btn" onClick={() => recargar(false)}>Recargar</button>
          <button className="btn suave" onClick={() => recargar(true)}>Volver a Inicio</button>
        </div>
      </div>
    )
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SiFalla>
      <App />
    </SiFalla>
  </StrictMode>
)
