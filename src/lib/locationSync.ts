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
