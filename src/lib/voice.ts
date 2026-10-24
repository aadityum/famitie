import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Clip = { mime: string; b64: string; seconds: number }
/** What travels over the live channel: the audio is encrypted, only these labels are readable. */
export type PttMessage = {
  id: string
  fromId: string
  fromName: string
  seconds: number
  /** ms since epoch when the sender's setting makes it disappear */
  expiresAt?: number
  iv: string
  ct: string
  v: number
}

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

// iOS WebView records AAC in mp4; Chromium (Android) records webm/opus.
const MIMES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
const MAX_MS = 15_000 // keeps each clip well under the realtime message size limit
const MIN_MS = 400 // ignore accidental taps

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.readAsDataURL(blob)
  })

export type Recording = { stop: () => Promise<Clip | null> }

/** Records the microphone until stop() (or 15 s). */
export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32_000 })
  const chunks: Blob[] = []
  const t0 = Date.now()
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)

  const done = new Promise<Clip | null>((resolve) => {
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      const ms = Date.now() - t0
      if (!chunks.length || ms < MIN_MS) return resolve(null)
      const blob = new Blob(chunks, { type: rec.mimeType || mime })
      resolve({ mime: blob.type, b64: await toBase64(blob), seconds: Math.max(1, Math.round(ms / 1000)) })
    }
  })
  rec.start()
  const timer = setTimeout(() => rec.state !== 'inactive' && rec.stop(), MAX_MS)

  return {
    stop: () => {
      clearTimeout(timer)
      if (rec.state !== 'inactive') rec.stop()
      return done
    },
  }
}

export type SavedClip = { id: string; senderId: string; seconds: number; iv: string | null; v: number | null; audio: string; expiresAt: number }

/**
 * Saves a clip so people who were offline can still hear it. The database stamps the expiry from the
 * sender's "keep my recordings" setting (30 minutes by default, 6 hours at most) and deletes it then.
 * The live delivery does not depend on this, so a failure here is harmless.
 */
export async function saveClip(groupId: string, senderId: string, id: string, seconds: number, sealed: { iv: string; ct: string; version: number }) {
  if (!supabase) return
  await supabase.from('voice_clips').insert({
    id,
    group_id: groupId,
    sender_id: senderId,
    seconds: Math.min(20, Math.max(1, seconds)),
    mime: 'encrypted',
    audio: sealed.ct,
    iv: sealed.iv,
    key_version: sealed.version,
  })
}

/** Clips in this circle that have not expired yet (expired ones are hidden by the database). */
export async function loadRecentClips(groupId: string): Promise<SavedClip[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('voice_clips')
    .select('id, sender_id, seconds, audio, iv, key_version, expires_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
    .limit(30)
  type Row = { id: string; sender_id: string; seconds: number; audio: string; iv: string | null; key_version: number | null; expires_at: string }
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    senderId: r.sender_id,
    seconds: r.seconds,
    iv: r.iv,
    v: r.key_version,
    audio: r.audio,
    expiresAt: new Date(r.expires_at).getTime(),
  }))
}

export async function deleteSavedClip(id: string) {
  if (!supabase) return
  await supabase.from('voice_clips').delete().eq('id', id)
}

export function playClip(c: Clip) {
  void new Audio(`data:${c.mime};base64,${c.b64}`).play().catch(() => {})
}

export type GroupHandlers = {
  onClip: (m: PttMessage) => void
  /** The sender deleted a clip: remove it from this screen too. */
  onClipDeleted: (d: { id: string; fromId: string }) => void
  /** Someone joined, left, was removed or became admin: refresh the member list. */
  onMembersChanged: () => void
}

/**
 * One private channel per circle: who is online (presence), voice clips and small
 * "something changed" signals (broadcast). Only circle members can join it (see migration 0002).
 */
export function useGroupChannel(
  groupId: string | undefined,
  me: { id: string; name: string } | null,
  handlers: GroupHandlers,
  /** false = "appear offline": still receive everything, but do not show a green dot to others. */
  visible = true,
) {
  const [online, setOnline] = useState<Set<string>>(new Set())
  const chRef = useRef<RealtimeChannel | null>(null)
  const hRef = useRef(handlers)
  hRef.current = handlers

  useEffect(() => {
    if (!supabase || !groupId || !me) return
    const client = supabase
    const ch = client.channel(`group:${groupId}`, { config: { private: true, presence: { key: me.id } } })
    ch.on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(ch.presenceState()))))
      .on('broadcast', { event: 'ptt' }, ({ payload }) => hRef.current.onClip(payload as PttMessage))
      .on('broadcast', { event: 'ptt-delete' }, ({ payload }) =>
        hRef.current.onClipDeleted(payload as { id: string; fromId: string }),
      )
      .on('broadcast', { event: 'members' }, () => hRef.current.onMembersChanged())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && visible) void ch.track({ name: me.name })
      })
    chRef.current = ch
    return () => {
      chRef.current = null
      void client.removeChannel(ch)
    }
  }, [groupId, me?.id, me?.name, visible])

  const sendClip = useCallback((m: PttMessage) => {
    void chRef.current?.send({ type: 'broadcast', event: 'ptt', payload: m })
  }, [])

  const sendClipDelete = useCallback((id: string, fromId: string) => {
    void chRef.current?.send({ type: 'broadcast', event: 'ptt-delete', payload: { id, fromId } })
  }, [])

  const announceMembersChanged = useCallback(() => {
    void chRef.current?.send({ type: 'broadcast', event: 'members', payload: {} })
  }, [])

  return { online, sendClip, sendClipDelete, announceMembersChanged }
}
