import { useEffect, useRef, useState, type FormEvent } from 'react'
import { playClip, type Clip } from '../lib/voice'
import { MAX_CHAT_LENGTH } from '../lib/chat'

/** One entry in the timeline: a saved text message or a (temporary) voice clip. */
export type Item =
  | { kind: 'chat'; id: string; fromId: string; who: string; at: number; text: string }
  | { kind: 'voice'; id: string; fromId: string; who: string; at: number; seconds: number; audio: Clip; expiresAt: number }

type Props = {
  items: Item[]
  meId: string | undefined
  /** Current time (ms), refreshed by the parent so expiry text stays right. */
  now: number
  /** The admin may delete anyone's text messages. */
  isAdmin: boolean
  /** No composer in demo mode (nothing to send to). */
  canChat: boolean
  error?: string | null
  onSend: (text: string) => Promise<boolean>
  onDeleteChat: (id: string) => void
  /** Sender deletes their own clip for everyone. */
  onDeleteVoice: (id: string) => void
  /** Hide someone else's clip on this device only. */
  onHideVoice: (id: string) => void
}

const timeLabel = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

const expiresIn = (expiresAt: number, now: number) => {
  const min = Math.ceil((expiresAt - now) / 60_000)
  if (min <= 1) return 'disappears in under a minute'
  if (min < 60) return `disappears in ${min} min`
  return `disappears in ${Math.floor(min / 60)} h ${min % 60} min`
}

const smallBtn = 'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold'

/** Chat + walkie-talkie clips in one timeline, oldest at the top, newest at the bottom. */
export default function Messages({ items, meId, now, isAdmin, canChat, error, onSend, onDeleteChat, onDeleteVoice, onHideVoice }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Keep the newest message in view, without scrolling the whole page.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items.length])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true)
    const ok = await onSend(text)
    setBusy(false)
    if (ok) setText('')
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-ink/5">
      <h2 className="mb-2 font-semibold">Messages</h2>

      <div ref={listRef} className="max-h-80 min-h-24 space-y-2 overflow-y-auto pr-1">
        {items.length === 0 && (
          <p className="text-sm text-ink/50">
            {canChat ? 'Type a message below, or hold the centre button to talk.' : 'Walkie-talkie messages will show here.'}
          </p>
        )}

        {items.map((it) => {
          const mine = it.fromId === meId
          return (
            <div key={`${it.kind}-${it.id}`} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-brand/10' : 'bg-ink/5'}`}>
                <p className="mb-0.5 text-[11px] font-semibold text-ink/50">
                  {mine ? 'You' : it.who} · {timeLabel(it.at)}
                </p>

                {it.kind === 'chat' ? (
                  <>
                    <p className="whitespace-pre-wrap break-words">{it.text}</p>
                    {(mine || isAdmin) && (
                      <button
                        onClick={() => onDeleteChat(it.id)}
                        className="mt-1 text-xs font-semibold text-red-600"
                        aria-label="Delete message"
                      >
                        Delete
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="whitespace-nowrap">🎙 Voice · {it.seconds}s</span>
                    <button onClick={() => playClip(it.audio)} className={`${smallBtn} bg-brand text-white`}>
                      ▶ Play
                    </button>
                    {mine ? (
                      <button
                        onClick={() => onDeleteVoice(it.id)}
                        className={`${smallBtn} bg-red-50 text-red-600`}
                        title="Deletes it for everyone"
                      >
                        Delete
                      </button>
                    ) : (
                      <button
                        onClick={() => onHideVoice(it.id)}
                        className={`${smallBtn} bg-ink/10 text-ink/70`}
                        title="Removes it from your screen only"
                      >
                        Remove
                      </button>
                    )}
                    <span className="basis-full text-[11px] text-ink/40">{expiresIn(it.expiresAt, now)}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {canChat && (
        <form onSubmit={submit} className="mt-3 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_CHAT_LENGTH}
            placeholder="Type a message…"
            enterKeyHint="send"
            className="min-w-0 flex-1 rounded-xl border border-ink/15 px-3 py-2.5 text-base outline-none focus:border-brand"
          />
          <button
            disabled={busy || !text.trim()}
            className="shrink-0 rounded-xl bg-brand px-4 py-2.5 font-bold text-white disabled:opacity-50"
          >
            Send
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {canChat && (
        <p className="mt-2 text-[11px] text-ink/40">
          Text messages are saved. Voice clips disappear after the time their sender chose in Settings (30 minutes by default).
        </p>
      )}
    </section>
  )
}
