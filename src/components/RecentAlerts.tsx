import type { AlertRow } from '../lib/alerts'
import { minutesLabel } from '../lib/settings'

type Props = {
  alerts: AlertRow[]
  meId: string
  nameOf: (id: string) => string
  /** Answered alerts stay visible this long (minutes), set by the person in Settings. */
  windowMin: number
  now: number
  onOpenSettings: () => void
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

const gap = (fromIso: string, toIso: string) => {
  const s = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000))
  return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`
}

const sinceText = (iso: string, now: number) => {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`
}

/** The last SOS / "Come for a sec" calls in the circle, and who responded to each. */
export default function RecentAlerts({ alerts, meId, nameOf, windowMin, now, onOpenSettings }: Props) {
  const visible = alerts
    .filter((a) => {
      const anchor = new Date(a.answered_at ?? a.created_at).getTime()
      // An alert nobody answered stays for at least an hour, so "nobody answered" is never missed.
      const holdMin = a.answered_at ? windowMin : Math.max(windowMin, 60)
      return now < anchor + holdMin * 60_000
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  if (visible.length === 0) return null

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-ink/5">
      <h2 className="mb-3 font-semibold">Recent alerts</h2>
      <ul className="space-y-3">
        {visible.map((a) => {
          const sos = a.type === 'sos'
          const mine = a.sender_id === meId
          const who = mine ? 'You' : nameOf(a.sender_id)
          const answered = a.status === 'answered' && a.answered_by
          const waitedMs = now - new Date(a.created_at).getTime()
          return (
            <li key={a.id} className="text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-semibold">
                  <span className={`h-2.5 w-2.5 rounded-full ${sos ? 'bg-red-600' : 'bg-brand'}`} />
                  {sos ? 'SOS' : 'Come for a sec'} from {who}
                </span>
                <span className="shrink-0 text-xs text-ink/50">{clock(a.created_at)}</span>
              </div>

              {answered ? (
                <p className="mt-0.5 pl-4 font-semibold text-green-700">
                  ✓ {a.answered_by === meId ? 'You' : nameOf(a.answered_by!)} answered
                  {a.answered_at && <span className="font-normal text-ink/60"> · {clock(a.answered_at)} ({gap(a.created_at, a.answered_at)} after)</span>}
                </p>
              ) : a.status === 'cancelled' ? (
                <p className="mt-0.5 pl-4 text-ink/60">Cancelled</p>
              ) : waitedMs < 120_000 ? (
                <p className="mt-0.5 pl-4 text-ink/60">Ringing… waiting for someone to answer</p>
              ) : (
                <p className="mt-0.5 pl-4 font-semibold text-amber-700">
                  Nobody has answered yet <span className="font-normal">· sent {sinceText(a.created_at, now)}</span>
                </p>
              )}

              {a.lat != null && a.lng != null && (
                <a
                  href={`https://www.google.com/maps?q=${a.lat},${a.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 block pl-4 text-xs font-semibold text-brand underline"
                >
                  Where it was sent from
                </a>
              )}
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-[11px] text-ink/40">
        Alerts stay here for {minutesLabel(windowMin)} after they are answered.{' '}
        <button onClick={onOpenSettings} className="font-semibold underline">Change</button>
      </p>
    </section>
  )
}
