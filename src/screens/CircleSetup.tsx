import { useState, type FormEvent } from 'react'
import { createCircle, joinCircle, type Role } from '../lib/circles'
import { signOut } from '../lib/auth'

export default function CircleSetup({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [role, setRole] = useState<Role>('responder')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'create') await createCircle(value, role)
      else await joinCircle(value, role)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const tab = (active: boolean) =>
    `flex-1 rounded-lg py-2 text-sm font-semibold ${active ? 'bg-brand text-white' : 'bg-ink/5 text-ink/70'}`
  const roleBtn = (active: boolean) =>
    `flex-1 rounded-xl border-2 px-3 py-3 text-left ${active ? 'border-brand bg-brand/10' : 'border-ink/10'}`

  return (
    <div className="safe-pad flex min-h-full items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-lg ring-1 ring-ink/5">
        <h1 className="text-xl font-bold">Set up your family circle</h1>

        <div className="flex gap-2">
          <button type="button" className={tab(mode === 'create')} onClick={() => setMode('create')}>Start a circle</button>
          <button type="button" className={tab(mode === 'join')} onClick={() => setMode('join')}>Join with a code</button>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">I am the…</p>
          <div className="flex gap-2">
            <button type="button" className={roleBtn(role === 'elder')} onClick={() => setRole('elder')}>
              <span className="block font-semibold">Elder</span>
              <span className="text-xs text-ink/60">Needs to reach family</span>
            </button>
            <button type="button" className={roleBtn(role === 'responder')} onClick={() => setRole('responder')}>
              <span className="block font-semibold">Family</span>
              <span className="text-xs text-ink/60">Gets the calls</span>
            </button>
          </div>
        </div>

        <input
          className="w-full rounded-xl border border-ink/15 px-4 py-3 text-base outline-none focus:border-brand"
          placeholder={mode === 'create' ? 'Circle name (e.g. Sharma Family)' : 'Invite code'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoCapitalize="none"
          required
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button disabled={busy} className="w-full rounded-xl bg-brand py-3 text-lg font-bold text-white disabled:opacity-60">
          {busy ? 'Please wait…' : mode === 'create' ? 'Create circle' : 'Join circle'}
        </button>
        <button type="button" onClick={() => void signOut()} className="w-full text-sm text-ink/50">Sign out</button>
      </form>
    </div>
  )
}
