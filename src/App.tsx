import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthProvider, signOut, useAuth } from './lib/auth'
import { backendConfigured } from './lib/supabase'
import { fetchMyCircles, type Circle } from './lib/circles'
import { stopSharingEverywhere } from './lib/locationSync'
import AuthScreen from './screens/AuthScreen'
import CircleSetup from './screens/CircleSetup'
import Home from './screens/Home'
import LockGate from './components/LockScreen'

type Me = { id: string; name: string; email?: string }

function Splash({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="flex min-h-full items-center justify-center text-ink/60">
      <p>{text}</p>
    </div>
  )
}

/** Everything a signed-in person sees. Wrapped in the app lock by Gate. */
function Authed({ me }: { me: Me }) {
  const [circles, setCircles] = useState<Circle[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      setCircles(await fetchMyCircles(me.id))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'Could not load your circles')
    }
  }, [me.id])

  useEffect(() => {
    setCircles(null)
    void load()
  }, [load])

  const doSignOut = async () => {
    // Signing out counts as stopping live location sharing.
    try {
      await stopSharingEverywhere(me.id)
    } catch {
      /* sign out regardless */
    }
    await signOut()
  }

  if (loadError)
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-red-600">{loadError}</p>
        <p className="max-w-sm text-sm text-ink/60">
          If this is a new project, make sure all the SQL files in supabase/migrations were run, in order.
        </p>
        <button onClick={() => void load()} className="rounded-xl bg-brand px-6 py-3 font-bold text-white">Try again</button>
        <button onClick={() => void doSignOut()} className="text-sm text-ink/50">Sign out</button>
      </div>
    )

  if (!circles) return <Splash text="Loading your family circle…" />
  if (circles.length === 0) return <CircleSetup onDone={() => void load()} />

  // One circle per person for now; a circle switcher can come later.
  return <Home me={me} circle={circles[0]} onSignOut={() => void doSignOut()} onCirclesChanged={() => void load()} />
}

function Gate() {
  const { session, loading } = useAuth()

  const me = useMemo<Me | null>(() => {
    if (!session) return null
    const meta = session.user.user_metadata as { display_name?: string }
    return {
      id: session.user.id,
      name: meta.display_name || session.user.email?.split('@')[0] || 'Me',
      email: session.user.email ?? undefined,
    }
  }, [session])

  // No backend configured yet: run the local demo so the UI can still be tried.
  if (!backendConfigured) return <Home me={null} circle={null} />

  if (loading) return <Splash />
  if (!session || !me) return <AuthScreen />

  return (
    <LockGate userId={me.id}>
      <Authed me={me} />
    </LockGate>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
