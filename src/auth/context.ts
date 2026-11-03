import type { Session } from '@supabase/supabase-js'
import { createContext } from 'react'

export type AuthState = {
  // undefined while the stored session (or the magic link in the URL) is still being read.
  session: Session | null | undefined
}

export const AuthContext = createContext<AuthState>({ session: undefined })
