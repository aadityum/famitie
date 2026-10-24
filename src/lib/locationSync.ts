import { supabase } from './supabase'
import type { Fix } from './location'

/** Publishes (or clears) this user's shared location for their circles. */
export async function publishLocation(userId: string, enabled: boolean, fix: Fix | null) {
  if (!supabase) return
  await supabase.from('locations').upsert({
    user_id: userId,
    sharing_enabled: enabled,
    lat: enabled && fix ? fix.lat : null,
    lng: enabled && fix ? fix.lng : null,
    accuracy_m: enabled && fix ? fix.accuracyM : null,
    updated_at: new Date().toISOString(),
  })
}

/** Whether this user left sharing switched on last time (so it can resume when the app opens). */
export async function wasSharing(userId: string): Promise<boolean> {
  if (!supabase) return false
  const { data } = await supabase.from('locations').select('sharing_enabled').eq('user_id', userId).maybeSingle()
  return !!data?.sharing_enabled
}

// The toggle registers how to stop tracking, so signing out can switch sharing off cleanly.
let stopper: (() => Promise<void>) | null = null
export const registerSharingStopper = (fn: (() => Promise<void>) | null) => {
  stopper = fn
}

/** Stop tracking on this device and tell the circle sharing is off (used when signing out). */
export async function stopSharingEverywhere(userId: string) {
  try {
    await stopper?.()
  } finally {
    await publishLocation(userId, false, null)
  }
}
