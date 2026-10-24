import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Role = 'elder' | 'responder' | 'admin'
export type Circle = { id: string; name: string; inviteCode: string; role: Role }
export type Member = {
  userId: string
  name: string
  role: Role
  isAdmin: boolean
  lastSeenAt: string | null
  joinedAt: string
  status: 'available' | 'meeting' | 'sleeping' | 'dnd'
  statusUntil: string | null
}
export type MemberLoc = { lat: number; lng: number; updatedAt: string }

const db = () => {
  if (!supabase) throw new Error('Backend not configured')
  return supabase
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'Something went wrong')

export const roleLabel = (r: Role) => (r === 'elder' ? 'Elder' : r === 'admin' ? 'Admin' : 'Family')

/** A member who has not opened the app for this long is flagged as inactive. */
export const INACTIVE_DAYS = 7
export const isInactive = (m: Member) => {
  const seen = new Date(m.lastSeenAt ?? m.joinedAt).getTime()
  return Date.now() - seen > INACTIVE_DAYS * 86_400_000
}

export async function fetchMyCircles(userId: string): Promise<Circle[]> {
  const { data, error } = await db()
    .from('family_members')
    .select('role, family_groups(id, name, invite_code)')
    .eq('user_id', userId)
  if (error) throw error
  type Row = { role: Role; family_groups: { id: string; name: string; invite_code: string } | null }
  return (data as unknown as Row[])
    .filter((r) => r.family_groups)
    .map((r) => ({
      id: r.family_groups!.id,
      name: r.family_groups!.name,
      inviteCode: r.family_groups!.invite_code,
      role: r.role,
    }))
}

export async function createCircle(name: string, role: Role) {
  const { error } = await db().rpc('create_family_group', { p_name: name, p_role: role })
  if (error) throw error
}

export async function joinCircle(code: string, role: Role) {
  const { error } = await db().rpc('join_family_group', { p_code: code, p_role: role })
  if (error) throw error
}

/** Leave a circle. If you are the admin, the database hands admin to someone else automatically. */
export async function leaveCircle(groupId: string) {
  const { error } = await db().rpc('leave_family_group', { p_group: groupId })
  if (error) throw new Error(errMsg(error))
}

/** Admin only: take a person out of the circle. */
export async function removeMember(groupId: string, userId: string) {
  const { error } = await db().rpc('remove_member', { p_group: groupId, p_user: userId })
  if (error) throw new Error(errMsg(error))
}

/** Admin only: make someone else the admin (you stop being admin). */
export async function makeAdmin(groupId: string, userId: string) {
  const { error } = await db().rpc('transfer_admin', { p_group: groupId, p_user: userId })
  if (error) throw new Error(errMsg(error))
}

/** Heartbeat so the circle can tell who is still using the app. */
export async function touchLastSeen() {
  if (!supabase) return
  await supabase.rpc('touch_last_seen')
}

/** Members of a circle plus the shared locations of those who switched sharing on. Live-updating. */
export function useMembers(circle: Circle | null) {
  const [members, setMembers] = useState<Member[]>([])
  const [locs, setLocs] = useState<Record<string, MemberLoc>>({})
  const [loaded, setLoaded] = useState(false)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (!supabase || !circle) return
    const client = supabase
    let alive = true
    let cleanup = () => {}

    ;(async () => {
      const { data: mem } = await client
        .from('family_members')
        .select('user_id, role, is_admin, last_seen_at, joined_at, profiles(display_name, status, status_until)')
        .eq('group_id', circle.id)
      if (!alive || !mem) return
      type Row = {
        user_id: string
        role: Role
        is_admin: boolean
        last_seen_at: string | null
        joined_at: string
        profiles: { display_name: string; status: Member['status'] | null; status_until: string | null } | null
      }
      const list: Member[] = (mem as unknown as Row[])
        .map((m) => ({
          userId: m.user_id,
          role: m.role,
          isAdmin: m.is_admin,
          lastSeenAt: m.last_seen_at,
          joinedAt: m.joined_at,
          name: m.profiles?.display_name ?? 'Member',
          status: m.profiles?.status ?? 'available',
          statusUntil: m.profiles?.status_until ?? null,
        }))
        .sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || a.name.localeCompare(b.name))
      setMembers(list)
      setLoaded(true)
      const ids = new Set(list.map((m) => m.userId))

      const { data: rows } = await client
        .from('locations')
        .select('user_id, lat, lng, sharing_enabled, updated_at')
        .in('user_id', [...ids])
      if (alive && rows) {
        const next: Record<string, MemberLoc> = {}
        for (const r of rows as { user_id: string; lat: number | null; lng: number | null; sharing_enabled: boolean; updated_at: string }[]) {
          if (r.sharing_enabled && r.lat != null && r.lng != null)
            next[r.user_id] = { lat: r.lat, lng: r.lng, updatedAt: r.updated_at }
        }
        setLocs(next)
      }

      const ch = client
        .channel(`loc:${circle.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, (p) => {
          const row = p.new as { user_id?: string; lat?: number; lng?: number; sharing_enabled?: boolean; updated_at?: string }
          if (!row.user_id || !ids.has(row.user_id)) return
          setLocs((prev) => {
            const next = { ...prev }
            if (row.sharing_enabled && row.lat != null && row.lng != null)
              next[row.user_id!] = { lat: row.lat, lng: row.lng, updatedAt: row.updated_at ?? new Date().toISOString() }
            else delete next[row.user_id!]
            return next
          })
        })
        .subscribe()
      cleanup = () => void client.removeChannel(ch)
    })()

    return () => {
      alive = false
      cleanup()
    }
  }, [circle, tick])

  return { members, locs, loaded, reload }
}
