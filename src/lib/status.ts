import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { AlertType } from './alerts'

export type StatusKind = 'available' | 'meeting' | 'sleeping' | 'dnd'

export const STATUS_INFO: Record<StatusKind, { label: string; icon: string; dot: string }> = {
  available: { label: 'Available', icon: '🟢', dot: 'bg-green-500' },
  meeting: { label: 'In a meeting', icon: '📅', dot: 'bg-amber-500' },
  sleeping: { label: 'Sleeping', icon: '😴', dot: 'bg-indigo-500' },
  dnd: { label: 'Do not disturb', icon: '⛔', dot: 'bg-red-500' },
}

export const DURATIONS = [
  { min: 30, label: '30 minutes' },
  { min: 60, label: '1 hour' },
  { min: 480, label: '8 hours' },
  { min: 0, label: 'Until I change it' },
]

export type MyStatus = {
  status: StatusKind
  until: string | null
  silent: boolean
  appearOffline: boolean
  sosBreakthrough: boolean
}

export const DEFAULT_STATUS: MyStatus = {
  status: 'available',
  until: null,
  silent: false,
  appearOffline: false,
  sosBreakthrough: true,
}

/** A status that has run out counts as Available. */
export const effectiveStatus = (s: StatusKind, until: string | null, now = Date.now()): StatusKind =>
  s !== 'available' && until && new Date(until).getTime() <= now ? 'available' : s

/**
 * How an incoming alert should reach this person.
 * 'ring'  = full-screen alert with sound and vibration.
 * 'quiet' = still shown on screen and in the alert list, but no sound or vibration.
 * SOS rings by default whatever the status (the person can turn that off in Settings).
 */
export function alertBehavior(type: AlertType, me: MyStatus, now = Date.now()): 'ring' | 'quiet' {
  if (type === 'sos' && me.sosBreakthrough) return 'ring'
  const st = effectiveStatus(me.status, me.until, now)
  if (me.silent || st !== 'available') return 'quiet'
  return 'ring'
}

/** Whether a voice clip should play out loud on arrival. */
export const clipsMayPlay = (me: MyStatus, now = Date.now()) =>
  !me.silent && effectiveStatus(me.status, me.until, now) === 'available'

export function useMyStatus(userId: string | undefined, onChanged?: () => void) {
  const [my, setMy] = useState<MyStatus>(DEFAULT_STATUS)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase || !userId) return
    let alive = true
    void supabase
      .from('profiles')
      .select('status, status_until, silent_mode, appear_offline, sos_breakthrough')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return
        setMy({
          status: (data.status as StatusKind) ?? 'available',
          until: data.status_until ?? null,
          silent: !!data.silent_mode,
          appearOffline: !!data.appear_offline,
          sosBreakthrough: data.sos_breakthrough ?? true,
        })
      })
    return () => {
      alive = false
    }
  }, [userId])

  const save = useCallback(
    async (patch: Partial<MyStatus>) => {
      setError(null)
      const prev = my
      const next = { ...my, ...patch }
      setMy(next)
      if (!supabase || !userId) return
      const { error: e } = await supabase
        .from('profiles')
        .update({
          status: next.status,
          status_until: next.status === 'available' ? null : next.until,
          silent_mode: next.silent,
          appear_offline: next.appearOffline,
          sos_breakthrough: next.sosBreakthrough,
        })
        .eq('id', userId)
      if (e) {
        setMy(prev)
        setError('Could not save that. Make sure migration 0005 has been run in Supabase.')
      } else onChanged?.()
    },
    [my, userId, onChanged],
  )

  return { my, save, error }
}

/** True while the device has no internet connection. */
export function useOnline() {
  const [on, setOn] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const up = () => setOn(true)
    const down = () => setOn(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return on
}
