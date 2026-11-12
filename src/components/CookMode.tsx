import { useEffect, useState } from 'react'
import type { Recipe } from '../lib/types'
import { TimerButton } from './RecipePage'

/** Full-screen, one step at a time, with the screen kept awake where supported. */
export function CookMode({ recipe: r, onClose }: { recipe: Recipe; onClose: () => void }) {
  const [i, setI] = useState(0)
  const n = r.steps.length
  const s = r.steps[i]

  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    navigator.wakeLock
      ?.request('screen')
      .then((l) => {
        if (cancelled) void l.release()
        else lock = l
      })
      .catch(() => {})
    return () => {
      cancelled = true
      void lock?.release().catch(() => {})
    }
  }, [])

  if (!s) return null

  return (
    <div className="cook">
      <div className="cook-top">
        <span className="r-time">{r.title}</span>
        <button className="btn ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="progress">
        <div style={{ width: ((i + 1) / n) * 100 + '%' }} />
      </div>
      <div className="cook-main">
        <span className="num">
          Step {i + 1} of {n}
        </span>
        <h2>{s.title}</h2>
        <p>{s.text}</p>
        {s.seconds > 0 && (
          <div>
            <TimerButton recipeId={r.id} step={i} seconds={s.seconds} />
          </div>
        )}
      </div>
      <div className="cook-nav">
        <button className="btn ghost" disabled={i === 0} onClick={() => setI(i - 1)}>
          Back
        </button>
        <button className="btn" onClick={() => (i < n - 1 ? setI(i + 1) : onClose())}>
          {i === n - 1 ? 'Finish' : 'Next step'}
        </button>
      </div>
    </div>
  )
}
