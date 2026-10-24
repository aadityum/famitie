import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Settings = {
  /** How long an alert stays visible on this person's screen after it was answered (minutes, max 24 h). */
  alertVisibleMin: number
  /** How long this person's voice recordings are kept before they disappear (minutes, max 6 h). */
  voiceKeepMin: number
}

export const DEFAULT_SETTINGS: Settings = { alertVisibleMin: 60, voiceKeepMin: 30 }

export const ALERT_VISIBLE_OPTIONS = [
  { min: 5, label: '5 minutes' },
  { min: 15, label: '15 minutes' },
  { min: 30, label: '30 minutes' },
  { min: 60, label: '1 hour (default)' },
  { min: 180, label: '3 hours' },
  { min: 360, label: '6 hours' },
  { min: 720, label: '12 hours' },
  { min: 1440, label: '24 hours (maximum)' },
]

export const VOICE_KEEP_OPTIONS = [
  { min: 5, label: '5 minutes' },
  { min: 15, label: '15 minutes' },
  { min: 30, label: '30 minutes (default)' },
  { min: 60, label: '1 hour' },
  { min: 180, label: '3 hours' },
  { min: 360, label: '6 hours (maximum)' },
]

export const minutesLabel = (min: number) =>
  min < 60 ? `${min} minute${min === 1 ? '' : 's'}` : min % 60 === 0 ? `${min / 60} hour${min === 60 ? '' : 's'}` : `${Math.floor(min / 60)} h ${min % 60} min`

/** The person's own timers, stored on their profile so they follow them across devices. */
export function useSettings(userId: string | undefined) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase || !userId) return
    let alive = true
    void supabase
      .from('profiles')
      .select('alert_visible_minutes, voice_keep_minutes')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return
        setSettings({
          alertVisibleMin: data.alert_visible_minutes ?? DEFAULT_SETTINGS.alertVisibleMin,
          voiceKeepMin: data.voice_keep_minutes ?? DEFAULT_SETTINGS.voiceKeepMin,
        })
      })
    return () => {
      alive = false
    }
  }, [userId])

  const save = useCallback(
    async (patch: Partial<Settings>) => {
      setError(null)
      const prev = settings
      const next = { ...settings, ...patch }
      setSettings(next)
      if (!supabase || !userId) return
      const { error: e } = await supabase
        .from('profiles')
        .update({ alert_visible_minutes: next.alertVisibleMin, voice_keep_minutes: next.voiceKeepMin })
        .eq('id', userId)
      if (e) {
        setSettings(prev)
        setError('Could not save that. Make sure migration 0004 has been run in Supabase.')
      }
    },
    [settings, userId],
  )

  return { settings, save, error }
}
