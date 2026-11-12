import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { cachedSiteName, clearCache, ensureProfile, loadAll } from './lib/api'
import { loadFavorites, setFavorite } from './lib/favorites'
import { configured, supabase } from './lib/supabase'
import type { RecipeBoxData, Profile } from './lib/types'
import { go, useHash } from './lib/useHash'
import { AccountBar } from './components/AccountBar'
import { AccountPage, NewPasswordPage, ProfilePage } from './components/AccountPages'
import { AdminPage } from './components/AdminPage'
import { IndexPage, type SectionFilter } from './components/IndexPage'
import { RecipeForm } from './components/RecipeForm'
import { RecipePage } from './components/RecipePage'

export function App() {
  const hash = useHash()
  const [data, setData] = useState<RecipeBoxData | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [recovery, setRecovery] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>(null)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const lastUserId = useRef<string | null | undefined>(undefined)

  const reload = useCallback(async () => {
    try {
      setData(await loadAll())
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    }
  }, [])

  /** Reads the session and role. Returns true if the signed-in user changed. */
  const refreshAuth = useCallback(async () => {
    const { data: s } = await supabase.auth.getSession()
    const u = s.session?.user ?? null
    setUser(u)
    setProfile(u ? await ensureProfile() : null)
    const changed = lastUserId.current !== (u?.id ?? null)
    lastUserId.current = u?.id ?? null
    return changed
  }, [])

  useEffect(() => {
    if (!configured) return
    void (async () => {
      await refreshAuth()
      await reload()
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      // Supabase calls must not run inside this callback, so defer them.
      setTimeout(() => {
        if (event === 'PASSWORD_RECOVERY') {
          setRecovery(true)
          void refreshAuth()
        } else if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          if (event === 'SIGNED_OUT') clearCache()
          // What you may read can depend on being signed in, so reload then.
          void refreshAuth().then((changed) => {
            if (changed) void reload()
          })
        }
      }, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [refreshAuth, reload])

  useEffect(() => {
    if (data) document.title = data.settings.site_name
  }, [data])

  const userId = user?.id ?? null
  useEffect(() => {
    if (!configured) return
    let stale = false
    void loadFavorites(userId).then((f) => {
      if (!stale) setFavorites(f)
    })
    return () => {
      stale = true
    }
  }, [userId])

  const toggleFavorite = useCallback(
    async (id: string) => {
      const on = !favorites.has(id)
      const apply = (add: boolean) =>
        setFavorites((prev) => {
          const next = new Set(prev)
          if (add) next.add(id)
          else next.delete(id)
          return next
        })
      apply(on) // show it straight away; undo if saving fails
      try {
        await setFavorite(userId, id, on)
      } catch {
        apply(!on)
      }
    },
    [favorites, userId],
  )

  useEffect(() => {
    if (hash) setFlash(null)
    window.scrollTo(0, 0)
  }, [hash])

  // Supabase puts tokens in the hash after an email link; that is not a page.
  const isAuthCallback = /(^|&)(access_token|error|type)=/.test(hash)
  useEffect(() => {
    if (isAuthCallback) history.replaceState(null, '', location.pathname)
  }, [isAuthCallback])
  const route = isAuthCallback ? '' : hash

  if (!configured) return <Shell><SetupNotice /></Shell>

  const role = profile?.role ?? 'viewer'
  const canEdit = (role === 'editor' || role === 'admin') && !!data && !data.fromCache

  let page
  if (recovery) {
    page = (
      <NewPasswordPage
        onDone={() => {
          setRecovery(false)
          setFlash("Password updated. You're signed in.")
          go('')
        }}
      />
    )
  } else if (!data) {
    page = (
      <header className="masthead">
        <div>
          <h1>{cachedSiteName() ?? 'Recipe Box'}</h1>
          <p>
            {loadFailed
              ? "The recipes didn't load. Check your connection and reload the page."
              : 'Loading recipes…'}
          </p>
        </div>
      </header>
    )
  } else if (route === 'account') {
    page = <AccountPage signedIn={!!user} />
  } else if (route === 'profile') {
    page = <ProfilePage user={user} profile={profile} onSaved={refreshAuth} />
  } else if (route === 'admin') {
    page = <AdminPage data={data} isAdmin={role === 'admin'} myId={user?.id ?? null} reload={reload} />
  } else if (route === 'new' || route.startsWith('edit-')) {
    const editing = route === 'new' ? null : data.recipes.find((r) => r.id === route.slice(5)) ?? null
    page = (
      <RecipeForm
        key={route}
        recipe={editing}
        data={data}
        user={user}
        canEdit={canEdit}
        onSaved={async (id) => {
          await reload()
          go(id)
        }}
      />
    )
  } else {
    const recipe = data.recipes.find((r) => r.id === route)
    page = recipe ? (
      <RecipePage
        key={recipe.id}
        recipe={recipe}
        sectionName={data.sections.find((s) => s.id === recipe.section_id)?.name ?? ''}
        canEdit={canEdit}
        isFavorite={favorites.has(recipe.id)}
        onToggleFavorite={() => void toggleFavorite(recipe.id)}
        onDeleted={async () => {
          await reload()
          setFlash(`Deleted “${recipe.title}”.`)
          go('')
        }}
      />
    ) : (
      <IndexPage
        data={data}
        canEdit={canEdit}
        signedIn={!!user}
        flash={flash}
        favorites={favorites}
        query={query}
        setQuery={setQuery}
        sectionFilter={sectionFilter}
        setSectionFilter={setSectionFilter}
      />
    )
  }

  return (
    <Shell>
      <AccountBar user={user} role={role} />
      {page}
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="wrap">{children}</div>
}

function SetupNotice() {
  return (
    <div className="panel">
      <h1>Almost there</h1>
      <p className="lede">
        This recipe box isn't connected to a database yet. Put your Supabase project URL and publishable key
        in <code>config.json</code> (next to <code>index.html</code>) and reload. When developing, a{' '}
        <code>.env</code> file works too. The full walkthrough is in <code>docs/supabase.md</code>.
      </p>
    </div>
  )
}
