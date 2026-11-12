import type { CookbookData, Recipe } from '../lib/types'
import { go } from '../lib/useHash'

interface Props {
  data: CookbookData
  canEdit: boolean
  signedIn: boolean
  flash: string | null
  query: string
  setQuery: (q: string) => void
  sectionFilter: number | null
  setSectionFilter: (id: number | null) => void
}

export function IndexPage(p: Props) {
  const { settings, sections, recipes, fromCache } = p.data
  const q = p.query.trim().toLowerCase()

  const matches = (r: Recipe) =>
    (p.sectionFilter == null || r.section_id === p.sectionFilter) &&
    (!q ||
      [r.title, r.description ?? '', ...r.tags, ...r.ingredients.flatMap((g) => g.items.map((i) => i.item))]
        .join(' ')
        .toLowerCase()
        .includes(q))

  const visible = sections
    .map((s) => ({ section: s, list: recipes.filter((r) => r.section_id === s.id && matches(r)) }))
    .filter((x) => x.list.length > 0)

  const locked = !settings.public_read && !p.signedIn && recipes.length === 0

  return (
    <>
      <header className="masthead">
        <div>
          <h1>{settings.site_name}</h1>
          <p>
            {settings.tagline ? settings.tagline + ' · ' : ''}
            {recipes.length} recipe{recipes.length === 1 ? '' : 's'}
          </p>
        </div>
        {p.canEdit && (
          <button className="btn" onClick={() => go('new')}>
            + Add recipe
          </button>
        )}
      </header>

      {p.flash && <p className="msg ok">{p.flash}</p>}
      {fromCache && (
        <p className="msg err">
          Showing a saved copy of the recipes because the recipe database didn't respond. Adding and editing
          are unavailable until it's back.
        </p>
      )}

      {locked ? (
        <p className="empty">
          This cookbook is private.{' '}
          <button className="link" onClick={() => go('account')}>
            Sign in
          </button>{' '}
          to see the recipes.
        </p>
      ) : (
        <>
          <div className="tools">
            <input
              className="search"
              type="search"
              placeholder="Search by dish, ingredient or tag"
              aria-label="Search recipes"
              value={p.query}
              onChange={(e) => p.setQuery(e.target.value)}
            />
            <div className="chips">
              <button className="chip" aria-pressed={p.sectionFilter == null} onClick={() => p.setSectionFilter(null)}>
                All
              </button>
              {sections.map((s) => (
                <button
                  key={s.id}
                  className="chip"
                  aria-pressed={p.sectionFilter === s.id}
                  onClick={() => p.setSectionFilter(s.id)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {visible.map(({ section, list }) => (
            <div key={section.id}>
              <div className="section-label">{section.name}</div>
              <div className="grid">
                {list.map((r) => (
                  <button key={r.id} className="card" onClick={() => go(r.id)}>
                    <h3>{r.title}</h3>
                    <p>{r.description}</p>
                    <div className="meta">
                      {r.time && <span>{r.time}</span>}
                      {r.serves ? <span>Serves {r.serves}</span> : null}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {visible.length === 0 && (
            <p className="empty">
              {recipes.length === 0
                ? 'No recipes yet.'
                : q
                  ? `No recipes match “${p.query}”. Try an ingredient.`
                  : 'No recipes in this section yet.'}
            </p>
          )}
        </>
      )}
    </>
  )
}
