import { playClip, type Clip } from '../lib/voice'

export type TranscriptLine = { id: number; who: string; text: string; audio?: Clip }

/**
 * Message log. For now each hold-to-talk message appears as a voice clip with a replay button.
 * Real speech-to-text (written transcript) is a later step and will fill `text`.
 */
export default function Transcript({ lines }: { lines: TranscriptLine[] }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-ink/5">
      <h2 className="mb-2 font-semibold">Messages</h2>
      {lines.length === 0 ? (
        <p className="text-sm text-ink/50">Walkie-talkie messages will show here.</p>
      ) : (
        <ul className="space-y-2">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="font-semibold">{l.who}: </span>
                {l.text}
              </span>
              {l.audio && (
                <button onClick={() => playClip(l.audio!)} className="shrink-0 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">
                  ▶ Play
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
