import { useState } from 'react'
import { roleLabel, type Circle, type Member, type MemberLoc } from '../lib/circles'

type Props = {
  circle: Circle
  meId: string
  members: Member[]
  locs: Record<string, MemberLoc>
  online: Set<string>
}

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`
}

export default function Members({ circle, meId, members, locs, online }: Props) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(circle.inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard can be unavailable in some webviews; the code is shown anyway */
    }
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-ink/5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold">{circle.name}</h2>
        <button onClick={copy} className="rounded-lg bg-ink/5 px-3 py-1.5 text-xs font-semibold">
          Invite code: <span className="font-mono">{circle.inviteCode}</span> {copied ? '✓' : ''}
        </button>
      </div>

      <ul className="space-y-2">
        {members.map((m) => {
          const loc = locs[m.userId]
          return (
            <li key={m.userId} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${online.has(m.userId) ? 'bg-green-500' : 'bg-ink/20'}`} />
                <span className="font-medium">{m.userId === meId ? `${m.name} (you)` : m.name}</span>
                <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] text-ink/60">{roleLabel(m.role)}</span>
              </span>
              {loc && m.userId !== meId && (
                <a
                  href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-brand underline"
                >
                  Location · {ago(loc.updatedAt)}
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
