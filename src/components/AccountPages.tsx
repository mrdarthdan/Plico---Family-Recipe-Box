import { useEffect, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { setDisplayName } from '../lib/api'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import { go } from '../lib/useHash'

type Notice = { text: string; ok: boolean } | null

function here() {
  return location.origin + location.pathname
}

/** Sign in, create an account, or ask for a password-reset email. */
export function AccountPage({ signedIn }: { signedIn: boolean }) {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [busy, setBusy] = useState(false)
  const up = mode === 'up'

  useEffect(() => {
    if (signedIn) go('')
  }, [signedIn])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const mail = email.trim()
    if (!mail || !password) return setNotice({ text: 'Enter your email and password.', ok: false })
    if (up && password.length < 8) return setNotice({ text: 'Use a password of at least 8 characters.', ok: false })
    setBusy(true)
    if (up) {
      const { data, error } = await supabase.auth.signUp({ email: mail, password, options: { emailRedirectTo: here() } })
      setBusy(false)
      if (error) return setNotice({ text: "Couldn't create the account: " + error.message, ok: false })
      if (data.session) return go('')
      setNotice({ text: 'Account created. Check your email for a confirmation link, then sign in here.', ok: true })
      setMode('in')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: mail, password })
      setBusy(false)
      if (error)
        return setNotice({
          text: /confirm/i.test(error.message)
            ? 'Confirm your email first. Check your inbox for the link.'
            : "That email and password don't match.",
          ok: false,
        })
      go('')
    }
  }

  async function reset() {
    const mail = email.trim()
    if (!mail) return setNotice({ text: 'Enter your email first, then tap Forgot password.', ok: false })
    const { error } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo: here() })
    setNotice(
      error
        ? { text: "Couldn't send the reset email: " + error.message, ok: false }
        : { text: 'Check your email for a link to reset your password.', ok: true },
    )
  }

  return (
    <>
      <button className="back" onClick={() => go('')}>
        ← All recipes
      </button>
      <form className="panel" onSubmit={submit} noValidate>
        <h1>{up ? 'Create an account' : 'Sign in'}</h1>
        <p className="lede">
          {up
            ? 'New accounts can read recipes. An admin decides who can add and edit them.'
            : 'Editors sign in here to add and edit recipes.'}
        </p>
        <div className="field">
          <label htmlFor="a-email">Email</label>
          <input id="a-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="a-pass">Password</label>
          <input
            id="a-pass"
            type="password"
            autoComplete={up ? 'new-password' : 'current-password'}
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {up && <p className="hint">At least 8 characters.</p>}
        </div>
        {notice && <p className={'msg ' + (notice.ok ? 'ok' : 'err')}>{notice.text}</p>}
        <div className="actions">
          <button className="btn" type="submit" disabled={busy}>
            {up ? 'Create account' : 'Sign in'}
          </button>
          <button className="link" type="button" onClick={() => { setMode(up ? 'in' : 'up'); setNotice(null) }}>
            {up ? 'I already have an account' : 'Create an account'}
          </button>
          {!up && (
            <button className="link" type="button" onClick={reset}>
              Forgot password
            </button>
          )}
        </div>
      </form>
    </>
  )
}

/** Shown after following a password-reset email link. */
export function NewPasswordPage({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setError('Use at least 8 characters.')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return setError("Couldn't save the password: " + error.message)
    onDone()
  }

  return (
    <form className="panel" onSubmit={submit} noValidate>
      <h1>Set a new password</h1>
      <div className="field">
        <label htmlFor="p-pass">New password</label>
        <input id="p-pass" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        <p className="hint">At least 8 characters.</p>
      </div>
      {error && <p className="msg err">{error}</p>}
      <div className="actions">
        <button className="btn" type="submit">
          Save password
        </button>
      </div>
    </form>
  )
}

/** Lets a signed-in user set the name shown on recipes they add. */
export function ProfilePage({
  user, profile, onSaved,
}: {
  user: User | null
  profile: Profile | null
  onSaved: () => Promise<unknown>
}) {
  const [name, setName] = useState(profile?.display_name ?? '')
  const [notice, setNotice] = useState<Notice>(null)

  useEffect(() => {
    setName(profile?.display_name ?? '')
  }, [profile?.display_name])

  if (!user) {
    return (
      <div className="panel">
        <h1>Sign in first</h1>
        <div className="actions">
          <button className="btn" onClick={() => go('account')}>
            Sign in
          </button>
        </div>
      </div>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await setDisplayName(name)
      await onSaved()
      setNotice({ text: 'Saved.', ok: true })
    } catch (err) {
      setNotice({ text: "Couldn't save: " + (err as Error).message, ok: false })
    }
  }

  return (
    <>
      <button className="back" onClick={() => go('')}>
        ← All recipes
      </button>
      <form className="panel" onSubmit={submit} noValidate>
        <h1>Your profile</h1>
        <p className="lede">
          Signed in as {user.email}. Role: {profile?.role ?? 'viewer'}.
        </p>
        <div className="field">
          <label htmlFor="pr-name">Display name</label>
          <p className="hint">Used for the “Contributed by …” line on recipes you add without a credit of their own.</p>
          <input id="pr-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {notice && <p className={'msg ' + (notice.ok ? 'ok' : 'err')}>{notice.text}</p>}
        <div className="actions">
          <button className="btn" type="submit">
            Save
          </button>
        </div>
      </form>
    </>
  )
}
