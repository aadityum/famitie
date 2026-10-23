import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthProvider, signOut, useAuth } from './lib/auth'
import { backendConfigured } from './lib/supabase'
import { fetchMyCircles, type Circle } from './lib/circles'
import AuthScreen from './screens/AuthScreen'
import CircleSetup from './screens/CircleSetup'
import Home from './screens/Home'

function Splash({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="flex min-h-full items-center justify-center text-ink/60">
      <p>{text}</p>
    </div>
  )
}

function Gate() {
  const { session, loading } = useAuth()
  const [circles, setCircles] = useState<Circle[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const userId = session?.user.id
  const load = useCallback(async () => {
    if (!userId) return
    setLoadError(null)
    try {
      setCircles(await fetchMyCircles(userId))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'Could not load your circles')
    }
  }, [userId])

  useEffect(() => {
    setCircles(null)
    void load()
  }, [load])

  const me = useMemo(() => {
    if (!session) return null
    const meta = session.user.user_metadata as { display_name?: string }
    return { id: session.user.id, name: meta.display_name || session.user.email?.split('@')[0] || 'Me' }
  }, [session])

  // No backend configured yet: run the local demo so the UI can still be tried.
  if (!backendConfigured) return <Home me={null} circle={null} />

  if (loading) return <Splash />
  if (!session || !me) return <AuthScreen />

  if (loadError)
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-red-600">{loadError}</p>
        <p className="max-w-sm text-sm text-ink/60">
          If this is a new project, make sure both SQL files in supabase/migrations were run.
        </p>
        <button onClick={() => void load()} className="rounded-xl bg-brand px-6 py-3 font-bold text-white">Try again</button>
        <button onClick={() => void signOut()} className="text-sm text-ink/50">Sign out</button>
      </div>
    )

  if (!circles) return <Splash text="Loading your family circle…" />
  if (circles.length === 0) return <CircleSetup onDone={() => void load()} />

  // One circle per person for now; a circle switcher can come later.
  return <Home me={me} circle={circles[0]} onSignOut={() => void signOut()} />
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
