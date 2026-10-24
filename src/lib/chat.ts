import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import type { Keyring } from './keyring'

export type ChatMessage = { id: string; groupId: string; senderId: string; body: string; createdAt: string; locked?: boolean }

type Row = {
  id: string
  group_id: string
  sender_id: string
  body: string
  created_at: string
  iv: string | null
  key_version: number | null
}
const COLS = 'id, group_id, sender_id, body, created_at, iv, key_version'

const LOAD_LIMIT = 100
export const MAX_CHAT_LENGTH = 1000
const LOCKED_TEXT = '🔒 This message can’t be opened on this device yet.'

/**
 * Saved text chat for a circle. Messages are encrypted on the sender's phone and opened here,
 * so the server only ever stores scrambled text.
 */
export function useChat(groupId: string | undefined, meId: string | undefined, keys: Keyring) {
  const [raw, setRaw] = useState<Row[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const opened = useRef(new Map<string, string>()) // id -> plain text
  const keysRef = useRef(keys)
  keysRef.current = keys

  useEffect(() => {
    if (!supabase || !groupId) return
    const client = supabase
    let alive = true
    setRaw([])
    opened.current.clear()

    ;(async () => {
      const { data, error: e } = await client
        .from('messages')
        .select(COLS)
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(LOAD_LIMIT)
      if (!alive) return
      if (e) {
        setError('Chat is not set up yet. Run migrations 0003 and 0006 in Supabase.')
        return
      }
      setRaw((data as Row[]).reverse())
    })()

    const ch = client
      .channel(`chat:${groupId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${groupId}` },
        (p) => {
          const m = p.new as Row
          setRaw((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
        },
      )
      // Deleted rows only carry their id; ids are unique, so no group filter is needed.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (p) => {
        const id = (p.old as { id?: string }).id
        if (id) setRaw((prev) => prev.filter((x) => x.id !== id))
      })
      .subscribe()

    return () => {
      alive = false
      void client.removeChannel(ch)
    }
  }, [groupId])

  // Open (decrypt) whatever we can. Runs again when new keys arrive.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const out: ChatMessage[] = []
      for (const r of raw) {
        let text = opened.current.get(r.id)
        let locked = false
        if (text === undefined) {
          if (r.iv && r.key_version != null) {
            const t = await keysRef.current.open({ iv: r.iv, ct: r.body, version: r.key_version })
            if (t === null) locked = true
            else {
              text = t
              opened.current.set(r.id, t)
            }
          } else {
            text = r.body // sent before encryption was switched on
          }
        }
        out.push({
          id: r.id,
          groupId: r.group_id,
          senderId: r.sender_id,
          body: locked ? LOCKED_TEXT : (text as string),
          createdAt: r.created_at,
          locked,
        })
      }
      if (alive) setMessages(out)
    })()
    return () => {
      alive = false
    }
  }, [raw, keys.epoch])

  const send = useCallback(
    async (text: string) => {
      const body = text.trim().slice(0, MAX_CHAT_LENGTH)
      if (!supabase || !groupId || !meId || !body) return false
      setError(null)
      let sealed
      try {
        sealed = await keysRef.current.seal(body)
      } catch {
        setError('Secure messaging is still getting ready. Try again in a moment.')
        return false
      }
      const { data, error: e } = await supabase
        .from('messages')
        .insert({ group_id: groupId, sender_id: meId, body: sealed.ct, iv: sealed.iv, key_version: sealed.version })
        .select(COLS)
        .single()
      if (e || !data) {
        setError('Could not send that message.')
        return false
      }
      const m = data as Row
      opened.current.set(m.id, body)
      setRaw((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
      return true
    },
    [groupId, meId],
  )

  const remove = useCallback(
    async (id: string) => {
      if (!supabase) return
      const before = raw
      setRaw((prev) => prev.filter((x) => x.id !== id))
      const { error: e } = await supabase.from('messages').delete().eq('id', id)
      if (e) {
        setRaw(before)
        setError('Could not delete that message.')
      }
    },
    [raw],
  )

  return { messages, send, remove, error }
}
