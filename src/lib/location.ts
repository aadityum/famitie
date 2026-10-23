import { Capacitor } from '@capacitor/core'
import { Geolocation, type Position } from '@capacitor/geolocation'

export type Fix = { lat: number; lng: number; accuracyM: number; at: number }

const toFix = (p: Position): Fix => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  accuracyM: p.coords.accuracy,
  at: p.timestamp,
})

/** One high-accuracy fix. Used when SOS / "come for a sec" fires. */
export async function getPreciseFix(): Promise<Fix | null> {
  try {
    const p = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10_000,
    })
    return toFix(p)
  } catch {
    return null
  }
}

/**
 * Foreground tracking while the sharing toggle is on.
 * True background tracking (app closed / screen off) needs
 * @capacitor-community/background-geolocation: see docs/BUILD.md.
 */
export async function startSharing(onFix: (f: Fix) => void): Promise<string> {
  // On the web the browser asks for permission itself when tracking starts,
  // and Capacitor's requestPermissions() isn't supported there.
  if (Capacitor.isNativePlatform()) {
    const perm = await Geolocation.requestPermissions()
    if (perm.location !== 'granted') throw new Error('Location permission denied')
  }
  return Geolocation.watchPosition(
    { enableHighAccuracy: true, timeout: 15_000 },
    (p) => {
      if (p) onFix(toFix(p))
    },
  )
}

export async function stopSharing(watchId: string) {
  await Geolocation.clearWatch({ id: watchId })
}