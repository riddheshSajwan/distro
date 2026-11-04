import { Navigate, Outlet, useLocation } from 'react-router'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { PageContainer } from '../components/PageContainer'
import { usePageContext } from './pageContext'
import { useAuth } from './useAuth'

// Guards every screen except Login. Until the user has a pages row, every screen
// except Voice redirects to Voice. That also makes the first login land on Voice.
export function RequireAuth() {
  const { session } = useAuth()
  const { state, reload } = usePageContext()
  const { pathname } = useLocation()

  if (session === undefined) return null
  if (!session) return <Navigate to="/login" replace />

  if (state.status === 'loading') return null
  if (state.status === 'error') {
    return (
      <PageContainer>
        <EmptyState
          message="distro could not load your page. Check your connection and try again."
          action={
            <Button variant="secondary" onClick={reload}>
              Retry
            </Button>
          }
        />
      </PageContainer>
    )
  }
  if (!state.page && pathname !== '/voice') return <Navigate to="/voice" replace />

  return <Outlet />
}
