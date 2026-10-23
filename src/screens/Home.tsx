import { useCallback, useEffect, useRef, useState } from 'react'
import CircleHome from '../components/CircleHome'
import AlertCountdown from '../components/AlertCountdown'
import IncomingAlert from '../components/IncomingAlert'
import LocationToggle from '../components/LocationToggle'
import Members from '../components/Members'
import Transcript, { type TranscriptLine } from '../components/Transcript'
import { sendAlert, answerAlert, useAlertFeed, type AlertType, type AlertResult, type AlertRow } from '../lib/alerts'
import { useMembers, type Circle } from '../lib/circles'
import { playClip, startRecording, useGroupChannel, type PttMessage, type Recording } from '../lib/voice'
import { startRing } from '../lib/ring'

type Props = {
  me: { id: string; name: string } | null
  circle: Circle | null
  onSignOut?: () => void
}

/** Main screen. With no `circle` it runs as a local demo (no backend). */
export default function Home({ me, circle, onSignOut }: Props) {
  const [pending, setPending] = useState<AlertType | null>(null)
  const [last, setLast] = useState<AlertResult | null>(null)
  const [incoming, setIncoming] = useState<AlertRow | null>(null)
  const [talking, setTalking] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [lines, setLines] = useState<TranscriptLine[]>([])

  const { members, locs, reload } = useMembers(circle)
  const nameOf = useCallback(
    (id: string) => members.find((m) => m.userId === id)?.name ?? 'A family member',
    [members],
  )

  // ── voice + presence ──
  const lineId = useRef(0)
  const addLine = (l: Omit<TranscriptLine, 'id'>) => setLines((p) => [{ ...l, id: ++lineId.current }, ...p].slice(0, 30))

  const onClip = useCallback((m: PttMessage) => {
    addLine({ who: m.fromName, text: `Voice message · ${m.seconds}s`, audio: m })
    playClip(m)
  }, [])
  const { online, sendClip } = useGroupChannel(circle?.id, me, onClip)
  useEffect(reload, [online.size, reload])

  const holding = useRef(false)
  const rec = useRef<Recording | null>(null)
  const onTalkChange = async (t: boolean) => {
    setTalking(t)
    holding.current = t
    if (!circle || !me) return
    if (t) {
      setMicError(null)
      try {
        const r = await startRecording()
        if (holding.current) rec.current = r
        else void r.stop() // released before the mic was ready
      } catch {
        setMicError('Microphone permission is needed to talk.')
      }
    } else {
      const r = rec.current
      rec.current = null
      const clip = await r?.stop()
      if (clip) {
        sendClip({ ...clip, fromId: me.id, fromName: me.name })
        addLine({ who: 'You', text: `Voice message · ${clip.seconds}s`, audio: clip })
      }
    }
  }

  // ── sending alerts ──
  const confirm = useCallback(async () => {
    if (!pending) return
    const type = pending
    setPending(null)
    setLast(await sendAlert(type, { groupId: circle?.id, senderId: me?.id }))
  }, [pending, circle?.id, me?.id])

  // ── receiving alerts (live) ──
  const stopRing = useRef<(() => void) | null>(null)
  const incomingId = useRef<string | null>(null)
  const clearIncoming = useCallback(() => {
    stopRing.current?.()
    stopRing.current = null
    incomingId.current = null
    setIncoming(null)
  }, [])

  useAlertFeed(circle?.id, {
    onInsert: (a) => {
      if (a.sender_id === me?.id) return
      stopRing.current?.()
      stopRing.current = startRing(a.type === 'sos')
      incomingId.current = a.id
      setIncoming(a)
    },
    onUpdate: (a) => {
      // someone answered: stop ringing here too, and tell the sender
      if (incomingId.current === a.id && a.status !== 'ringing') clearIncoming()
      setLast((prev) =>
        prev && prev.alertId === a.id ? { ...prev, status: a.status, answeredBy: a.answered_by } : prev,
      )
    },
  })
  useEffect(() => () => stopRing.current?.(), [])

  const answer = async () => {
    if (!incoming) return
    await answerAlert(incoming.id)
    clearIncoming()
  }

  return (
    <div className="safe-pad min-h-full">
      <header className="flex items-center justify-between bg-brand px-5 py-3 text-white">
        <h1 className="text-lg font-bold">FamiTie</h1>
        <span className="flex items-center gap-3 text-xs">
          <span className="opacity-80">{me ? me.name : 'Demo mode: backend not connected'}</span>
          {onSignOut && (
            <button onClick={onSignOut} className="rounded-full bg-white/20 px-3 py-1 font-semibold">Sign out</button>
          )}
        </span>
      </header>

      {/* phone: stacked. tablet (md+): circle left, panels right */}
      <main className="mx-auto grid max-w-5xl gap-6 p-5 md:grid-cols-2 md:items-start md:p-10">
        <div>
          <CircleHome
            onSos={() => setPending('sos')}
            onCome={() => setPending('come_for_a_sec')}
            onTalkChange={onTalkChange}
            onlineCount={circle ? online.size : undefined}
          />
          <p className="mt-4 text-center text-sm text-ink/60">
            {micError ?? (talking ? 'Release to send' : circle ? 'Hold the centre button to talk' : 'Hold to talk (demo: no audio sent)')}
          </p>
        </div>

        <div className="space-y-4">
          {circle && me && <Members circle={circle} meId={me.id} members={members} locs={locs} online={online} />}
          <LocationToggle userId={me?.id} />
          {last && <AlertStatus last={last} nameOf={nameOf} />}
          <Transcript lines={lines} />
        </div>
      </main>

      {pending && <AlertCountdown type={pending} onConfirm={confirm} onCancel={() => setPending(null)} />}
      {incoming && (
        <IncomingAlert alert={incoming} senderName={nameOf(incoming.sender_id)} onAnswer={answer} onDismiss={clearIncoming} />
      )}
    </div>
  )
}

function AlertStatus({ last, nameOf }: { last: AlertResult; nameOf: (id: string) => string }) {
  const label = last.type === 'sos' ? 'SOS' : 'Come for a sec'
  return (
    <section className="rounded-2xl bg-white p-4 text-sm shadow-sm ring-1 ring-ink/5">
      <p className="font-semibold">{label} sent</p>
      {last.error ? (
        <p className="text-red-600">Could not send: {last.error}</p>
      ) : last.sentToBackend ? (
        <p className={last.status === 'answered' ? 'font-semibold text-green-600' : 'text-ink/60'}>
          {last.status === 'answered' && last.answeredBy
            ? `${nameOf(last.answeredBy)} answered`
            : 'Ringing your family circle… waiting for an answer'}
        </p>
      ) : (
        <p className="text-ink/60">Demo mode: nothing was sent to anyone.</p>
      )}
      <p className="mt-1 text-xs text-ink/50">
        {last.fix ? `Location attached: ${last.fix.lat.toFixed(5)}, ${last.fix.lng.toFixed(5)}` : 'No location fix available'}
      </p>
    </section>
  )
}
