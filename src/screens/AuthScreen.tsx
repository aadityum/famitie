import { useState, type FormEvent } from 'react'
import { signIn, signUp } from '../lib/auth'
import { confirmPasswordReset, requestPasswordReset } from '../lib/account'
import { APP_NAME, TAGLINE } from '../lib/brand'

type Mode = 'in' | 'up' | 'forgot' | 'reset'

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const go = (m: Mode) => {
    setMode(m)
    setError(null)
    setInfo(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (mode === 'up') await signUp(email, password, name || email.split('@')[0])
      else if (mode === 'in') await signIn(email, password)
      else if (mode === 'forgot') {
        await requestPasswordReset(email)
        setMode('reset')
        setInfo(`We sent a code to ${email.trim()}. It can take a minute. Check spam too.`)
      } else {
        await confirmPasswordReset(email, code, password) // signs the person in on success
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setBusy(true)
    setError(null)
    try {
      await requestPasswordReset(email)
      setInfo('A new code is on its way.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a new code')
    } finally {
      setBusy(false)
    }
  }

  const input = 'w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-base outline-none focus:border-brand'
  const subtitle =
    mode === 'in' ? 'Sign in to your family circle' : mode === 'up' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Enter the code we emailed you'
  const button =
    mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : mode === 'forgot' ? 'Email me a code' : 'Set new password'

  return (
    <div className="safe-pad flex min-h-full items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-lg ring-1 ring-ink/5">
        <div className="text-center">
          <img src="/icon.svg" alt="" className="mx-auto mb-3 h-16 w-16 rounded-2xl" />
          <h1 className="text-2xl font-bold">{APP_NAME}</h1>
          <p className="text-sm font-medium text-brand">{TAGLINE}</p>
          <p className="mt-2 text-sm text-ink/60">{subtitle}</p>
        </div>

        {mode === 'up' && (
          <input className={input} placeholder="Your name (shown to family)" value={name} onChange={(e) => setName(e.target.value)} required />
        )}
        <input className={input} type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required readOnly={mode === 'reset'} />

        {mode === 'reset' && (
          <input className={input} inputMode="numeric" autoComplete="one-time-code" placeholder="Code from the email" value={code} onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))} required />
        )}

        {mode !== 'forgot' && (
          <input
            className={input}
            type="password"
            placeholder={mode === 'reset' ? 'New password (6+ characters)' : 'Password (6+ characters)'}
            minLength={6}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        )}

        {info && <p className="text-sm text-green-700">{info}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <button disabled={busy} className="w-full rounded-xl bg-brand py-3 text-lg font-bold text-white disabled:opacity-60">
          {busy ? 'Please wait…' : button}
        </button>

        {mode === 'in' && (
          <button type="button" onClick={() => go('forgot')} className="w-full text-sm text-ink/60 underline">
            Forgot password?
          </button>
        )}
        {mode === 'reset' && (
          <button type="button" disabled={busy} onClick={() => void resend()} className="w-full text-sm text-ink/60 underline">
            Send a new code
          </button>
        )}
        {(mode === 'in' || mode === 'up') && (
          <button type="button" onClick={() => go(mode === 'in' ? 'up' : 'in')} className="w-full text-sm text-brand">
            {mode === 'in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
          </button>
        )}
        {(mode === 'forgot' || mode === 'reset') && (
          <button type="button" onClick={() => go('in')} className="w-full text-sm text-brand">
            Back to sign in
          </button>
        )}
      </form>
    </div>
  )
}
