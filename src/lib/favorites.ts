// Favorites: a personal short list. Signed in, they are saved to the account
// and follow the person across devices. Signed out, they stay in this browser.

import { supabase } from './supabase'

const KEY = 'plico-favorites-v1'

function readLocal(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}
function writeLocal(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids))
  } catch {
    /* storage unavailable: favorites just won't persist while signed out */
  }
}

export async function loadFavorites(userId: string | null): Promise<Set<string>> {
  const local = readLocal()
  if (!userId) return new Set(local)

  // Favorites picked before signing in move into the account. Failures (a
  // duplicate, a recipe since deleted) are fine to ignore.
  if (local.length) {
    await Promise.all(local.map((recipe_id) => supabase.from('favorites').insert({ recipe_id })))
    writeLocal([])
  }
  const { data, error } = await supabase.from('favorites').select('recipe_id')
  if (error) return new Set()
  return new Set(((data ?? []) as { recipe_id: string }[]).map((r) => r.recipe_id))
}

export async function setFavorite(userId: string | null, recipeId: string, on: boolean): Promise<void> {
  if (!userId) {
    const rest = readLocal().filter((id) => id !== recipeId)
    writeLocal(on ? [...rest, recipeId] : rest)
    return
  }
  const { error } = on
    ? await supabase.from('favorites').insert({ recipe_id: recipeId })
    : await supabase.from('favorites').delete().eq('user_id', userId).eq('recipe_id', recipeId)
  if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message)
}
