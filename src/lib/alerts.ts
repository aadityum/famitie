import { useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { getPreciseFix, type Fix } from './location'

export type AlertType = 'sos' | 'come_for_a_sec'
export type AlertStatus = 'ringing' | 'answered' | 'missed' | 'cancelled'

export type AlertRow = {
  id: string
  group_id: string
  sender_id: string
  type: AlertType
  status: AlertStatus
  lat: number | null
  lng: number | null
  answered_by: string | null
  created_at: string
}

export type AlertResult = {
  type: AlertType
  fix: Fix | null
  alertId: string | null
  /** true once the alert row is stored and visible to the circle */
  sentToBackend: boolean
  status: AlertStatus
  answeredBy: string | null
  error?: string
}

const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))])

/**
 * Stores the alert so every circle member's device is told immediately (realtime).
 * Location rides along but never delays the alert by more than a few seconds.
 * Waking a locked / closed phone needs push notifications: still to come.
 */
export async function sendAlert(
  type: AlertType,
  ctx: { groupId?: string; senderId?: string },
): Promise<AlertResult> {
  const fix = await withTimeout(getPreciseFix(), 4000, null)
  const base: AlertResult = { type, fix, alertId: null, sentToBackend: false, status: 'ringing', answeredBy: null }
  if (!supabase || !ctx.groupId || !ctx.senderId) return base

  const { data, error } = await supabase
    .from('alerts')
    .insert({
      group_id: ctx.groupId,
      sender_id: ctx.senderId,
      type,
      lat: fix?.lat ?? null,
      lng: fix?.lng ?? null,
      accuracy_m: fix?.accuracyM ?? null,
    })
    .select('id')
    .single()
  if (error) return { ...base, error: error.message }
  return { ...base, alertId: data.id as string, sentToBackend: true }
}

/** Only the first answer wins; the database function enforces it. */
export async function answerAlert(alertId: string) {
  if (!supabase) return
  await supabase.rpc('answer_alert', { p_alert: alertId })
}

/** Live feed of alerts for one circle. */
export function useAlertFeed(
  groupId: string | undefined,
  handlers: { onInsert: (a: AlertRow) => void; onUpdate: (a: AlertRow) => void },
) {
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    if (!supabase || !groupId) return
    const client = supabase
    const ch = client
      .channel(`alerts:${groupId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts', filter: `group_id=eq.${groupId}` },
        (p) => ref.current.onInsert(p.new as AlertRow))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'alerts', filter: `group_id=eq.${groupId}` },
        (p) => ref.current.onUpdate(p.new as AlertRow))
      .subscribe()
    return () => void client.removeChannel(ch)
  }, [groupId])
}
