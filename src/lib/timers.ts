// Step timers live outside React so they keep running while you move
// between the recipe page and cook mode.

import { useEffect, useState } from 'react'

const ends = new Map<string, number>()
const listeners = new Set<() => void>()

export function timerKey(recipeId: string, step: number) {
  return recipeId + ':' + step
}

/** Starts the timer, or stops/resets it if it is already running. */
export function toggleTimer(key: string, seconds: number) {
  if (ends.has(key)) ends.delete(key)
  else ends.set(key, Date.now() + seconds * 1000)
  listeners.forEach((l) => l())
}

/** Seconds left, or null if the timer is not running. */
export function timerLeft(key: string): number | null {
  const end = ends.get(key)
  return end == null ? null : Math.max(0, Math.round((end - Date.now()) / 1000))
}

/** Re-renders the calling component every second and whenever a timer changes. */
export function useTimerTick() {
  const [, setN] = useState(0)
  useEffect(() => {
    const bump = () => setN((n) => n + 1)
    listeners.add(bump)
    const iv = setInterval(bump, 1000)
    return () => {
      listeners.delete(bump)
      clearInterval(iv)
    }
  }, [])
}
