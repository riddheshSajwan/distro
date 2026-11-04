import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { PageContext, type Page, type PageState } from './pageContext'
import { useAuth } from './useAuth'

type Loaded = { userId: string; state: PageState }

// Loads the signed-in user's single pages row. RequireAuth uses it to send users
// without one to Voice; Requests uses its id for new requests.
export function PageProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id
  const [loaded, setLoaded] = useState<Loaded>()
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!userId) return
    let current = true
    supabase
      .from('pages')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!current) return
        setLoaded({ userId, state: error ? { status: 'error' } : { status: 'loaded', page: data } })
      })
    return () => {
      current = false
    }
  }, [userId, attempt])

  // A result that belongs to a different (or signed-out) user counts as still loading.
  const state: PageState = loaded && loaded.userId === userId ? loaded.state : { status: 'loading' }

  const setPage = useCallback(
    (page: Page) => setLoaded({ userId: page.user_id, state: { status: 'loaded', page } }),
    [],
  )
  const reload = useCallback(() => {
    setLoaded(undefined)
    setAttempt((n) => n + 1)
  }, [])

  return <PageContext.Provider value={{ state, setPage, reload }}>{children}</PageContext.Provider>
}
