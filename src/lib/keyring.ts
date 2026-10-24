import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import {
  generateIdentity,
  makeBackup,
  newCircleKey,
  newRecoveryCode,
  open as openSealed,
  publicFromPrivate,
  restoreBackup,
  seal as sealPlain,
  unwrapCircleKey,
  wrapCircleKey,
  type CircleKey,
  type Identity,
  type Sealed,
} from './crypto'
import { clearIdentity, loadIdentity, saveIdentity } from './keystore'

/**
 * loading        working it out
 * show-code      brand-new key: show the recovery code once and ask the person to save it
 * needs-recovery this account already has a key but this device does not: enter the recovery code
 * waiting        key is fine, but nobody who holds the circle key has unlocked it for this device yet
 * ready          everything works
 * off            demo mode (no backend / no circle)
 */
export type KeyState = 'off' | 'loading' | 'show-code' | 'needs-recovery' | 'waiting' | 'ready' | 'error'

type Pending = { identity: Identity; code: string }

export type Keyring = {
  state: KeyState
  /** Changes whenever new keys arrive, so screens know to try opening messages again. */
  epoch: number
  recoveryCode: string | null
  error: string | null
  seal: (plain: string) => Promise<Sealed>
  open: (s: { iv: string; ct: string; version: number }) => Promise<string | null>
  confirmCode: () => Promise<void>
  recover: (code: string) => Promise<boolean>
  startFresh: () => Promise<void>
  /** Makes a new recovery code (needs this device's key). Returns the code to show once. */
  newCode: () => Promise<string | null>
  /** Ask for a re-check now (a member joined, someone came online, etc.). */
  kick: () => void
}

const db = () => {
  if (!supabase) throw new Error('Backend not configured')
  return supabase
}

export function useKeyring(userId: string | undefined, groupId: string | undefined): Keyring {
  const [state, setState] = useState<KeyState>(supabase && userId ? 'loading' : 'off')
  const [epoch, setEpoch] = useState(0)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [identityReady, setIdentityReady] = useState(false)

  const identity = useRef<Identity | null>(null)
  const pending = useRef<Pending | null>(null)
  const keys = useRef(new Map<string, CircleKey>()) // `${group}:${version}`
  const currentVersion = useRef(0)
  const syncing = useRef(false)
  const again = useRef(false)
  const emptyTicks = useRef(0)
  const groupRef = useRef(groupId)
  groupRef.current = groupId

  // ───── identity (this person's own key pair) ─────
  useEffect(() => {
    identity.current = null
    pending.current = null
    keys.current.clear()
    setIdentityReady(false)
    setRecoveryCode(null)
    if (!supabase || !userId) {
      setState('off')
      return
    }
    setState('loading')
    let alive = true
    ;(async () => {
      try {
        const local = await loadIdentity(userId)
        const { data: server } = await db().from('user_keys').select('public_key').eq('user_id', userId).maybeSingle()
        if (!alive) return
        if (local && server && server.public_key === local.publicKey) {
          identity.current = local
          setIdentityReady(true)
          return
        }
        if (local) await clearIdentity(userId) // out of date: this account's key was replaced elsewhere
        if (server) {
          setState('needs-recovery')
          return
        }
        const id = await generateIdentity()
        const code = newRecoveryCode()
        pending.current = { identity: id, code }
        setRecoveryCode(code)
        setState('show-code')
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : 'Could not set up secure messaging')
          setState('error')
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [userId])

  const uploadIdentity = useCallback(
    async (id: Identity, code: string) => {
      if (!userId) return
      const backup = await makeBackup(id.privateJwk, code)
      const a = await db().from('user_key_backups').upsert({ user_id: userId, salt: backup.salt, iv: backup.iv, ciphertext: backup.ciphertext })
      if (a.error) throw a.error
      const b = await db().from('user_keys').upsert({ user_id: userId, public_key: id.publicKey })
      if (b.error) throw b.error
    },
    [userId],
  )

  const confirmCode = useCallback(async () => {
    const p = pending.current
    if (!p || !userId) return
    try {
      await uploadIdentity(p.identity, p.code)
      await saveIdentity(userId, p.identity)
      identity.current = p.identity
      pending.current = null
      setRecoveryCode(null)
      setIdentityReady(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your key. Make sure migration 0006 has been run.')
      setState('error')
    }
  }, [userId, uploadIdentity])

  const recover = useCallback(
    async (code: string) => {
      if (!userId) return false
      try {
        const { data: b } = await db().from('user_key_backups').select('salt, iv, ciphertext').eq('user_id', userId).maybeSingle()
        const { data: s } = await db().from('user_keys').select('public_key').eq('user_id', userId).maybeSingle()
        if (!b || !s) return false
        const jwk = await restoreBackup(b, code)
        const pub = await publicFromPrivate(jwk)
        if (pub !== s.public_key) return false
        const id: Identity = { publicKey: pub, privateJwk: jwk }
        await saveIdentity(userId, id)
        identity.current = id
        setIdentityReady(true)
        return true
      } catch {
        return false // wrong code
      }
    },
    [userId],
  )

  const startFresh = useCallback(async () => {
    if (!userId) return
    await db().from('circle_keys').delete().eq('user_id', userId)
    await db().from('user_key_backups').delete().eq('user_id', userId)
    await db().from('user_keys').delete().eq('user_id', userId)
    await clearIdentity(userId)
    const id = await generateIdentity()
    const code = newRecoveryCode()
    pending.current = { identity: id, code }
    keys.current.clear()
    setRecoveryCode(code)
    setState('show-code')
  }, [userId])

  const newCode = useCallback(async () => {
    if (!identity.current || !userId) return null
    const code = newRecoveryCode()
    try {
      await uploadIdentity(identity.current, code)
      return code
    } catch {
      return null
    }
  }, [userId, uploadIdentity])

  // ───── circle key (shared by everyone in the circle) ─────
  const distribute = useCallback(
    async (ck: CircleKey, group: string) => {
      if (!userId) return
      const { data: mem } = await db().from('family_members').select('user_id').eq('group_id', group)
      const ids = (mem ?? []).map((m) => m.user_id as string)
      if (!ids.length) return
      const { data: pubs } = await db().from('user_keys').select('user_id, public_key').in('user_id', ids)
      const { data: held } = await db().rpc('circle_key_holders', { p_group: group, p_version: ck.version })
      const have = new Set((held ?? []) as string[])
      const rows = []
      for (const p of pubs ?? []) {
        if (have.has(p.user_id)) continue
        const w = await wrapCircleKey(ck, group, p.user_id, p.public_key)
        rows.push({ group_id: group, user_id: p.user_id, version: ck.version, wrapped: w.wrapped, eph_pub: w.ephPub, wrapped_by: userId })
      }
      if (rows.length) {
        const { error: e } = await db().from('circle_keys').upsert(rows, { onConflict: 'group_id,user_id,version', ignoreDuplicates: true })
        if (e) throw e
      }
    },
    [userId],
  )

  const sync = useCallback(async () => {
    const group = groupRef.current
    const id = identity.current
    if (!supabase || !userId || !group || !id) return
    if (syncing.current) {
      again.current = true
      return
    }
    syncing.current = true
    try {
      const { data: g, error: ge } = await db().from('family_groups').select('key_version, key_needs_rotation').eq('id', group).single()
      if (ge || !g) throw new Error('Run migration 0006 in Supabase to turn on encryption.')
      let version = g.key_version as number

      // open every circle key that has been locked for this device
      const { data: mine } = await db().from('circle_keys').select('version, wrapped, eph_pub').eq('group_id', group).eq('user_id', userId)
      let added = false
      for (const r of mine ?? []) {
        const k = `${group}:${r.version}`
        if (keys.current.has(k)) continue
        try {
          keys.current.set(k, await unwrapCircleKey({ wrapped: r.wrapped, ephPub: r.eph_pub }, group, r.version, userId, id.privateJwk))
          added = true
        } catch {
          /* locked with a different key of mine (after a reset): ignore */
        }
      }

      const make = async (v: number) => {
        const ck = await newCircleKey(v)
        keys.current.set(`${group}:${v}`, ck)
        added = true
        await distribute(ck, group)
        version = v
      }

      if (version === 0) {
        const { data: won } = await db().rpc('start_circle_key', { p_group: group })
        if (won) await make(1)
      } else if (keys.current.has(`${group}:${version}`)) {
        emptyTicks.current = 0
        if (g.key_needs_rotation) {
          const { data: v } = await db().rpc('rotate_circle_key', { p_group: group, p_expected: version })
          if (typeof v === 'number') await make(v)
        } else {
          await distribute(keys.current.get(`${group}:${version}`)!, group) // lock it for anyone new
        }
      } else {
        // nobody has unlocked the current key for us. If NOBODY holds it (its creator vanished), start a new one.
        const { data: held } = await db().rpc('circle_key_holders', { p_group: group, p_version: version })
        emptyTicks.current = (held ?? []).length === 0 ? emptyTicks.current + 1 : 0
        if (emptyTicks.current >= 2) {
          emptyTicks.current = 0
          const { data: v } = await db().rpc('rotate_circle_key', { p_group: group, p_expected: version })
          if (typeof v === 'number') await make(v)
        }
      }

      currentVersion.current = version
      setState(keys.current.has(`${group}:${version}`) ? 'ready' : 'waiting')
      if (added) setEpoch((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Secure messaging problem')
      setState('error')
    } finally {
      syncing.current = false
      if (again.current) {
        again.current = false
        void sync()
      }
    }
  }, [userId, distribute])

  const kick = useCallback(() => void sync(), [sync])

  useEffect(() => {
    if (!identityReady || !groupId || !supabase || !userId) return
    setError(null)
    void sync()
    const client = supabase
    const ch = client
      .channel(`keys:${groupId}:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'circle_keys', filter: `user_id=eq.${userId}` }, () => void sync())
      .subscribe()
    const poll = setInterval(() => void sync(), 20_000)
    return () => {
      clearInterval(poll)
      void client.removeChannel(ch)
    }
  }, [identityReady, groupId, userId, sync])

  const seal = useCallback(async (plain: string) => {
    const ck = keys.current.get(`${groupRef.current}:${currentVersion.current}`)
    if (!ck || !groupRef.current) throw new Error('Secure messaging is not ready yet')
    return sealPlain(ck, groupRef.current, plain)
  }, [])

  const open = useCallback(async (s: { iv: string; ct: string; version: number }) => {
    const ck = keys.current.get(`${groupRef.current}:${s.version}`)
    if (!ck || !groupRef.current) return null
    try {
      return await openSealed(ck, groupRef.current, s)
    } catch {
      return null
    }
  }, [])

  return { state, epoch, recoveryCode, error, seal, open, confirmCode, recover, startFresh, newCode, kick }
}
