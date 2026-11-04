import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { TextLink } from './TextLink'

// Shared header for every screen except Login.
export function AppHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-content items-center justify-between gap-2 px-2 py-2 sm:px-3">
        <Link
          to="/"
          className="rounded-base text-title font-semibold text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          distro
        </Link>
        <nav className="flex items-center gap-3">
          <TextLink tone="muted" to="/voice">
            Voice
          </TextLink>
          <TextLink tone="muted" onClick={() => supabase.auth.signOut()}>
            Sign out
          </TextLink>
        </nav>
      </div>
    </header>
  )
}
