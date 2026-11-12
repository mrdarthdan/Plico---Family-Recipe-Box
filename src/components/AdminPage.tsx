import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react'
import {
  addSection, deleteSection, listMembers, renameSection, reorderSections, saveSettings, setRole,
} from '../lib/api'
import type { RecipeBoxData, Member, Role, Section } from '../lib/types'
import { go } from '../lib/useHash'

interface Props {
  data: RecipeBoxData
  isAdmin: boolean
  myId: string | null
  reload: () => Promise<void>
}

/** Runs a change; resolves to whether it succeeded. */
type Run = (change: () => Promise<void>) => Promise<boolean>

/** Members and roles, sections, site settings, and a JSON export. */
export function AdminPage({ data, isAdmin, myId, reload }: Props) {
  const [error, setError] = useState<string | null>(null)

  if (!isAdmin) {
    return (
      <div className="panel">
        <h1>Admins only</h1>
        <p className="lede">This page is for admins.</p>
        <div className="actions">
          <button className="btn" onClick={() => go('')}>
            Back to recipes
          </button>
        </div>
      </div>
    )
  }

  // Runs a change, shows any error, then refreshes the data.
  const run: Run = async (change) => {
    setError(null)
    try {
      await change()
      await reload()
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }

  return (
    <>
      <button className="back" onClick={() => go('')}>
        ← All recipes
      </button>
      <div className="panel wide">
        <h1>Admin</h1>
        {error && <p className="msg err">{error}</p>}
        <Members myId={myId} onError={setError} />
        <Sections sections={data.sections} recipes={data.recipes} run={run} />
        <SiteSettings data={data} run={run} />
        <Export data={data} />
      </div>
    </>
  )
}

function Members({ myId, onError }: { myId: string | null; onError: (m: string | null) => void }) {
  const [members, setMembers] = useState<Member[] | null>(null)

  const load = () =>
    listMembers()
      .then(setMembers)
      .catch((e: Error) => onError(e.message))
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section className="admin-block">
      <h2>Members</h2>
      <p className="hint">
        Everyone who has signed in. Viewers can read, editors can add and change recipes, admins can also use
        this page.
      </p>
      {!members ? (
        <p className="hint">Loading…</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id}>
                <td>
                  {m.email}
                  {m.user_id === myId ? ' (you)' : ''}
                </td>
                <td>{m.display_name ?? '—'}</td>
                <td>
                  <select
                    aria-label={'Role for ' + m.email}
                    value={m.role}
                    onChange={async (e) => {
                      onError(null)
                      try {
                        await setRole(m.user_id, e.target.value as Role)
                      } catch (err) {
                        onError((err as Error).message)
                      }
                      await load()
                    }}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function Sections({
  sections, recipes, run,
}: {
  sections: Section[]
  recipes: RecipeBoxData['recipes']
  run: Run
}) {
  const [name, setName] = useState('')
  // The order shown on screen. It follows the saved order except mid-drag.
  const [order, setOrder] = useState(sections)
  const [dragging, setDragging] = useState<number | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const orderRef = useRef(order)
  orderRef.current = order

  useEffect(() => {
    setOrder(sections)
  }, [sections])

  const nextSort = sections.reduce((max, s) => Math.max(max, s.sort), 0) + 10

  const save = (next: Section[]) => {
    const ids = next.map((s) => s.id)
    if (ids.join() === sections.map((s) => s.id).join()) return
    void run(() => reorderSections(ids, sections)).then((ok) => {
      if (!ok) setOrder(sections)
    })
  }

  /** Moves the dragged row to wherever the pointer now is. */
  const dragTo = (id: number, clientY: number) => {
    const rows = Array.from(listRef.current?.children ?? [])
    const cur = orderRef.current
    const from = cur.findIndex((s) => s.id === id)
    let to = from
    rows.forEach((el, i) => {
      const box = el.getBoundingClientRect()
      const middle = box.top + box.height / 2
      if (i < from && clientY < middle) to = Math.min(to, i)
      if (i > from && clientY > middle) to = Math.max(to, i)
    })
    if (to !== from) setOrder(moved(cur, from, to))
  }

  /** Arrow keys on the handle move a section one place and save. */
  const nudge = (id: number, by: number) => {
    const from = order.findIndex((s) => s.id === id)
    const to = from + by
    if (to < 0 || to >= order.length) return
    const next = moved(order, from, to)
    setOrder(next)
    save(next)
  }

  return (
    <section className="admin-block">
      <h2>Sections</h2>
      <p className="hint">
        Drag a section by its handle to change the order, or focus the handle and use the arrow keys. A section
        can only be deleted when it is empty.
      </p>
      <ul className="sec-list" ref={listRef}>
        {order.map((s) => (
          <SectionRow
            key={s.id}
            section={s}
            count={recipes.filter((r) => r.section_id === s.id).length}
            dragging={dragging === s.id}
            run={run}
            onDragStart={() => setDragging(s.id)}
            onDragMove={(y) => dragTo(s.id, y)}
            onDragEnd={() => {
              setDragging(null)
              save(orderRef.current)
            }}
            onNudge={(by) => nudge(s.id, by)}
          />
        ))}
      </ul>
      <form
        className="inline-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          const n = name.trim()
          if (!n) return
          void run(() => addSection(n, nextSort)).then((ok) => {
            if (ok) setName('')
          })
        }}
      >
        <input aria-label="New section name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="New section name" />
        <button className="btn" type="submit">
          Add section
        </button>
      </form>
    </section>
  )
}

function moved<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice()
  next.splice(to, 0, next.splice(from, 1)[0])
  return next
}

function SectionRow({
  section: s, count, dragging, run, onDragStart, onDragMove, onDragEnd, onNudge,
}: {
  section: Section
  count: number
  dragging: boolean
  run: Run
  onDragStart: () => void
  onDragMove: (clientY: number) => void
  onDragEnd: () => void
  onNudge: (by: number) => void
}) {
  const [name, setName] = useState(s.name)
  const dirty = name.trim() !== s.name

  return (
    <li className={'sec-row' + (dragging ? ' dragging' : '')}>
      <button
        type="button"
        className="handle"
        aria-label={`Reorder ${s.name}. Use the up and down arrow keys.`}
        title="Drag to reorder"
        onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          onDragStart()
        }}
        onPointerMove={(e: PointerEvent<HTMLButtonElement>) => {
          if (dragging) onDragMove(e.clientY)
        }}
        onPointerUp={() => dragging && onDragEnd()}
        onPointerCancel={() => dragging && onDragEnd()}
        onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            onNudge(e.key === 'ArrowUp' ? -1 : 1)
          }
        }}
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <input aria-label="Section name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      <span className="sec-count">
        {count} recipe{count === 1 ? '' : 's'}
      </span>
      <span className="row-actions">
        <button
          className="btn ghost"
          disabled={!dirty || !name.trim()}
          onClick={() => run(() => renameSection(s.id, name.trim()))}
        >
          Rename
        </button>
        <button className="btn danger" disabled={count > 0} onClick={() => run(() => deleteSection(s.id))}>
          Delete
        </button>
      </span>
    </li>
  )
}

function SiteSettings({ data, run }: { data: RecipeBoxData; run: Run }) {
  const [siteName, setSiteName] = useState(data.settings.site_name)
  const [tagline, setTagline] = useState(data.settings.tagline ?? '')
  const [publicRead, setPublicRead] = useState(data.settings.public_read)
  const [saved, setSaved] = useState(false)

  return (
    <section className="admin-block">
      <h2>Site settings</h2>
      <form
        className="stack"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (!siteName.trim()) return
          setSaved(false)
          void run(() =>
            saveSettings({ site_name: siteName.trim(), tagline: tagline.trim() || null, public_read: publicRead }),
          ).then((ok) => setSaved(ok))
        }}
      >
        <div className="field">
          <label htmlFor="s-name">Recipe box name</label>
          <input id="s-name" maxLength={80} value={siteName} onChange={(e) => setSiteName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="s-tag">Tagline (optional)</label>
          <input id="s-tag" maxLength={200} value={tagline} onChange={(e) => setTagline(e.target.value)} />
        </div>
        <label className="check">
          <input type="checkbox" checked={publicRead} onChange={(e) => setPublicRead(e.target.checked)} />
          <span>Anyone can read the recipes without signing in</span>
        </label>
        <div className="actions">
          <button className="btn" type="submit">
            Save settings
          </button>
          {saved && <span className="hint">Saved.</span>}
        </div>
      </form>
    </section>
  )
}

function Export({ data }: { data: RecipeBoxData }) {
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stamp = new Date().toISOString().slice(0, 10)
  const count = data.recipes.length

  const downloadJson = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      settings: data.settings,
      sections: data.sections,
      recipes: data.recipes,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    void import('../lib/exportPdf').then((m) => m.saveBlob(blob, `plico-export-${stamp}.json`))
  }

  const downloadPdfs = async () => {
    setError(null)
    setProgress('Preparing…')
    try {
      // Loaded on demand: the PDF and zip code is large and rarely needed.
      const { buildPdfZip, fileName, pageSizeForLocale, saveBlob } = await import('../lib/exportPdf')
      const zip = await buildPdfZip(data, pageSizeForLocale(), (done, total) =>
        setProgress(`Making PDFs: ${done} of ${total}`),
      )
      saveBlob(zip, `${fileName(data.settings.site_name)} - PDFs ${stamp}.zip`)
    } catch (e) {
      setError("Couldn't make the PDFs: " + (e as Error).message)
    }
    setProgress(null)
  }

  return (
    <section className="admin-block">
      <h2>Export</h2>
      <p className="hint">
        The PDF download is a zip holding one printable book of every recipe, plus a separate PDF for each
        recipe in a folder per section. The JSON file is a complete backup of recipes, sections and settings.
      </p>
      {error && <p className="msg err">{error}</p>}
      <div className="actions">
        <button className="btn" disabled={progress != null || count === 0} onClick={downloadPdfs}>
          {progress ?? `Download ${count} recipes as PDFs (zip)`}
        </button>
        <button className="btn ghost" onClick={downloadJson}>
          Download backup (JSON)
        </button>
      </div>
    </section>
  )
}
