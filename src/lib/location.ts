import { Capacitor } from '@capacitor/core'
import { Geolocation, type Position } from '@capacitor/geolocation'
import { BackgroundGeolocation, type Location as BgLocation } from '@capgo/background-geolocation'

export type Fix = { lat: number; lng: number; accuracyM: number; at: number }

const toFix = (p: Position): Fix => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  accuracyM: p.coords.accuracy,
  at: p.timestamp,
})

const fromBg = (l: BgLocation): Fix => ({
  lat: l.latitude,
  lng: l.longitude,
  accuracyM: l.accuracy,
  at: l.time ?? Date.now(),
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
 * Continuous tracking while sharing is on. Returns a function that stops it.
 *
 *  - On the phone app (iOS / Android) it keeps running with the screen off or the app in the
 *    background: iOS shows the blue location indicator, Android shows a "FamiTie is sharing
 *    your location" notification. Both are required by the platforms and are good for trust.
 *  - In a desktop browser it only runs while the page is open.
 */
export async function startSharing(onFix: (f: Fix) => void, onError?: (message: string) => void): Promise<() => Promise<void>> {
  if (Capacitor.isNativePlatform()) {
    await BackgroundGeolocation.start(
      {
        backgroundTitle: 'FamiTie is sharing your location',
        backgroundMessage: 'Your family circle can see where you are. Open FamiTie to turn this off.',
        requestPermissions: true,
        stale: false,
        distanceFilter: 0, // keep updating even when standing still, so "live" stays live
      },
      (loc, err) => {
        if (err) {
          if (err.code === 'NOT_AUTHORIZED') onError?.('Location permission was denied. Allow it for FamiTie in Settings.')
          else onError?.(err.message || 'Location is unavailable')
          return
        }
        if (loc) onFix(fromBg(loc))
      },
    )
    return async () => {
      await BackgroundGeolocation.stop()
    }
  }

  // Browser: the browser asks for permission itself when tracking starts.
  const id = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 15_000 }, (p, err) => {
    if (err) onError?.(err.message || 'Location is unavailable')
    else if (p) onFix(toFix(p))
  })
  return async () => {
    await Geolocation.clearWatch({ id })
  }
}
