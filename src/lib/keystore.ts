import type { Identity } from './crypto'

/**
 * Keeps this person's private key on this device (IndexedDB, with localStorage as a fallback).
 * It is never sent to the server in readable form.
 */
const DB = 'famitie-keys'
const STORE = 'identity'

const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })

export async function loadIdentity(userId: string): Promise<Identity | null> {
  try {
    const db = await open()
    const v = await new Promise<Identity | undefined>((resolve, reject) => {
      const q = db.transaction(STORE).objectStore(STORE).get(userId)
      q.onsuccess = () => resolve(q.result as Identity | undefined)
      q.onerror = () => reject(q.error)
    })
    if (v) return v
  } catch {
    /* fall through to localStorage */
  }
  try {
    const raw = localStorage.getItem(`famitie.identity.${userId}`)
    return raw ? (JSON.parse(raw) as Identity) : null
  } catch {
    return null
  }
}

export async function saveIdentity(userId: string, id: Identity): Promise<void> {
  try {
    const db = await open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(id, userId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    try {
      localStorage.setItem(`famitie.identity.${userId}`, JSON.stringify(id))
    } catch {
      /* nothing more we can do; the recovery code still restores it */
    }
  }
}

export async function clearIdentity(userId: string): Promise<void> {
  try {
    const db = await open()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(userId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(`famitie.identity.${userId}`)
  } catch {
    /* ignore */
  }
}
