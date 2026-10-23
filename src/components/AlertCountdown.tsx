import { useEffect, useState } from 'react'
import type { AlertType } from '../lib/alerts'

type Props = { type: AlertType; onConfirm: () => void; onCancel: () => void }

const SECONDS = 3

/** Short cancel window so an accidental tap doesn't ring the whole family. */
export default function AlertCountdown({ type, onConfirm, onCancel }: Props) {
  const [left, setLeft] = useState(SECONDS)

  useEffect(() => {
    if (left === 0) {
      onConfirm()
      return
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [left, onConfirm])

  const sos = type === 'sos'
  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 p-8 text-white ${sos ? 'bg-red-600' : 'bg-brand'}`}>
      <p className="text-2xl font-bold">{sos ? 'Sending SOS' : 'Asking family to come'}</p>
      <p className="text-8xl font-extrabold tabular-nums">{left}</p>
      <button onClick={onCancel} className="rounded-full bg-white px-10 py-4 text-xl font-bold text-ink shadow-lg active:scale-95">
        Cancel
      </button>
    </div>
  )
}
