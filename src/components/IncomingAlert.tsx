import type { AlertRow } from '../lib/alerts'

type Props = { alert: AlertRow; senderName: string; onAnswer: () => void; onDismiss: () => void }

/** Full-screen "ringing" overlay shown to every other member of the circle. */
export default function IncomingAlert({ alert, senderName, onAnswer, onDismiss }: Props) {
  const sos = alert.type === 'sos'
  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 p-8 text-center text-white ${sos ? 'bg-red-600' : 'bg-brand'}`}>
      <p className="text-sm font-semibold uppercase tracking-widest opacity-80">{sos ? 'SOS' : 'Come for a sec'}</p>
      <p className="text-4xl font-extrabold">{senderName}</p>
      <p className="text-lg opacity-90">{sos ? 'needs help right now' : 'is asking you to come'}</p>

      {alert.lat != null && alert.lng != null && (
        <a
          href={`https://www.google.com/maps?q=${alert.lat},${alert.lng}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-white/20 px-5 py-2 text-sm font-semibold underline"
        >
          See their location
        </a>
      )}

      <div className="mt-4 flex w-full max-w-xs flex-col gap-3">
        <button onClick={onAnswer} className="rounded-full bg-white py-4 text-xl font-bold text-ink shadow-lg active:scale-95">
          I'm coming / Answer
        </button>
        <button onClick={onDismiss} className="rounded-full py-3 text-base font-semibold text-white/80">
          Dismiss
        </button>
      </div>
    </div>
  )
}
