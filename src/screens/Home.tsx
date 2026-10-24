import { useCallback, useEffect, useRef, useState } from 'react'
import CircleHome from '../components/CircleHome'
import AlertCountdown from '../components/AlertCountdown'
import IncomingAlert from '../components/IncomingAlert'
import LocationToggle from '../components/LocationToggle'
import Members from '../components/Members'
import Messages, { type Item } from '../components/Messages'
import RecentAlerts from '../components/RecentAlerts'
import Settings from './Settings'
import {
  sendAlert,
  answerAlert,
  fetchRecentAlerts,
  useAlertFeed,
  type AlertType,
  type AlertResult,
  type AlertRow,
} from '../lib/alerts'
import { touchLastSeen, useMembers, type Circle } from '../lib/circles'
import { useChat } from '../lib/chat'
import { useSettings } from '../lib/settings'
import { APP_NAME, TAGLINE } from '../lib/brand'
import {
  deleteSavedClip,
  loadRecentClips,
  newId,
  playClip,
  saveClip,
  startRecording,
  useGroupChannel,
  type Clip,
  type PttMessage,
  type Recording,
} from '../lib/voice'
import { startRing } from '../lib/ring'
import { useKeyring } from '../lib/keyring'
import KeyGate from '../components/KeyGate'
import StatusButton from '../components/StatusButton'
import { alertBehavior, clipsMayPlay, useMyStatus, useOnline } from '../lib/status'

type VoiceLine = { id: string; fromId: string; who: string; at: number; seconds: number; audio: Clip; expiresAt: number }

type Props = {
  me: { id: string; name: string; email?: string } | null
  circle: Circle | null
  onSignOut?: () => void
  /** Ask the app to reload the person's circles (after leaving or being removed). */
  onCirclesChanged?: () => void
}

/** Main screen. With no `circle` it runs as a local demo (no backend). */
export default function Home({ me, circle, onSignOut, onCirclesChanged }: Props) {
  const [pending, setPending] = useState<AlertType | null>(null)
  const [last, setLast] = useState<AlertResult | null>(null)
  const [incoming, setIncoming] = useState<AlertRow | null>(null)
  const [talking, setTalking] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [voice, setVoice] = useState<VoiceLine[]>([])
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [quiet, setQuiet] = useState(false)

  const { settings, save: saveSettings, error: settingsError } = useSettings(me?.id)
  const keys = useKeyring(me?.id, circle?.id)
  const keysRef = useRef(keys)
  keysRef.current = keys

  // Ticks every 30 s so expiring voice clips and old alerts drop off the screen by themselves.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  // ── my status (meeting / sleeping / do not disturb), silent mode, appear offline ──
  const announceRef = useRef<() => void>(() => {})
  const { my, save: saveStatus, error: statusError } = useMyStatus(me?.id, () => announceRef.current())
  const myRef = useRef(my)
  myRef.current = my
  const netOnline = useOnline()

  const { members, locs, loaded, reload } = useMembers(circle)
  const iAmAdmin = !!members.find((m) => m.userId === me?.id)?.isAdmin
  const nameOf = useCallback(
    (id: string) => members.find((m) => m.userId === id)?.name ?? 'A family member',
    [members],
  )

  // ── voice + presence ──
  const addVoice = useCallback(
    (v: VoiceLine) => setVoice((p) => (p.some((x) => x.id === v.id) ? p : [...p, v]).slice(-30)),
    [],
  )

  const onClip = useCallback(
    (m: PttMessage) => {
      void (async () => {
        const plain = await keysRef.current.open({ iv: m.iv, ct: m.ct, version: m.v })
        if (!plain) return // cannot be opened yet: it will appear from the saved copy once the key arrives
        const clip = JSON.parse(plain) as { mime: string; b64: string }
        const audio: Clip = { mime: clip.mime, b64: clip.b64, seconds: m.seconds }
        addVoice({
          id: m.id,
          fromId: m.fromId,
          who: m.fromName,
          at: Date.now(),
          seconds: m.seconds,
          audio,
          expiresAt: m.expiresAt ?? Date.now() + 30 * 60_000,
        })
        if (clipsMayPlay(myRef.current)) playClip(audio) // otherwise it waits in the list, silently
      })()
    },
    [addVoice],
  )
  // Only the sender may delete a clip for everyone.
  const onClipDeleted = useCallback(
    (d: { id: string; fromId: string }) => setVoice((p) => p.filter((x) => !(x.id === d.id && x.fromId === d.fromId))),
    [],
  )
  const { online, sendClip, sendClipDelete, announceMembersChanged } = useGroupChannel(
    circle?.id,
    me,
    { onClip, onClipDeleted, onMembersChanged: reload },
    !my.appearOffline,
  )
  announceRef.current = announceMembersChanged
  useEffect(reload, [online.size, reload])

  // Clips sent while this phone was closed or offline, until they expire.
  useEffect(() => {
    if (!circle) return
    let alive = true
    void loadRecentClips(circle.id).then(async (rows) => {
      for (const r of rows) {
        if (!r.iv || r.v == null) continue // sent before encryption existed
        const plain = await keysRef.current.open({ iv: r.iv, ct: r.audio, version: r.v })
        if (!alive || !plain) continue
        const clip = JSON.parse(plain) as { mime: string; b64: string }
        addVoice({
          id: r.id,
          fromId: r.senderId,
          who: 'A family member',
          at: r.expiresAt - settings.voiceKeepMin * 60_000, // approximate; keeps them in order
          seconds: r.seconds,
          audio: { mime: clip.mime, b64: clip.b64, seconds: r.seconds },
          expiresAt: r.expiresAt,
        })
      }
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circle?.id, keys.epoch])

  // Expired clips leave the screen (the database has already hidden and then deletes them).
  useEffect(() => {
    setVoice((p) => (p.some((v) => v.expiresAt <= now) ? p.filter((v) => v.expiresAt > now) : p))
  }, [now])

  // ── chat ──
  const chat = useChat(circle?.id, me?.id, keys)

  // A member joined or came online: let the keyring check whether someone needs the circle key.
  useEffect(() => keys.kick(), [members.length, online.size]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── who is still using the app (lets the admin spot inactive people) ──
  useEffect(() => {
    if (!circle) return
    void touchLastSeen()
    const timer = setInterval(() => void touchLastSeen(), 5 * 60_000)
    const onVisible = () => document.visibilityState === 'visible' && void touchLastSeen()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [circle?.id])

  // If the admin removed me, the member list no longer contains me: go back to circle set-up.
  const dropped = useRef(false)
  useEffect(() => {
    if (!loaded || !me || !circle || dropped.current) return
    if (!members.some((m) => m.userId === me.id)) {
      dropped.current = true
      onCirclesChanged?.()
    }
  }, [loaded, members, me, circle, onCirclesChanged])

  const timeline: Item[] = [
    ...chat.messages.map(
      (c): Item => ({ kind: 'chat', id: c.id, fromId: c.senderId, who: nameOf(c.senderId), at: new Date(c.createdAt).getTime(), text: c.body }),
    ),
    ...voice.map(
      (v): Item => ({
        kind: 'voice',
        ...v,
        who: v.fromId === me?.id ? 'You' : members.find((m) => m.userId === v.fromId)?.name ?? v.who,
      }),
    ),
  ].sort((a, b) => a.at - b.at)

  const deleteVoice = (id: string) => {
    if (me) sendClipDelete(id, me.id)
    void deleteSavedClip(id)
    setVoice((p) => p.filter((x) => x.id !== id))
  }
  const hideVoice = (id: string) => setVoice((p) => p.filter((x) => x.id !== id))

  const membersChanged = () => {
    reload()
    announceMembersChanged()
  }
  const left = () => {
    announceMembersChanged()
    onCirclesChanged?.()
  }

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
        let sealed
        try {
          sealed = await keys.seal(JSON.stringify({ mime: clip.mime, b64: clip.b64 }))
        } catch {
          setMicError('Secure messaging is still getting ready. Try again in a moment.')
          return
        }
        const id = newId()
        const expiresAt = Date.now() + settings.voiceKeepMin * 60_000
        sendClip({ id, fromId: me.id, fromName: me.name, seconds: clip.seconds, expiresAt, iv: sealed.iv, ct: sealed.ct, v: sealed.version })
        addVoice({ id, fromId: me.id, who: 'You', at: Date.now(), seconds: clip.seconds, audio: clip, expiresAt })
        void saveClip(circle.id, me.id, id, clip.seconds, sealed) // so offline members can still hear it until it expires
      }
    }
  }

  // ── alert history (who responded) ──
  const upsertAlert = useCallback(
    (a: AlertRow) =>
      setAlerts((p) => {
        const i = p.findIndex((x) => x.id === a.id)
        if (i >= 0) {
          const next = [...p]
          next[i] = { ...p[i], ...a }
          return next
        }
        return [a, ...p].slice(0, 50)
      }),
    [],
  )
  useEffect(() => {
    if (!circle) {
      setAlerts([])
      return
    }
    let alive = true
    void fetchRecentAlerts(circle.id).then((rows) => alive && setAlerts(rows))
    return () => {
      alive = false
    }
  }, [circle?.id])

  // ── sending alerts ──
  const confirm = useCallback(async () => {
    if (!pending) return
    const type = pending
    setPending(null)
    const result = await sendAlert(type, { groupId: circle?.id, senderId: me?.id })
    setLast(result)
    if (result.alertId && circle && me) {
      upsertAlert({
        id: result.alertId,
        group_id: circle.id,
        sender_id: me.id,
        type,
        status: 'ringing',
        lat: result.fix?.lat ?? null,
        lng: result.fix?.lng ?? null,
        answered_by: null,
        answered_at: null,
        created_at: new Date().toISOString(),
      })
    }
  }, [pending, circle, me, upsertAlert])

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
      upsertAlert(a)
      if (a.sender_id === me?.id) return
      stopRing.current?.()
      const mode = alertBehavior(a.type, myRef.current)
      stopRing.current = mode === 'ring' ? startRing(a.type === 'sos') : null
      setQuiet(mode === 'quiet')
      incomingId.current = a.id
      setIncoming(a)
    },
    onUpdate: (a) => {
      upsertAlert(a)
      // someone answered: stop ringing here too
      if (incomingId.current === a.id && a.status !== 'ringing') clearIncoming()
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
      <header className="flex items-center justify-between gap-3 bg-brand px-5 py-3 text-white">
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight">{APP_NAME}</h1>
          <p className="truncate text-[11px] leading-tight opacity-80">{TAGLINE}</p>
        </div>
        <span className="flex shrink-0 items-center gap-2 text-xs">
          <span className="hidden opacity-80 sm:inline">{me ? me.name : 'Demo mode: backend not connected'}</span>
          {me && <StatusButton my={my} onChange={(p) => void saveStatus(p)} error={statusError} />}
          {me && (
            <button
              onClick={() => setShowSettings(true)}
              aria-label="Settings"
              className="rounded-full bg-white/20 px-3 py-1 font-semibold"
            >
              ⚙ Settings
            </button>
          )}
          {onSignOut && (
            <button onClick={onSignOut} className="rounded-full bg-white/20 px-3 py-1 font-semibold">Sign out</button>
          )}
        </span>
      </header>
      {!netOnline && (
        <p className="bg-amber-100 px-5 py-1.5 text-center text-xs font-semibold text-amber-900">
          No internet. Alerts and messages can't be sent or received until you are back online.
        </p>
      )}
      {!me && <p className="bg-brand/10 px-5 py-1.5 text-center text-xs text-ink/60">Demo mode: backend not connected</p>}

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
          {circle && me && (
            <Members
              circle={circle}
              meId={me.id}
              members={members}
              locs={locs}
              online={online}
              onChanged={membersChanged}
              onLeft={left}
            />
          )}
          <LocationToggle userId={me?.id} />
          {/* Demo mode and send errors need their own message; in a real circle the alert list below covers it. */}
          {last && (last.error || !last.sentToBackend) && <AlertStatus last={last} />}
          {circle && me && (
            <RecentAlerts
              alerts={alerts}
              meId={me.id}
              nameOf={nameOf}
              windowMin={settings.alertVisibleMin}
              now={now}
              onOpenSettings={() => setShowSettings(true)}
            />
          )}
          <Messages
            items={timeline}
            meId={me?.id}
            now={now}
            isAdmin={iAmAdmin}
            canChat={!!circle}
            error={chat.error}
            onSend={chat.send}
            onDeleteChat={(id) => void chat.remove(id)}
            onDeleteVoice={deleteVoice}
            onHideVoice={hideVoice}
          />
        </div>
      </main>

      {showSettings && me && (
        <Settings
          me={me}
          settings={settings}
          saveError={settingsError}
          keys={keys}
          onSave={(patch) => void saveSettings(patch)}
          onClose={() => setShowSettings(false)}
          onSignOut={() => {
            setShowSettings(false)
            onSignOut?.()
          }}
        />
      )}
      {circle && me && <KeyGate keys={keys} />}
      {pending && <AlertCountdown type={pending} onConfirm={confirm} onCancel={() => setPending(null)} />}
      {incoming && (
        <IncomingAlert quiet={quiet} alert={incoming} senderName={nameOf(incoming.sender_id)} onAnswer={answer} onDismiss={clearIncoming} />
      )}
    </div>
  )
}

function AlertStatus({ last }: { last: AlertResult }) {
  const label = last.type === 'sos' ? 'SOS' : 'Come for a sec'
  return (
    <section className="rounded-2xl bg-white p-4 text-sm shadow-sm ring-1 ring-ink/5">
      <p className="font-semibold">{label} {last.error ? 'not sent' : 'sent'}</p>
      {last.error ? (
        <p className="text-red-600">Could not send: {last.error}</p>
      ) : (
        <p className="text-ink/60">Demo mode: nothing was sent to anyone.</p>
      )}
      <p className="mt-1 text-xs text-ink/50">
        {last.fix ? `Location attached: ${last.fix.lat.toFixed(5)}, ${last.fix.lng.toFixed(5)}` : 'No location fix available'}
      </p>
    </section>
  )
}
