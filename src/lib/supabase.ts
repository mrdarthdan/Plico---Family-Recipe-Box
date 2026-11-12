import { createClient } from '@supabase/supabase-js'

// Every table and function this app uses lives in the `cookbook` schema.
function makeClient(url: string, key: string) {
  return createClient(url, key, { db: { schema: 'cookbook' } })
}

/** Set by initSupabase(), which main.tsx awaits before anything renders. */
export let supabase: ReturnType<typeof makeClient>

/** False until a project URL and publishable key have been supplied. */
export let configured = false

/**
 * Finds the Supabase connection details and creates the client.
 *
 * 1. `config.json` beside index.html, read when the page loads. This is how a
 *    deployed site is configured: edit the file, no rebuild needed.
 * 2. Otherwise the VITE_SUPABASE_* variables from `.env`, for development.
 */
export async function initSupabase(): Promise<void> {
  let url = import.meta.env.VITE_SUPABASE_URL
  let key = import.meta.env.VITE_SUPABASE_KEY
  try {
    const res = await fetch('./config.json', { cache: 'no-store' })
    if (res.ok) {
      const c = (await res.json()) as { supabaseUrl?: string; supabaseKey?: string }
      if (c.supabaseUrl && c.supabaseKey) {
        url = c.supabaseUrl
        key = c.supabaseKey
      }
    }
  } catch {
    /* no config.json, or not valid JSON: fall back to .env */
  }
  if (url && key) {
    supabase = makeClient(url, key)
    configured = true
  }
}
