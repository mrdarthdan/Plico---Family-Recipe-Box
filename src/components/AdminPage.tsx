import { useEffect, useState, type FormEvent } from 'react'
import {
  addSection, deleteSection, listMembers, saveSettings, setRole, updateSection,
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
  const nextSort = sections.reduce((max, s) => Math.max(max, s.sort), 0) + 10

  return (
    <section className="admin-block">
      <h2>Sections</h2>
      <p className="hint">Lower order numbers come first. A section can only be deleted when it is empty.</p>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Order</th>
            <th>Recipes</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sections.map((s) => (
            <SectionRow key={s.id} section={s} count={recipes.filter((r) => r.section_id === s.id).length} run={run} />
          ))}
        </tbody>
      </table>
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

function SectionRow({
  section: s, count, run,
}: {
  section: Section
  count: number
  run: Run
}) {
  const [name, setName] = useState(s.name)
  const [sort, setSort] = useState(String(s.sort))
  const dirty = name.trim() !== s.name || +sort !== s.sort

  return (
    <tr>
      <td>
        <input aria-label="Section name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      <td>
        <input aria-label="Order" className="narrow" type="number" value={sort} onChange={(e) => setSort(e.target.value)} />
      </td>
      <td>{count}</td>
      <td className="row-actions">
        <button
          className="btn ghost"
          disabled={!dirty || !name.trim()}
          onClick={() => run(() => updateSection(s.id, name.trim(), Math.round(+sort) || 0))}
        >
          Save
        </button>
        <button className="btn danger" disabled={count > 0} onClick={() => run(() => deleteSection(s.id))}>
          Delete
        </button>
      </td>
    </tr>
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
  const download = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      settings: data.settings,
      sections: data.sections,
      recipes: data.recipes,
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'plico-export-' + payload.exported_at.slice(0, 10) + '.json'
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <section className="admin-block">
      <h2>Export</h2>
      <p className="hint">Downloads every recipe, section and setting as one JSON file. Keep it as a backup.</p>
      <div className="actions">
        <button className="btn ghost" onClick={download}>
          Download {data.recipes.length} recipes
        </button>
      </div>
    </section>
  )
}
