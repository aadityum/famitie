import { useRef, useState } from 'react'

type Props = {
  onSos: () => void
  onCome: () => void
  onTalkChange: (talking: boolean) => void
  /** Family members currently online; undefined in demo mode. */
  onlineCount?: number
}

/** The circular control cluster: PTT in the centre, SOS and "Come for a sec" as satellites. */
export default function CircleHome({ onSos, onCome, onTalkChange, onlineCount }: Props) {
  const [talking, setTalking] = useState(false)
  const active = useRef(false)

  const start = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    if (active.current) return
    active.current = true
    setTalking(true)
    onTalkChange(true)
  }
  const stop = () => {
    if (!active.current) return
    active.current = false
    setTalking(false)
    onTalkChange(false)
  }

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[420px]">
      {/* voice pulse rings */}
      {talking && (
        <>
          <span className="pointer-events-none absolute inset-[30%] rounded-full border-4 border-brand animate-ring" />
          <span className="pointer-events-none absolute inset-[30%] rounded-full border-4 border-brand animate-ring-slow" />
        </>
      )}

      {/* walkie-talkie (PTT), centre */}
      <button
        aria-label="Hold to talk"
        onPointerDown={start}
        onPointerUp={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
        className={`absolute inset-[30%] flex select-none touch-none flex-col items-center justify-center gap-1 rounded-full text-white shadow-xl transition-transform ${
          talking ? 'scale-95 bg-ink' : 'bg-brand'
        }`}
      >
        <MicIcon />
        <span className="text-sm font-semibold sm:text-base">
          {talking ? 'Talking…' : 'Hold to talk'}
        </span>
      </button>

      {/* SOS, top */}
      <button
        aria-label="SOS"
        onClick={onSos}
        className="absolute left-1/2 top-0 flex h-[26%] w-[26%] -translate-x-1/2 flex-col items-center justify-center rounded-full bg-red-600 text-white shadow-lg active:scale-95"
      >
        <span className="text-xl font-extrabold tracking-wide sm:text-2xl">SOS</span>
      </button>

      {/* Come for a sec, bottom-left */}
      <button
        aria-label="Come for a sec"
        onClick={onCome}
        className="absolute bottom-[4%] left-[3%] flex h-[26%] w-[26%] flex-col items-center justify-center rounded-full bg-white text-center text-ink shadow-lg ring-2 ring-brand/40 active:scale-95"
      >
        <span className="text-[11px] font-bold leading-tight sm:text-sm">
          Come for
          <br />a sec
        </span>
      </button>

      {/* family online, bottom-right (status only, not a button) */}
      <div
        role="status"
        aria-label={onlineCount === undefined ? 'Family online: not connected' : `${onlineCount} family online`}
        className="absolute bottom-[4%] right-[3%] flex h-[26%] w-[26%] flex-col items-center justify-center rounded-full bg-white/80 text-center ring-1 ring-ink/10"
      >
        <span className="text-2xl font-extrabold leading-none text-ink sm:text-3xl">{onlineCount ?? '–'}</span>
        <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-ink/60 sm:text-xs">
          <span className={`h-2 w-2 rounded-full ${onlineCount ? 'bg-green-500' : 'bg-ink/20'}`} />
          online
        </span>
      </div>
    </div>
  )
}

function MicIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  )
}
