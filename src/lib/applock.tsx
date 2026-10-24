import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { NativeBiometric } from '@capgo/capacitor-native-biometric'

/**
 * App lock for FamiTie.
 *  - "device": uses the phone's own screen lock (Face ID / fingerprint / passcode). Phone app only.
 *  - "pin":    a FamiTie PIN of 4 to 6 digits, kept on this device only (stored as a salted hash).
 * Incoming SOS / "come for a sec" alerts are drawn above the lock screen, so they always ring
 * and can be answered without unlocking.
 */
export type LockMethod = 'device' | 'pin'
export type LockConfig = {
  enabled: boolean
  method: LockMethod
  /** Lock after the app has been in the background this many seconds. */
  lockAfterSec: number
  pin?: { salt: string; hash: string; len: number }
}

export const LOCK_AFTER_OPTIONS = [
  { sec: 3, label: 'Right away' },
  { sec: 60, label: 'After 1 minute' },
  { sec: 300, label: 'After 5 minutes' },
  { sec: 900, label: 'After 15 minutes' },
]

const DEFAULT_CONFIG: LockConfig = { enabled: false, method: 'pin', lockAfterSec: 60 }
const keyFor = (userId: string) => `famitie.lock.v1.${userId}`

function readConfig(userId: string): LockConfig {
  try {
    const raw = localStorage.getItem(keyFor(userId))
    return raw ? { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<LockConfig>) } : DEFAULT_CONFIG
  } catch {
    return DEFAULT_CONFIG
  }
}
function writeConfig(userId: string, c: LockConfig) {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(c))
  } catch {
    /* storage can be unavailable; the lock then simply does not persist */
  }
}
export function clearLock(userId: string) {
  try {
    localStorage.removeItem(keyFor(userId))
  } catch {
    /* ignore */
  }
}

// ── PIN hashing (PBKDF2, salted) ──
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export const pinSupported = () => typeof crypto !== 'undefined' && !!crypto.subtle

async function derive(pin: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 150_000, hash: 'SHA-256' },
    key,
    256,
  )
  return toB64(new Uint8Array(bits))
}

// ── Phone's own screen lock ──
export async function deviceLockAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    return (await NativeBiometric.isAvailable({ useFallback: true })).isAvailable
  } catch {
    return false
  }
}

type Ctx = {
  config: LockConfig
  locked: boolean
  update: (patch: Partial<LockConfig>) => void
  setPin: (pin: string) => Promise<void>
  verifyPin: (pin: string) => Promise<boolean>
  /** Shows the phone's Face ID / fingerprint / passcode prompt. Resolves true if the person passed it. */
  unlockWithDevice: () => Promise<boolean>
  unlock: () => void
  lockNow: () => void
}

const LockCtx = createContext<Ctx | null>(null)
export const useAppLock = () => {
  const c = useContext(LockCtx)
  if (!c) throw new Error('useAppLock must be used inside AppLockProvider')
  return c
}

export function AppLockProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [config, setConfig] = useState<LockConfig>(() => readConfig(userId))
  const [locked, setLocked] = useState<boolean>(() => readConfig(userId).enabled) // locked on every cold start
  const cfgRef = useRef(config)
  cfgRef.current = config
  const authenticating = useRef(false) // the system prompt itself can pause the page briefly

  const update = useCallback(
    (patch: Partial<LockConfig>) => {
      const next = { ...cfgRef.current, ...patch }
      if (!next.enabled) delete next.pin
      cfgRef.current = next
      setConfig(next)
      writeConfig(userId, next)
      if (!next.enabled) setLocked(false)
    },
    [userId],
  )

  const setPin = useCallback(
    async (pin: string) => {
      const salt = crypto.getRandomValues(new Uint8Array(16))
      update({ enabled: true, method: 'pin', pin: { salt: toB64(salt), hash: await derive(pin, salt), len: pin.length } })
    },
    [update],
  )

  const verifyPin = useCallback(async (pin: string) => {
    const p = cfgRef.current.pin
    if (!p) return false
    return (await derive(pin, fromB64(p.salt))) === p.hash
  }, [])

  const unlockWithDevice = useCallback(async () => {
    authenticating.current = true
    try {
      await NativeBiometric.verifyIdentity({
        reason: 'Unlock FamiTie',
        title: 'Unlock FamiTie',
        useFallback: true,
      })
      return true
    } catch {
      return false
    } finally {
      // give the page a moment to settle before background/foreground changes count again
      setTimeout(() => (authenticating.current = false), 1500)
    }
  }, [])

  // Lock again when the app was away (screen off or another app) for longer than the chosen time.
  useEffect(() => {
    let hiddenAt: number | null = null
    const onChange = () => {
      if (document.visibilityState === 'hidden') {
        if (!authenticating.current) hiddenAt = Date.now()
      } else if (hiddenAt != null) {
        const awaySec = (Date.now() - hiddenAt) / 1000
        hiddenAt = null
        const c = cfgRef.current
        if (c.enabled && awaySec >= Math.max(c.lockAfterSec, 3)) setLocked(true)
      }
    }
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  const value = useMemo<Ctx>(
    () => ({
      config,
      locked,
      update,
      setPin,
      verifyPin,
      unlockWithDevice,
      unlock: () => setLocked(false),
      lockNow: () => cfgRef.current.enabled && setLocked(true),
    }),
    [config, locked, update, setPin, verifyPin, unlockWithDevice],
  )

  return <LockCtx.Provider value={value}>{children}</LockCtx.Provider>
}
