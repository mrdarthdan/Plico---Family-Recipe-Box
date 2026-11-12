import type { Recipe, RecipeBoxData } from '../lib/types'
import { go } from '../lib/useHash'

/** null = everything, a number = one section, 'favorites' = only favorites. */
export type SectionFilter = number | 'favorites' | null

interface Props {
  data: RecipeBoxData
  canEdit: boolean
  signedIn: boolean
  flash: string | null
  favorites: Set<string>
  query: string
  setQuery: (q: string) => void
  sectionFilter: SectionFilter
  setSectionFilter: (f: SectionFilter) => void
}

export function IndexPage(p: Props) {
  const { settings, sections, recipes, fromCache } = p.data
  const q = p.query.trim().toLowerCase()
  const favorites = recipes.filter((r) => p.favorites.has(r.id))
  // If the last favorite was just removed, fall back to showing everything.
  const filter = p.sectionFilter === 'favorites' && favorites.length === 0 ? null : p.sectionFilter

  const matches = (r: Recipe) =>
    (filter == null || (filter === 'favorites' ? p.favorites.has(r.id) : r.section_id === filter)) &&
    (!q ||
      [r.title, r.description ?? '', ...r.tags, ...r.ingredients.flatMap((g) => g.items.map((i) => i.item))]
        .join(' ')
        .toLowerCase()
        .includes(q))

  const visible = sections
    .map((s) => ({ section: s, list: recipes.filter((r) => r.section_id === s.id && matches(r)) }))
    .filter((x) => x.list.length > 0)

  // On the plain, unfiltered index, favorites also get a shelf of their own at the top.
  const pinned = filter == null && !q ? favorites : []
  const locked = !settings.public_read && !p.signedIn && recipes.length === 0

  const card = (r: Recipe) => (
    <button key={r.id} className="card" onClick={() => go(r.id)}>
      <h3>{r.title}</h3>
      <p>{r.description}</p>
      <div className="meta">
        {p.favorites.has(r.id) && (
          <span className="star" aria-label="Favorite">
            ★
          </span>
        )}
        {r.time && <span>{r.time}</span>}
        {r.serves ? <span>Serves {r.serves}</span> : null}
      </div>
    </button>
  )

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
          This recipe box is private.{' '}
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
              <button className="chip" aria-pressed={filter == null} onClick={() => p.setSectionFilter(null)}>
                All
              </button>
              {favorites.length > 0 && (
                <button
                  className="chip"
                  aria-pressed={filter === 'favorites'}
                  onClick={() => p.setSectionFilter('favorites')}
                >
                  ★ Favorites
                </button>
              )}
              {sections.map((s) => (
                <button
                  key={s.id}
                  className="chip"
                  aria-pressed={filter === s.id}
                  onClick={() => p.setSectionFilter(s.id)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {pinned.length > 0 && (
            <div>
              <div className="section-label">★ Favorites</div>
              <div className="grid">{pinned.map(card)}</div>
            </div>
          )}

          {visible.map(({ section, list }) => (
            <div key={section.id}>
              <div className="section-label">{section.name}</div>
              <div className="grid">{list.map(card)}</div>
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
