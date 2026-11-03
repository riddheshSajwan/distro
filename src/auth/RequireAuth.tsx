import { Navigate, Outlet } from 'react-router'
import { useAuth } from './useAuth'

// Guards every screen except Login.
export function RequireAuth() {
  const { session } = useAuth()

  if (session === undefined) return null
  if (!session) return <Navigate to="/login" replace />

  // TODO(Voice screen): if the user has no pages row yet, redirect to /voice.
  // This covers both "first login goes to Voice" and "every screen except Login
  // sends users without a pages row to Voice" from CLAUDE.md. Skipped until
  // the Voice screen exists.

  return <Outlet />
}
