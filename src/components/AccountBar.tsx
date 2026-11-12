import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Role } from '../lib/types'
import { go } from '../lib/useHash'

export function AccountBar({ user, role }: { user: User | null; role: Role }) {
  if (!user) {
    return (
      <div className="acct">
        <button className="link" onClick={() => go('account')}>
          Sign in
        </button>
      </div>
    )
  }
  return (
    <div className="acct">
      <span className="who">
        {user.email}
        {role === 'viewer' ? ' · view only' : role === 'admin' ? ' · admin' : ''}
      </span>
      <button className="link" onClick={() => go('profile')}>
        Profile
      </button>
      {role === 'admin' && (
        <button className="link" onClick={() => go('admin')}>
          Admin
        </button>
      )}
      <button
        className="link"
        onClick={async () => {
          await supabase.auth.signOut()
          go('')
        }}
      >
        Sign out
      </button>
    </div>
  )
}
