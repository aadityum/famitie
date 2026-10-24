import { useState } from 'react'
import type { Keyring } from '../lib/keyring'

/** Full-screen steps for secure messaging: save the recovery code, or enter it on a new phone. */
export default function KeyGate({ keys }: { keys: Keyring }) {
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [code, setCode] = useState('')
  const [bad, setBad] = useState(false)
  const [busy, setBusy] = useState(false)

  if (keys.state === 'show-code' && keys.recoveryCode) {
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(keys.recoveryCode ?? '')
        setCopied(true)
      } catch {
        /* the code is on screen anyway */
      }
    }
    return (
      <Shell title="Save your recovery code">
        <p className="text-sm text-ink/70">
          Your voice clips and messages are private: only people in your circle can open them, not even FamiTie can.
          If you ever get a new phone, this code is the only way to get your messages back.
        </p>
        <p className="my-4 select-all break-all rounded-xl bg-ink/5 p-4 text-center font-mono text-xl font-bold tracking-wider">
          {keys.recoveryCode}
        </p>
        <button onClick={copy} className="w-full rounded-xl bg-ink/5 py-2 text-sm font-semibold">
          {copied ? 'Copied ✓' : 'Copy code'}
        </button>
        <p className="mt-3 text-xs text-ink/60">Write it down or keep it in a password manager. It is shown only once.</p>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-1" />
          I have saved my recovery code.
        </label>
        <button
          disabled={!saved || busy}
          onClick={async () => {
            setBusy(true)
            await keys.confirmCode()
            setBusy(false)
          }}
          className="mt-4 w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-40"
        >
          Continue
        </button>
      </Shell>
    )
  }

  if (keys.state === 'needs-recovery') {
    return (
      <Shell title="Welcome back">
        <p className="text-sm text-ink/70">
          This phone doesn't have your private key yet. Enter the recovery code you saved to read your messages here.
        </p>
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value)
            setBad(false)
          }}
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="mt-4 w-full rounded-xl border border-ink/15 px-3 py-3 text-center font-mono text-lg"
        />
        {bad && <p className="mt-2 text-sm text-red-600">That code doesn't match. Check it and try again.</p>}
        <button
          disabled={!code.trim() || busy}
          onClick={async () => {
            setBusy(true)
            const ok = await keys.recover(code)
            setBusy(false)
            if (!ok) setBad(true)
          }}
          className="mt-3 w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'Checking…' : 'Unlock'}
        </button>
        <button
          onClick={() => {
            if (window.confirm('Start fresh? You will NOT be able to read your old messages and clips. New ones will work normally.'))
              void keys.startFresh()
          }}
          className="mt-4 w-full text-sm font-semibold text-red-600"
        >
          I don't have the code: start fresh
        </button>
      </Shell>
    )
  }

  if (keys.state === 'error' && keys.error) {
    return (
      <p className="fixed inset-x-0 bottom-0 z-30 bg-red-600 px-4 py-2 text-center text-xs font-semibold text-white">
        Secure messaging: {keys.error}
      </p>
    )
  }

  if (keys.state === 'waiting') {
    return (
      <p className="fixed inset-x-0 bottom-0 z-30 bg-amber-100 px-4 py-2 text-center text-xs font-semibold text-amber-900">
        🔒 Getting your circle's secure key. This finishes when another family member opens FamiTie.
      </p>
    )
  }

  return null
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[45] flex items-center justify-center overflow-y-auto bg-ink/60 p-5">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-3 text-xl font-bold">🔒 {title}</h2>
        {children}
      </div>
    </div>
  )
}
