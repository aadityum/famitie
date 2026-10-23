import { useState, type FormEvent } from 'react'
import { signIn, signUp } from '../lib/auth'

export default function AuthScreen() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'up') await signUp(email, password, name || email.split('@')[0])
      else await signIn(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const input = 'w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-base outline-none focus:border-brand'

  return (
    <div className="safe-pad flex min-h-full items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-lg ring-1 ring-ink/5">
        <div className="text-center">
          <img src="/icon.svg" alt="" className="mx-auto mb-3 h-16 w-16 rounded-2xl" />
          <h1 className="text-2xl font-bold">FamiTie</h1>
          <p className="text-sm text-ink/60">{mode === 'in' ? 'Sign in to your family circle' : 'Create your account'}</p>
        </div>

        {mode === 'up' && (
          <input className={input} placeholder="Your name (shown to family)" value={name} onChange={(e) => setName(e.target.value)} required />
        )}
        <input className={input} type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className={input} type="password" placeholder="Password (6+ characters)" minLength={6} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button disabled={busy} className="w-full rounded-xl bg-brand py-3 text-lg font-bold text-white disabled:opacity-60">
          {busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
        <button type="button" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(null) }} className="w-full text-sm text-brand">
          {mode === 'in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
