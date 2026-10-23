import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

type AuthState = { session: Session | null; loading: boolean }
const AuthCtx = createContext<AuthState>({ session: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true })

  useEffect(() => {
    if (!supabase) {
      setState({ session: null, loading: false })
      return
    }
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }))
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) =>
      setState({ session, loading: false }),
    )
    return () => sub.subscription.unsubscribe()
  }, [])

  return <AuthCtx.Provider value={state}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)

export async function signUp(email: string, password: string, displayName: string) {
  if (!supabase) throw new Error('Backend not configured')
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName.trim() } },
  })
  if (error) throw error
  // With "Confirm email" ON in Supabase there is no session yet.
  if (!data.session) throw new Error('Check your email to confirm the account, then sign in.')
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Backend not configured')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signOut() {
  await supabase?.auth.signOut()
}
