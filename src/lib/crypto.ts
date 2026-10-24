/**
 * End-to-end encryption helpers (WebCrypto only, no extra libraries).
 *  - identity: an ECDH P-256 key pair per person
 *  - circle key: one random AES-256 key per circle, locked for each member with their public key
 *  - messages: AES-256-GCM with a fresh random IV, tied to the circle and key version
 */

const subtle = () => {
  const s = globalThis.crypto?.subtle
  if (!s) throw new Error('Secure encryption is not available here (needs https).')
  return s
}
const enc = new TextEncoder()
const dec = new TextDecoder()

export const b64 = (buf: ArrayBuffer | Uint8Array): string => {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}
export const unb64 = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s)
  const u = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return u
}
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)))

// ───────────── identity ─────────────
export type Identity = { publicKey: string; privateJwk: JsonWebKey }

export async function generateIdentity(): Promise<Identity> {
  const kp = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  return {
    publicKey: b64(await subtle().exportKey('raw', kp.publicKey)),
    privateJwk: await subtle().exportKey('jwk', kp.privateKey),
  }
}

const importPublic = (pub: string) =>
  subtle().importKey('raw', unb64(pub), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
const importPrivate = (jwk: JsonWebKey) =>
  subtle().importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])

/** Turns an ECDH shared secret into an AES key for locking one circle key. */
async function wrapKeyFrom(priv: CryptoKey, pub: CryptoKey, usage: KeyUsage): Promise<CryptoKey> {
  const bits = await subtle().deriveBits({ name: 'ECDH', public: pub }, priv, 256)
  const base = await subtle().importKey('raw', bits, 'HKDF', false, ['deriveKey'])
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('famitie-wrap-v1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  )
}

// ───────────── circle key ─────────────
export type CircleKey = { version: number; key: CryptoKey; raw: Uint8Array<ArrayBuffer> }

export async function newCircleKey(version: number): Promise<CircleKey> {
  return importCircleKey(version, rand(32))
}
async function importCircleKey(version: number, raw: Uint8Array<ArrayBuffer>): Promise<CircleKey> {
  const key = await subtle().importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
  return { version, key, raw }
}

export type Wrapped = { wrapped: string; ephPub: string }
const wrapAad = (group: string, version: number, recipient: string) => enc.encode(`wrap:${group}:${version}:${recipient}`)

/** Locks the circle key so that only `recipientPublic`'s owner can open it. */
export async function wrapCircleKey(ck: CircleKey, group: string, recipientId: string, recipientPublic: string): Promise<Wrapped> {
  const eph = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const k = await wrapKeyFrom(eph.privateKey, await importPublic(recipientPublic), 'encrypt')
  const iv = rand(12)
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: wrapAad(group, ck.version, recipientId) },
    k,
    ck.raw,
  )
  const both = new Uint8Array(12 + ct.byteLength)
  both.set(iv)
  both.set(new Uint8Array(ct), 12)
  return { wrapped: b64(both), ephPub: b64(await subtle().exportKey('raw', eph.publicKey)) }
}

export async function unwrapCircleKey(
  w: Wrapped,
  group: string,
  version: number,
  myId: string,
  myPrivate: JsonWebKey,
): Promise<CircleKey> {
  const k = await wrapKeyFrom(await importPrivate(myPrivate), await importPublic(w.ephPub), 'decrypt')
  const all = unb64(w.wrapped)
  const raw = await subtle().decrypt(
    { name: 'AES-GCM', iv: all.slice(0, 12), additionalData: wrapAad(group, version, myId) },
    k,
    all.slice(12),
  )
  return importCircleKey(version, new Uint8Array(raw))
}

// ───────────── messages ─────────────
export type Sealed = { iv: string; ct: string; version: number }
const msgAad = (group: string, version: number) => enc.encode(`msg:${group}:${version}`)

export async function seal(ck: CircleKey, group: string, plain: string): Promise<Sealed> {
  const iv = rand(12)
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: msgAad(group, ck.version) }, ck.key, enc.encode(plain))
  return { iv: b64(iv), ct: b64(ct), version: ck.version }
}

export async function open(ck: CircleKey, group: string, s: { iv: string; ct: string }): Promise<string> {
  const pt = await subtle().decrypt(
    { name: 'AES-GCM', iv: unb64(s.iv), additionalData: msgAad(group, ck.version) },
    ck.key,
    unb64(s.ct),
  )
  return dec.decode(pt)
}

// ───────────── recovery code (backup of the private key) ─────────────
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I

export function newRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length])
  return [0, 5, 10, 15].map((i) => chars.slice(i, i + 5).join('')).join('-')
}
export const normaliseCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '')

const PBKDF2_ROUNDS = 250_000
async function codeKey(code: string, salt: Uint8Array<ArrayBuffer>, usage: KeyUsage) {
  const base = await subtle().importKey('raw', enc.encode(normaliseCode(code)), 'PBKDF2', false, ['deriveKey'])
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ROUNDS },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  )
}

export type Backup = { salt: string; iv: string; ciphertext: string }

export async function makeBackup(privateJwk: JsonWebKey, code: string): Promise<Backup> {
  const salt = rand(16)
  const iv = rand(12)
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, await codeKey(code, salt, 'encrypt'), enc.encode(JSON.stringify(privateJwk)))
  return { salt: b64(salt), iv: b64(iv), ciphertext: b64(ct) }
}

/** Throws if the code is wrong. */
export async function restoreBackup(b: Backup, code: string): Promise<JsonWebKey> {
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(b.iv) }, await codeKey(code, unb64(b.salt), 'decrypt'), unb64(b.ciphertext))
  return JSON.parse(dec.decode(pt)) as JsonWebKey
}

/** The public key that goes with a private key (lets us check a restored backup). */
export async function publicFromPrivate(jwk: JsonWebKey): Promise<string> {
  const pubJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true }
  const k = await subtle().importKey('jwk', pubJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, [])
  return b64(await subtle().exportKey('raw', k))
}
