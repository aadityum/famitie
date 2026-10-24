import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { startSharing, type Fix } from '../lib/location'
import { publishLocation, registerSharingStopper, wasSharing } from '../lib/locationSync'

const MIN_WRITE_MS = 15_000 // don't hammer the database on every GPS tick

/**
 * User-controlled live location sharing.
 * Once switched on it stays on (and resumes by itself when the app opens) until the user switches it off.
 */
export default function LocationToggle({ userId }: { userId?: string }) {
  const [on, setOn] = useState(false)
  const [fix, setFix] = useState<Fix | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stopFn = useRef<(() => Promise<void>) | null>(null)
  const lastWrite = useRef(0)
  const active = useRef(false)
  const native = Capacitor.isNativePlatform()

  const onFix = (f: Fix) => {
    if (!active.current) return
    setFix(f)
    if (userId && Date.now() - lastWrite.current > MIN_WRITE_MS) {
      lastWrite.current = Date.now()
      void publishLocation(userId, true, f)
    }
  }

  /** Stops tracking on this device only (the saved "sharing is on" choice is kept). */
  const stopTracking = async () => {
    active.current = false
    const stop = stopFn.current
    stopFn.current = null
    try {
      await stop?.()
    } catch {
      /* already stopped */
    }
  }

  const startTracking = async () => {
    lastWrite.current = 0
    active.current = true
    stopFn.current = await startSharing(onFix, (m) => setError(m))
  }

  const turnOff = async () => {
    await stopTracking()
    setOn(false)
    setFix(null)
    if (userId) await publishLocation(userId, false, null)
  }

  const toggle = async () => {
    setError(null)
    if (on) return turnOff()
    try {
      await startTracking()
      setOn(true)
    } catch (e) {
      active.current = false
      setError(e instanceof Error ? e.message : 'Could not start location sharing')
    }
  }

  // Resume sharing if it was left on last time; stop the device's tracking (not the choice) on exit.
  useEffect(() => {
    let alive = true
    registerSharingStopper(stopTracking)
    if (userId) {
      void wasSharing(userId).then(async (shared) => {
        if (!alive || !shared) return
        try {
          await startTracking()
          if (alive) setOn(true)
          else await stopTracking()
        } catch (e) {
          active.current = false
          if (alive) setError(e instanceof Error ? e.message : 'Could not resume location sharing')
        }
      })
    }
    return () => {
      alive = false
      registerSharingStopper(null)
      void stopTracking()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-ink/5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">Share my live location with family</h2>
          <p className="text-sm text-ink/60">
            {on
              ? 'On. Your family can follow where you are until you switch this off.'
              : 'Off. Location is still sent with SOS alerts.'}
          </p>
        </div>
        <button
          role="switch"
          aria-checked={on}
          aria-label="Share my live location"
          onClick={toggle}
          className={`relative h-9 w-16 shrink-0 rounded-full transition-colors ${on ? 'bg-brand' : 'bg-ink/20'}`}
        >
          <span className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow transition-all ${on ? 'left-8' : 'left-1'}`} />
        </button>
      </div>
      {on && !native && (
        <p className="mt-2 text-xs text-amber-700">
          In a browser, updates only continue while this page is open. The phone app keeps updating with the screen off.
        </p>
      )}
      {on && native && (
        <p className="mt-2 text-xs text-ink/50">Keeps updating in the background. You will see a location indicator on your phone.</p>
      )}
      {fix && (
        <p className="mt-2 text-xs text-ink/50">
          {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)} (±{Math.round(fix.accuracyM)} m)
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  )
}
