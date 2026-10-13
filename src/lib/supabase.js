import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON

if (!url || !key) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON en .env.local. ' +
    'Revisa el archivo y reinicia npm run dev.'
  )
}

/**
 * En iPhone, al volver la app de segundo plano, iOS ya ha cerrado la
 * conexión por debajo y la primera petición falla con "Load failed" sin
 * llegar a la base de datos: Para mí, Vista o una nota no se guardaban y
 * salía el error. Si falla así (error de red, no una respuesta de la base
 * de datos), se reintenta un par de veces con una conexión nueva.
 *
 * Solo lo que se puede repetir sin duplicar nada: leer, borrar, cambiar y
 * los upsert. Un insert normal no, por si el primero sí llegó y solo se
 * perdió la respuesta.
 */
const ESPERAS = [300, 1000]

function repetible(input, init = {}) {
  const dir = typeof input === 'string' ? input : input.url
  if (!dir.includes('/rest/v1/')) return false
  const metodo = (init.method || (typeof input === 'string' ? 'GET' : input.method) || 'GET').toUpperCase()
  if (metodo !== 'POST') return true
  const prefer = new Headers(init.headers || {}).get('Prefer') || ''
  return prefer.includes('resolution=merge-duplicates')
}

async function fetchConReintento(input, init) {
  for (let i = 0; ; i++) {
    try {
      return await fetch(input, init)
    } catch (e) {
      const deRed = e instanceof TypeError && !(init && init.signal && init.signal.aborted)
      if (!deRed || i >= ESPERAS.length || !repetible(input, init)) throw e
      await new Promise(r => setTimeout(r, ESPERAS[i]))
    }
  }
}

export const supabase = createClient(url, key, { global: { fetch: fetchConReintento } })
