import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON

if (!url || !key) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON en .env.local. ' +
    'Revisa el archivo y reinicia npm run dev.'
  )
}

export const supabase = createClient(url, key)
