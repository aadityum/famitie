import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Clip = { mime: string; b64: string; seconds: number }
export type PttMessage = Clip & { fromId: string; fromName: string }

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

export function playClip(c: Clip) {
  void new Audio(`data:${c.mime};base64,${c.b64}`).play().catch(() => {})
}

/**
 * One private channel per circle: who is online (presence) + voice clips (broadcast).
 * Only circle members can join it (see migration 0002).
 */
export function useGroupChannel(
  groupId: string | undefined,
  me: { id: string; name: string } | null,
  onClip: (m: PttMessage) => void,
) {
  const [online, setOnline] = useState<Set<string>>(new Set())
  const chRef = useRef<RealtimeChannel | null>(null)
  const clipRef = useRef(onClip)
  clipRef.current = onClip

  useEffect(() => {
    if (!supabase || !groupId || !me) return
    const client = supabase
    const ch = client.channel(`group:${groupId}`, { config: { private: true, presence: { key: me.id } } })
    ch.on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(ch.presenceState()))))
      .on('broadcast', { event: 'ptt' }, ({ payload }) => clipRef.current(payload as PttMessage))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void ch.track({ name: me.name })
      })
    chRef.current = ch
    return () => {
      chRef.current = null
      void client.removeChannel(ch)
    }
  }, [groupId, me?.id, me?.name])

  const sendClip = useCallback((m: PttMessage) => {
    void chRef.current?.send({ type: 'broadcast', event: 'ptt', payload: m })
  }, [])

  return { online, sendClip }
}
