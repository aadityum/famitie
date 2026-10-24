import { useState } from 'react'
import { STATUS_INFO, effectiveStatus } from '../lib/status'
import {
  INACTIVE_DAYS,
  isInactive,
  leaveCircle,
  makeAdmin,
  removeMember,
  roleLabel,
  type Circle,
  type Member,
  type MemberLoc,
} from '../lib/circles'

type Props = {
  circle: Circle
  meId: string
  members: Member[]
  locs: Record<string, MemberLoc>
  online: Set<string>
  /** Called after any change to who is in the circle or who is admin. */
  onChanged: () => void
  /** Called after you leave, so the app can move on to the set-up screen. */
  onLeft: () => void
}

const LIVE_WITHIN_MS = 10 * 60_000 // a location newer than this counts as "live"

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86_400)} d ago`
}

export default function Members({ circle, meId, members, locs, online, onChanged, onLeft }: Props) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const me = members.find((m) => m.userId === meId)
  const iAmAdmin = !!me?.isAdmin

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(circle.inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard can be unavailable in some webviews; the code is shown anyway */
    }
  }

  const run = async (action: () => Promise<void>, after: () => void) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      after()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const leave = () => {
    const others = members.length - 1
    const note = !iAmAdmin
      ? ''
      : others > 0
        ? '\n\nYou are the admin, so admin will pass to another member automatically.'
        : '\n\nYou are the only member, so the circle will be deleted.'
    if (window.confirm(`Leave "${circle.name}"?${note}`)) void run(() => leaveCircle(circle.id), onLeft)
  }

  const remove = (m: Member) => {
    if (window.confirm(`Remove ${m.name} from "${circle.name}"? They will need the invite code to join again.`))
      void run(() => removeMember(circle.id, m.userId), onChanged)
  }

  const promote = (m: Member) => {
    if (window.confirm(`Make ${m.name} the admin? You will no longer be the admin.`))
      void run(() => makeAdmin(circle.id, m.userId), onChanged)
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-ink/5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold">{circle.name}</h2>
        <button onClick={copy} className="rounded-lg bg-ink/5 px-3 py-1.5 text-xs font-semibold">
          Invite code: <span className="font-mono">{circle.inviteCode}</span> {copied ? '✓' : ''}
        </button>
      </div>

      <ul className="space-y-3">
        {members.map((m) => {
          const loc = locs[m.userId]
          const isMe = m.userId === meId
          const live = loc && Date.now() - new Date(loc.updatedAt).getTime() < LIVE_WITHIN_MS
          const inactive = isInactive(m) && !online.has(m.userId)
          return (
            <li key={m.userId} className="text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${online.has(m.userId) ? 'bg-green-500' : 'bg-ink/20'}`} />
                  <span className="font-medium">{isMe ? `${m.name} (you)` : m.name}</span>
                  {m.isAdmin && (
                    <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-semibold text-brand">Admin</span>
                  )}
                  <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] text-ink/60">{roleLabel(m.role)}</span>
                  {effectiveStatus(m.status, m.statusUntil) !== 'available' && (
                    <span
                      className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-semibold text-ink/70"
                      title={m.statusUntil ? `Until ${new Date(m.statusUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : undefined}
                    >
                      {STATUS_INFO[effectiveStatus(m.status, m.statusUntil)].icon} {STATUS_INFO[effectiveStatus(m.status, m.statusUntil)].label}
                    </span>
                  )}
                  {inactive && (
                    <span
                      className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                      title={`Has not opened FamiTie for over ${INACTIVE_DAYS} days`}
                    >
                      Inactive
                    </span>
                  )}
                </span>
                {loc && !isMe && (
                  <a
                    href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className={`shrink-0 text-xs font-semibold underline ${live ? 'text-brand' : 'text-ink/50'}`}
                  >
                    {live ? '● Live' : 'Last seen'} · {ago(loc.updatedAt)}
                  </a>
                )}
              </div>

              {iAmAdmin && !isMe && (
                <div className="mt-1.5 flex gap-2 pl-4">
                  <button
                    disabled={busy}
                    onClick={() => promote(m)}
                    className="rounded-full bg-ink/5 px-3 py-1 text-xs font-semibold disabled:opacity-50"
                  >
                    Make admin
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => remove(m)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50 ${
                      inactive ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600'
                    }`}
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        disabled={busy}
        onClick={leave}
        className="mt-4 w-full rounded-xl border border-red-200 py-2 text-sm font-semibold text-red-600 disabled:opacity-50"
      >
        Leave circle
      </button>
    </section>
  )
}
