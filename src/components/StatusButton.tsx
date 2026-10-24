import { useState } from 'react'
import { DURATIONS, STATUS_INFO, effectiveStatus, type MyStatus, type StatusKind } from '../lib/status'

type Props = { my: MyStatus; onChange: (patch: Partial<MyStatus>) => void; error?: string | null }

/** Tiny pill in the header: shows your status and opens a small menu to change it. */
export default function StatusButton({ my, onChange, error }: Props) {
  const [open, setOpen] = useState(false)
  const st = effectiveStatus(my.status, my.until)
  const info = STATUS_INFO[st]

  const pick = (kind: StatusKind, min: number) => {
    onChange({
      status: kind,
      until: kind === 'available' || min === 0 ? null : new Date(Date.now() + min * 60_000).toISOString(),
    })
    setOpen(false)
  }
  const [dur, setDur] = useState(60)

  return (
    <span className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Change my status"
        className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold"
      >
        <span>{info.icon}</span>
        <span className="max-w-[5.5rem] truncate">{info.label}</span>
        {my.silent && <span title="Silent">🔕</span>}
        {my.appearOffline && <span title="Appearing offline">👻</span>}
      </button>

      {open && (
        <>
          <button aria-label="Close" className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-2 w-64 rounded-2xl bg-white p-3 text-ink shadow-xl ring-1 ring-ink/10">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">My status</p>
            <div className="space-y-1">
              {(Object.keys(STATUS_INFO) as StatusKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => pick(k, dur)}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${
                    st === k ? 'bg-brand/10 font-semibold' : 'hover:bg-ink/5'
                  }`}
                >
                  <span>{STATUS_INFO[k].icon}</span>
                  {STATUS_INFO[k].label}
                </button>
              ))}
            </div>

            <label className="mt-2 block text-xs text-ink/60">
              For
              <select
                value={dur}
                onChange={(e) => setDur(Number(e.target.value))}
                className="ml-2 rounded-lg border border-ink/15 bg-white px-2 py-1 text-xs text-ink"
              >
                {DURATIONS.map((d) => (
                  <option key={d.min} value={d.min}>{d.label}</option>
                ))}
              </select>
            </label>

            <div className="mt-3 space-y-2 border-t border-ink/10 pt-3 text-sm">
              <Toggle label="🔕 Silent mode" hint="No sound for voice or Come for a sec" on={my.silent} onChange={(v) => onChange({ silent: v })} />
              <Toggle label="👻 Appear offline" hint="Hide my green dot" on={my.appearOffline} onChange={(v) => onChange({ appearOffline: v })} />
              <Toggle label="🚨 SOS always rings" hint="Even in a meeting, asleep or silent" on={my.sosBreakthrough} onChange={(v) => onChange({ sosBreakthrough: v })} />
            </div>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </div>
        </>
      )}
    </span>
  )
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} role="switch" aria-checked={on} className="flex w-full items-center justify-between gap-3 text-left">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-[11px] text-ink/50">{hint}</span>
      </span>
      <span className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${on ? 'bg-brand' : 'bg-ink/20'}`}>
        <span className={`h-4 w-4 rounded-full bg-white transition ${on ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  )
}
