import { useEffect, useRef, useState } from 'react'
import { startSharing, stopSharing, type Fix } from '../lib/location'
import { publishLocation } from '../lib/locationSync'

const MIN_WRITE_MS = 15_000 // don't hammer the database on every GPS tick

/** User-controlled location sharing. Permission is only requested when switched on. */
export default function LocationToggle({ userId }: { userId?: string }) {
  const [on, setOn] = useState(false)
  const [fix, setFix] = useState<Fix | null>(null)
  const [error, setError] = useState<string | null>(null)
  const watchId = useRef<string | null>(null)
  const lastWrite = useRef(0)

  const onFix = (f: Fix) => {
    setFix(f)
    if (userId && Date.now() - lastWrite.current > MIN_WRITE_MS) {
      lastWrite.current = Date.now()
      void publishLocation(userId, true, f)
    }
  }

  const disable = async () => {
    if (watchId.current) await stopSharing(watchId.current)
    watchId.current = null
    setOn(false)
    setFix(null)
    if (userId) await publishLocation(userId, false, null)
  }

  const toggle = async () => {
    setError(null)
    if (on) return disable()
    try {
      lastWrite.current = 0
      watchId.current = await startSharing(onFix)
      setOn(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start location sharing')
    }
  }

  // Sharing only runs while the app is open (until background tracking is added),
  // so switch it off cleanly when this screen goes away.
  useEffect(() => {
    return () => {
      if (watchId.current) {
        void stopSharing(watchId.current)
        watchId.current = null
        if (userId) void publishLocation(userId, false, null)
      }
    }
  }, [userId])

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-ink/5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">Share my location with family</h2>
          <p className="text-sm text-ink/60">
            {on ? 'Sharing is ON while FamiTie is open. Your family circle can see where you are.' : 'Off. Location is still sent with SOS alerts.'}
          </p>
        </div>
        <button
          role="switch"
          aria-checked={on}
          onClick={toggle}
          className={`relative h-9 w-16 shrink-0 rounded-full transition-colors ${on ? 'bg-brand' : 'bg-ink/20'}`}
        >
          <span className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow transition-all ${on ? 'left-8' : 'left-1'}`} />
        </button>
      </div>
      {fix && (
        <p className="mt-3 text-xs text-ink/50">
          {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)} (±{Math.round(fix.accuracyM)} m)
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  )
}
