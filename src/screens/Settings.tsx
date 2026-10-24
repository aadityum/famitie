import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  ALERT_VISIBLE_OPTIONS,
  VOICE_KEEP_OPTIONS,
  type Settings as SettingsValues,
} from '../lib/settings'
import { LOCK_AFTER_OPTIONS, deviceLockAvailable, pinSupported, useAppLock } from '../lib/applock'
import { changePassword, deleteAccount } from '../lib/account'
import { APP_NAME } from '../lib/brand'
import type { Keyring } from '../lib/keyring'

type Props = {
  me: { id: string; name: string; email?: string }
  settings: SettingsValues
  saveError: string | null
  onSave: (patch: Partial<SettingsValues>) => void
  onClose: () => void
  onSignOut: () => void
  keys?: Keyring
}

const card = 'rounded-2xl bg-white p-4 shadow-sm ring-1 ring-ink/5'
const field = 'w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-base outline-none focus:border-brand'
const select = `${field} appearance-none`

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className={card}>
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mb-3 mt-0.5 text-sm text-ink/60">{hint}</p>}
      {!hint && <div className="mb-3" />}
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export default function Settings({ me, settings, saveError, onSave, onClose, onSignOut, keys }: Props) {
  return (
    <div className="safe-pad fixed inset-0 z-30 overflow-y-auto bg-[#FFF5F0]">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-brand px-5 py-3 text-white">
        <h1 className="text-lg font-bold">Settings</h1>
        <button onClick={onClose} className="rounded-full bg-white/20 px-4 py-1.5 text-sm font-semibold">Done</button>
      </header>

      <main className="mx-auto max-w-xl space-y-4 p-5 pb-16">
        <Section
          title="How long things stay"
          hint="Your choices. They apply to you on every device you sign in on."
        >
          <label className="block text-sm font-semibold">
            Show an answered alert for
            <select
              className={`${select} mt-1 font-normal`}
              value={settings.alertVisibleMin}
              onChange={(e) => onSave({ alertVisibleMin: Number(e.target.value) })}
            >
              {ALERT_VISIBLE_OPTIONS.map((o) => (
                <option key={o.min} value={o.min}>{o.label}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal text-ink/50">
              SOS and "Come for a sec" calls, with who answered, stay on your screen this long after they are answered.
            </span>
          </label>

          <label className="block text-sm font-semibold">
            Keep my voice recordings for
            <select
              className={`${select} mt-1 font-normal`}
              value={settings.voiceKeepMin}
              onChange={(e) => onSave({ voiceKeepMin: Number(e.target.value) })}
            >
              {VOICE_KEEP_OPTIONS.map((o) => (
                <option key={o.min} value={o.min}>{o.label}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal text-ink/50">
              Recordings you send are deleted after this time, for everyone. You can also delete one yourself at any time.
            </span>
          </label>
          {saveError && <p className="text-sm text-red-600">{saveError}</p>}
        </Section>

        <LockSection />

        {keys && keys.state !== 'off' && <EncryptionSection keys={keys} />}

        <PasswordSection email={me.email} />

        <Section title="Account">
          <p className="text-sm text-ink/60">
            Signed in as <span className="font-semibold text-ink">{me.name}</span>
            {me.email ? ` (${me.email})` : ''}
          </p>
          <button onClick={onSignOut} className="w-full rounded-xl border border-ink/15 py-3 font-semibold">Sign out</button>
        </Section>

        <DeleteSection userId={me.id} />
      </main>
    </div>
  )
}

// ───────────── App lock ─────────────
function LockSection() {
  const { config, update, setPin, unlockWithDevice } = useAppLock()
  const [deviceOk, setDeviceOk] = useState(false)
  const [settingPin, setSettingPin] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void deviceLockAvailable().then(setDeviceOk)
  }, [])

  const enableDevice = async () => {
    setError(null)
    // make sure the person can actually pass it before we rely on it
    if (await unlockWithDevice()) update({ enabled: true, method: 'device' })
    else setError('The phone screen lock was not confirmed, so the lock was not turned on.')
  }

  const toggle = async () => {
    setError(null)
    if (config.enabled) {
      update({ enabled: false })
      setSettingPin(false)
      return
    }
    if (deviceOk) await enableDevice()
    else if (pinSupported()) setSettingPin(true)
    else setError('This browser cannot keep a PIN safely. Use the phone app.')
  }

  return (
    <Section
      title="Lock FamiTie"
      hint="Ask for your phone's screen lock (or a PIN) before FamiTie opens, so nobody else can read your family's messages."
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-semibold">{config.enabled ? 'Lock is on' : 'Lock is off'}</span>
        <button
          role="switch"
          aria-checked={config.enabled}
          aria-label="Lock FamiTie"
          onClick={() => void toggle()}
          className={`relative h-9 w-16 shrink-0 rounded-full transition-colors ${config.enabled ? 'bg-brand' : 'bg-ink/20'}`}
        >
          <span className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow transition-all ${config.enabled ? 'left-8' : 'left-1'}`} />
        </button>
      </div>

      {config.enabled && (
        <>
          <p className="text-sm text-ink/60">
            Using: <span className="font-semibold text-ink">{config.method === 'device' ? "your phone's screen lock" : 'a FamiTie PIN'}</span>
          </p>

          <label className="block text-sm font-semibold">
            Lock again
            <select
              className={`${select} mt-1 font-normal`}
              value={config.lockAfterSec}
              onChange={(e) => update({ lockAfterSec: Number(e.target.value) })}
            >
              {LOCK_AFTER_OPTIONS.map((o) => (
                <option key={o.sec} value={o.sec}>{o.label}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal text-ink/50">
              After you leave FamiTie or lock the phone for this long. It always locks when the app is closed and reopened.
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            {config.method === 'device' && pinSupported() && (
              <button onClick={() => setSettingPin(true)} className="rounded-full bg-ink/5 px-4 py-2 text-sm font-semibold">
                Use a FamiTie PIN instead
              </button>
            )}
            {config.method === 'pin' && (
              <button onClick={() => setSettingPin(true)} className="rounded-full bg-ink/5 px-4 py-2 text-sm font-semibold">
                Change PIN
              </button>
            )}
            {config.method === 'pin' && deviceOk && (
              <button onClick={() => void enableDevice()} className="rounded-full bg-ink/5 px-4 py-2 text-sm font-semibold">
                Use my phone's screen lock
              </button>
            )}
          </div>
        </>
      )}

      {settingPin && (
        <PinSetup
          onCancel={() => setSettingPin(false)}
          onSave={async (pin) => {
            await setPin(pin)
            setSettingPin(false)
          }}
        />
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-ink/40">
        {APP_NAME} alerts still ring and can be answered while the app is locked.
      </p>
    </Section>
  )
}

function PinSetup({ onSave, onCancel }: { onSave: (pin: string) => Promise<void>; onCancel: () => void }) {
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^\d{4,6}$/.test(pin)) return setError('Use 4 to 6 digits.')
    if (pin !== again) return setError('The two PINs do not match.')
    try {
      await onSave(pin)
    } catch {
      setError('Could not save the PIN on this device.')
    }
  }

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6)
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl bg-ink/5 p-3">
      <p className="text-sm font-semibold">Choose a PIN (4 to 6 digits)</p>
      <input className={field} inputMode="numeric" type="password" autoComplete="off" placeholder="New PIN" value={pin} onChange={(e) => setPin(digits(e.target.value))} />
      <input className={field} inputMode="numeric" type="password" autoComplete="off" placeholder="Type it again" value={again} onChange={(e) => setAgain(digits(e.target.value))} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button className="flex-1 rounded-xl bg-brand py-2.5 font-bold text-white">Save PIN</button>
        <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2.5 font-semibold text-ink/60">Cancel</button>
      </div>
      <p className="text-xs text-ink/50">The PIN stays on this device only. If you forget it, sign out from the lock screen and sign in again.</p>
    </form>
  )
}

// ───────────── Change password ─────────────
function PasswordSection({ email }: { email?: string }) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email) return setError('No email on this account.')
    if (next.length < 6) return setError('The new password needs at least 6 characters.')
    if (next !== again) return setError('The two new passwords do not match.')
    setBusy(true)
    try {
      await changePassword(email, current, next)
      setDone(true)
      setOpen(false)
      setCurrent('')
      setNext('')
      setAgain('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Password" hint="Forgot it instead? Sign out, then choose “Forgot password?” on the sign-in screen.">
      {done && <p className="text-sm font-semibold text-green-700">Password changed.</p>}
      {!open ? (
        <button onClick={() => { setOpen(true); setDone(false) }} className="w-full rounded-xl border border-ink/15 py-3 font-semibold">
          Change password
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input className={field} type="password" autoComplete="current-password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          <input className={field} type="password" autoComplete="new-password" placeholder="New password (6+ characters)" value={next} onChange={(e) => setNext(e.target.value)} required />
          <input className={field} type="password" autoComplete="new-password" placeholder="New password again" value={again} onChange={(e) => setAgain(e.target.value)} required />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button disabled={busy} className="flex-1 rounded-xl bg-brand py-3 font-bold text-white disabled:opacity-60">
              {busy ? 'Saving…' : 'Save new password'}
            </button>
            <button type="button" onClick={() => { setOpen(false); setError(null) }} className="rounded-xl px-4 py-3 font-semibold text-ink/60">Cancel</button>
          </div>
        </form>
      )}
    </Section>
  )
}

// ───────────── Delete account ─────────────
function DeleteSection({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await deleteAccount(userId) // signs this device out when it succeeds
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the account')
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-red-200 bg-white p-4">
      <h2 className="font-semibold text-red-700">Delete my account</h2>
      {!open ? (
        <>
          <p className="mb-3 mt-0.5 text-sm text-ink/60">Permanently removes your account and everything of yours from FamiTie.</p>
          <button onClick={() => setOpen(true)} className="w-full rounded-xl border border-red-300 py-3 font-semibold text-red-600">
            Delete my account…
          </button>
        </>
      ) : (
        <div className="mt-2 space-y-3">
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink/70">
            <li>Your sign-in, name, messages, voice recordings, alerts and shared location are deleted for good.</li>
            <li>Your family circles carry on without you. If you are an admin, admin passes to someone else automatically.</li>
            <li>This cannot be undone.</li>
          </ul>
          <label className="block text-sm font-semibold">
            Type DELETE to confirm
            <input className={`${field} mt-1 font-normal`} value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              disabled={typed.trim() !== 'DELETE' || busy}
              onClick={() => void remove()}
              className="flex-1 rounded-xl bg-red-600 py-3 font-bold text-white disabled:opacity-40"
            >
              {busy ? 'Deleting…' : 'Delete everything'}
            </button>
            <button onClick={() => { setOpen(false); setTyped(''); setError(null) }} className="rounded-xl px-4 py-3 font-semibold text-ink/60">Cancel</button>
          </div>
        </div>
      )}
    </section>
  )
}

function EncryptionSection({ keys }: { keys: Keyring }) {
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const status =
    keys.state === 'ready' ? 'On: only your circle can open voice and chat.' : keys.state === 'waiting' ? 'Waiting for another family member to unlock this phone.' : 'Getting ready…'
  return (
    <Section title="Private messages" hint="Voice clips and chat are locked on the sender's phone. FamiTie cannot read them.">
      <p className="text-sm">🔒 {status}</p>
      {code ? (
        <div className="mt-3">
          <p className="select-all break-all rounded-xl bg-ink/5 p-3 text-center font-mono text-lg font-bold tracking-wider">{code}</p>
          <p className="mt-2 text-xs text-ink/60">Save this new code. The old one no longer works. It is shown only now.</p>
        </div>
      ) : (
        <button
          disabled={busy || keys.state === 'loading'}
          onClick={async () => {
            if (!window.confirm('Make a new recovery code? Your old code will stop working.')) return
            setBusy(true)
            setFailed(false)
            const c = await keys.newCode()
            setBusy(false)
            if (c) setCode(c)
            else setFailed(true)
          }}
          className="mt-3 w-full rounded-xl bg-ink/5 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Make a new recovery code'}
        </button>
      )}
      {failed && <p className="mt-2 text-xs text-red-600">Could not do that. Try again.</p>}
    </Section>
  )
}
