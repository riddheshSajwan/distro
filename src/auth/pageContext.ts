import { createContext, useContext } from 'react'
import type { Tables } from '../lib/database.types'

export type Page = Tables<'pages'>

export type PageState =
  | { status: 'loading' }
  | { status: 'error' }
  // page is null until the user saves their voice for the first time.
  | { status: 'loaded'; page: Page | null }

export type PageContextValue = {
  state: PageState
  setPage: (page: Page) => void
  reload: () => void
}

export const PageContext = createContext<PageContextValue>({
  state: { status: 'loading' },
  setPage: () => {},
  reload: () => {},
})

// The signed-in user's pages row. Behind RequireAuth it is always loaded.
export function usePage(): Page | null {
  const { state } = useContext(PageContext)
  return state.status === 'loaded' ? state.page : null
}

export function usePageContext() {
  return useContext(PageContext)
}
