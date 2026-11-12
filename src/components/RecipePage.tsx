import { useState } from 'react'
import { deleteRecipe } from '../lib/api'
import { fmtQty, mmss, timeLabel } from '../lib/format'
import { timerKey, timerLeft, toggleTimer, useTimerTick } from '../lib/timers'
import type { Recipe } from '../lib/types'
import { go } from '../lib/useHash'
import { CookMode } from './CookMode'

// Remembered while the page stays open, so leaving a recipe and coming back
// keeps your serving count and ticked-off ingredients.
const remembered: { servings: Record<string, number>; checked: Record<string, Record<string, boolean>> } = {
  servings: {},
  checked: {},
}

interface Props {
  recipe: Recipe
  sectionName: string
  canEdit: boolean
  onDeleted: () => Promise<void>
}

export function RecipePage({ recipe: r, sectionName, canEdit, onDeleted }: Props) {
  const [servings, setServingsState] = useState(remembered.servings[r.id] ?? r.serves ?? 1)
  const [checked, setChecked] = useState<Record<string, boolean>>(remembered.checked[r.id] ?? {})
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooking, setCooking] = useState(false)

  const factor = r.serves ? servings / r.serves : 1
  const setServings = (n: number) => {
    remembered.servings[r.id] = n
    setServingsState(n)
  }
  const toggle = (k: string, on: boolean) => {
    const next = { ...checked, [k]: on }
    remembered.checked[r.id] = next
    setChecked(next)
  }

  return (
    <>
      <button className="back" onClick={() => go('')}>
        ← All recipes
      </button>
      {error && <p className="msg err">{error}</p>}

      <header className="r-head">
        <span className="eyebrow">{sectionName}</span>
        <h1>{r.title}</h1>
        {r.description && <p>{r.description}</p>}
        {r.contributor && <p className="byline">{r.contributor}</p>}
        {r.tags.length > 0 && (
          <div className="tags">
            {r.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="r-bar">
        {r.serves ? (
          <div className="stepper" role="group" aria-label="Servings">
            <button aria-label="Fewer servings" onClick={() => setServings(Math.max(1, servings - 1))}>
              −
            </button>
            <span>
              {servings} serving{servings > 1 ? 's' : ''}
            </span>
            <button aria-label="More servings" onClick={() => setServings(servings + 1)}>
              +
            </button>
          </div>
        ) : null}
        {r.steps.length > 0 && (
          <button className="btn" onClick={() => setCooking(true)}>
            Start cooking
          </button>
        )}
        {r.time && <span className="r-time">{r.time}</span>}
        {canEdit && (
          <span className="r-edit">
            <button className="btn ghost" onClick={() => go('edit-' + r.id)}>
              Edit
            </button>
            <button className="btn danger" onClick={() => setConfirming(true)}>
              Delete
            </button>
          </span>
        )}
      </div>

      {canEdit && confirming && (
        <div className="confirm">
          <span>Delete “{r.title}” for everyone? This can't be undone.</span>
          <button
            className="btn danger solid"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true)
              try {
                await deleteRecipe(r.id)
                await onDeleted()
              } catch (e) {
                setError("Couldn't delete: " + (e as Error).message)
                setDeleting(false)
                setConfirming(false)
              }
            }}
          >
            Delete
          </button>
          <button className="btn ghost" onClick={() => setConfirming(false)}>
            Keep it
          </button>
        </div>
      )}

      <div className="r-body">
        <section>
          <h2>Ingredients</h2>
          {r.ingredients.map((g, gi) => (
            <div key={gi}>
              {g.name && <div className="group-name">{g.name}</div>}
              <ul className="ing">
                {g.items.map((it, ii) => {
                  const k = gi + '-' + ii
                  return (
                    <li key={k}>
                      <label>
                        <input type="checkbox" checked={!!checked[k]} onChange={(e) => toggle(k, e.target.checked)} />
                        <span className="qty">{fmtQty(it.qty, it.unit, factor)}</span>
                        <span>{it.item}</span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </section>

        <section>
          <h2>Steps</h2>
          <ol className="steps">
            {r.steps.map((s, i) => (
              <li key={i}>
                <div>
                  <div className="st">{s.title}</div>
                  <p>{s.text}</p>
                  {s.seconds > 0 && <TimerButton recipeId={r.id} step={i} seconds={s.seconds} />}
                </div>
              </li>
            ))}
          </ol>

          {r.notes.length > 0 && (
            <div className="notes">
              <h2>Notes</h2>
              <ul>
                {r.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          {r.source_url && (
            <p className="source">
              Source:{' '}
              <a href={r.source_url} target="_blank" rel="noopener noreferrer">
                {hostOf(r.source_url)}
              </a>
            </p>
          )}
        </section>
      </div>

      {cooking && <CookMode recipe={r} onClose={() => setCooking(false)} />}
    </>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function TimerButton({ recipeId, step, seconds }: { recipeId: string; step: number; seconds: number }) {
  useTimerTick()
  const key = timerKey(recipeId, step)
  const left = timerLeft(key)
  const label =
    left == null ? '⏱ ' + timeLabel(seconds) : left === 0 ? 'Done ✓ tap to reset' : '⏱ ' + mmss(left) + ' · tap to stop'
  return (
    <button className={'timer' + (left === 0 ? ' done' : '')} onClick={() => toggleTimer(key, seconds)}>
      {label}
    </button>
  )
}
