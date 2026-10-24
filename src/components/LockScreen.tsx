import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AppLockProvider, clearLock, useAppLock } from '../lib/applock'
import { signOut } from '../lib/auth'
import { APP_NAME } from '../lib/brand'

const MAX_TRIES = 5
const COOLDOWN_SEC = 30

function LockOverlay({ userId }: { userId: string }) {
  const { locked, config, unlock, verifyPin, unlockWithDevice } = useAppLock()
  const [entry, setEntry] = useState('')
  const [tries, setTries] = useState(0)
  const [wait, setWait] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const prompted = useRef(false)

  const tryDevice = async () => {
    setMessage(null)
    if (await unlockWithDevice()) unlock()
    else setMessage('Not unlocked. Try again.')
  }

  // When the lock appears with the phone's screen lock, ask for it straight away.
  useEffect(() => {
    if (!locked) {
      prompted.current = false
      setEntry('')
      setTries(0)
      setMessage(null)
      return
    }
    if (config.method === 'device' && !prompted.current) {
      prompted.current = true
      void tryDevice()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, config.method])

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  if (!locked) return null

  const pinLen = config.pin?.len ?? 4

  const press = async (d: string) => {
    if (wait > 0) return
    const next = (entry + d).slice(0, pinLen)
    setEntry(next)
    setMessage(null)
    if (next.length < pinLen) return
    if (await verifyPin(next)) {
      unlock()
      return
    }
    const n = tries + 1
    setTries(n)
    setEntry('')
    if (n >= MAX_TRIES) {
      setWait(COOLDOWN_SEC)
      setTries(0)
    } else setMessage('Wrong PIN')
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

  return (
    <div className="safe-pad fixed inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-[#FFF5F0] p-6 text-center">
      <img src="/icon.svg" alt="" className="h-16 w-16 rounded-2xl" />
      <h1 className="text-2xl font-bold">{APP_NAME} is locked</h1>

      {config.method === 'device' ? (
        <>
          <p className="text-sm text-ink/60">Use your phone's screen lock to open it.</p>
          <button onClick={() => void tryDevice()} className="rounded-xl bg-brand px-8 py-3 text-lg font-bold text-white">
            Unlock
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-ink/60">Enter your PIN</p>
          <div className="flex h-4 gap-3" aria-label="PIN entry">
            {Array.from({ length: pinLen }).map((_, i) => (
              <span key={i} className={`h-3.5 w-3.5 rounded-full ${i < entry.length ? 'bg-ink' : 'bg-ink/15'}`} />
            ))}
          </div>
          <div className="grid w-64 grid-cols-3 gap-3">
            {keys.map((k, i) =>
              k === '' ? (
                <span key={i} />
              ) : (
                <button
                  key={i}
                  disabled={wait > 0}
                  onClick={() => (k === '⌫' ? setEntry((e) => e.slice(0, -1)) : void press(k))}
                  aria-label={k === '⌫' ? 'Delete digit' : k}
                  className="h-16 rounded-full bg-white text-2xl font-semibold shadow-sm ring-1 ring-ink/10 active:scale-95 disabled:opacity-40"
                >
                  {k}
                </button>
              ),
            )}
          </div>
        </>
      )}

      {wait > 0 ? (
        <p className="text-sm text-red-600">Too many wrong tries. Wait {wait} s.</p>
      ) : (
        message && <p className="text-sm text-red-600">{message}</p>
      )}

      <p className="max-w-xs text-xs text-ink/50">
        If someone sends an SOS or "Come for a sec", it still rings and you can answer it without unlocking.
      </p>
      <button
        onClick={() => {
          clearLock(userId)
          void signOut()
        }}
        className="text-sm text-ink/50 underline"
      >
        Forgot? Sign out instead
      </button>
    </div>
  )
}

/** Wraps the signed-in app. The lock sits above the app (z-40) but below incoming alerts (z-50). */
export default function LockGate({ userId, children }: { userId: string; children: ReactNode }) {
  return (
    <AppLockProvider userId={userId}>
      {children}
      <LockOverlay userId={userId} />
    </AppLockProvider>
  )
}
