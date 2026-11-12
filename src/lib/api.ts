// Every database call the app makes. Access rules are enforced by the
// database (see docs/supabase.md); nothing here is a security boundary.

import { supabase } from './supabase'
import type { RecipeBoxData, Member, Profile, Recipe, RecipeInput, Role, Section, Settings } from './types'

const CACHE_KEY = 'plico-cache-v1'

function readCache(): Omit<RecipeBoxData, 'fromCache'> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
function writeCache(data: Omit<RecipeBoxData, 'fromCache'>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {
    /* storage full or unavailable: the cache is only a convenience */
  }
}
/** The recipe box name from the last visit, to show while loading. */
export function cachedSiteName(): string | null {
  return readCache()?.settings.site_name ?? null
}
export function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Loads settings, sections and recipes. If the database does not respond,
 * falls back to the copy saved in this browser by the last successful load.
 */
export async function loadAll(): Promise<RecipeBoxData> {
  try {
    const [s, sec, rec] = await Promise.all([
      supabase.from('settings').select('site_name, tagline, public_read').eq('id', 1).maybeSingle(),
      supabase.from('sections').select('id, name, sort').order('sort').order('name'),
      supabase.from('recipes').select('*').order('title'),
    ])
    const error = s.error ?? sec.error ?? rec.error
    if (error) throw new Error(error.message)
    const fresh = {
      settings: (s.data as Settings | null) ?? { site_name: 'Recipe Box', tagline: null, public_read: true },
      sections: (sec.data ?? []) as Section[],
      recipes: (rec.data ?? []) as Recipe[],
    }
    writeCache(fresh)
    return { ...fresh, fromCache: false }
  } catch (e) {
    const cached = readCache()
    if (cached) return { ...cached, fromCache: true }
    throw e
  }
}

/** Creates the signed-in user's profile on first use and returns it. */
export async function ensureProfile(): Promise<Profile | null> {
  const { data, error } = await supabase.rpc('ensure_profile')
  if (error) return null
  return data as Profile
}

export async function setDisplayName(name: string) {
  const { error } = await supabase.rpc('set_display_name', { p_name: name })
  if (error) throw new Error(error.message)
}

export async function insertRecipe(id: string, added: string, input: RecipeInput) {
  const { error } = await supabase.from('recipes').insert({ id, added, ...input })
  if (error) throw new Error(friendly(error.message))
}
export async function updateRecipe(id: string, input: RecipeInput) {
  const { error } = await supabase.from('recipes').update(input).eq('id', id)
  if (error) throw new Error(friendly(error.message))
}
export async function deleteRecipe(id: string) {
  const { error } = await supabase.from('recipes').delete().eq('id', id)
  if (error) throw new Error(friendly(error.message))
}

// ---- admin ----

export async function listMembers(): Promise<Member[]> {
  const { data, error } = await supabase.rpc('list_members')
  if (error) throw new Error(error.message)
  return (data ?? []) as Member[]
}
export async function setRole(userId: string, role: Role) {
  const { error } = await supabase.rpc('set_role', { p_user: userId, p_role: role })
  if (error) throw new Error(error.message)
}
export async function saveSettings(settings: Settings) {
  const { error } = await supabase.from('settings').update(settings).eq('id', 1)
  if (error) throw new Error(friendly(error.message))
}
export async function addSection(name: string, sort: number) {
  const { error } = await supabase.from('sections').insert({ name, sort })
  if (error) throw new Error(friendly(error.message))
}
export async function renameSection(id: number, name: string) {
  const { error } = await supabase.from('sections').update({ name }).eq('id', id)
  if (error) throw new Error(friendly(error.message))
}
/** Saves a new order. `ids` lists every section id, first to last. */
export async function reorderSections(ids: number[], current: Section[]) {
  const changes = ids
    .map((id, i) => ({ id, sort: (i + 1) * 10 }))
    .filter((c) => current.find((s) => s.id === c.id)?.sort !== c.sort)
  const results = await Promise.all(
    changes.map((c) => supabase.from('sections').update({ sort: c.sort }).eq('id', c.id)),
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) throw new Error(friendly(failed.error.message))
}
export async function deleteSection(id: number) {
  const { error } = await supabase.from('sections').delete().eq('id', id)
  if (error) throw new Error(friendly(error.message))
}

function friendly(message: string): string {
  if (/row-level security|permission denied/i.test(message)) return "This account isn't allowed to make that change."
  if (/foreign key/i.test(message)) return 'That section still has recipes in it. Move or delete them first.'
  if (/duplicate key|unique/i.test(message)) return 'That name is already used.'
  return message
}
