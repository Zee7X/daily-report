import 'server-only'
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { headers } from 'next/headers'
import { decrypt, encrypt } from './crypto'
import { exec, one } from './db'
import { env } from './env'
import { LOCAL_EMAIL } from './repo/users'

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>

// ── password (scrypt) ──────────────────────────────────────────────────

const N = 16384
const R = 8
const P = 1
const KEYLEN = 32

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, KEYLEN, { N, r: R, p: P })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

/** Selalu menghitung scrypt walau pengguna tidak ada, agar waktu respons tidak membocorkan email terdaftar. */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parts = (stored ?? '').split('$')
  const valid = parts.length === 6 && parts[0] === 'scrypt'
  const salt = valid ? Buffer.from(parts[4], 'base64url') : randomBytes(16)
  const expected = valid ? Buffer.from(parts[5], 'base64url') : randomBytes(KEYLEN)
  const opts = valid ? { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]) } : { N, r: R, p: P }
  const actual = await scrypt(password, salt, expected.length, opts)
  return valid && timingSafeEqual(actual, expected)
}

// ── siapa yang boleh membuat akun ───────────────────────────────────────

/**
 * SIGNUP_ALLOWED_EMAILS: "*" = siapa saja boleh mendaftar (dengan pembatas laju dan kuota per pengguna),
 * daftar email/@domain = hanya yang cocok, kosong = hanya akun pertama (pemilik).
 */
export async function canSignup(email: string): Promise<boolean> {
  const e = email.toLowerCase()
  const allow = env.signupAllowed
  if (allow.includes('*')) return true
  if (allow.length) return allow.some((a) => (a.startsWith('@') ? e.endsWith(a) : e === a))
  const row = await one<{ n: number }>('SELECT COUNT(*) AS n FROM users WHERE email <> ?', [LOCAL_EMAIL])
  return Number(row?.n ?? 0) === 0
}

/**
 * Admin = pemilik situs: email di ADMIN_EMAILS, atau (bila kosong) akun tertua. Mode SINGLE_USER: pengguna lokal.
 * Hanya mengatur apa yang ditampilkan (panduan pendaftaran OAuth); bukan batas keamanan.
 */
export async function isAdmin(user: { id: string; email: string }): Promise<boolean> {
  if (env.singleUser) return true
  const admins = env.adminEmails
  if (admins.length) return admins.includes(user.email.toLowerCase())
  const owner = await one<{ id: string }>('SELECT id FROM users WHERE email <> ? ORDER BY created_at ASC, id ASC LIMIT 1', [LOCAL_EMAIL])
  return owner?.id === user.id
}

// ── domain login vs domain aplikasi ─────────────────────────────────────

const hostOf = (url: string) => new URL(url).host

export async function currentHost(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-host') ?? h.get('host') ?? ''
}

export async function onAuthHost(): Promise<boolean> {
  return env.splitAuth && (await currentHost()) === hostOf(env.authUrl)
}

export function safeNext(next: string | null | undefined, fallback = '/'): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : fallback
}

const HANDOFF_TTL_MS = 60_000
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** Cookie nonce di APP_URL, dipasang proxy saat /login dialihkan ke AUTH_URL. */
export const HANDOFF_NONCE_COOKIE = 'rt_hn'
/** Cookie nonce OAuth di domain yang memulai alur (authorize → complete). */
export const OAUTH_NONCE_COOKIE = 'rt_os'

/**
 * Token sekali pakai untuk menyerahkan hasil login di AUTH_URL ke APP_URL.
 * Hanya hash token yang disimpan; token terikat ke domain tujuan, kedaluwarsa dalam 60 detik,
 * dan hanya bisa dipakai oleh browser yang memegang cookie nonce dari awal alur login.
 */
export async function handoffUrl(userId: string, targetBase: string, next: string, nonce: string): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await exec('DELETE FROM auth_handoffs WHERE expires_at < ?', [new Date(Date.now() - 3600_000)])
  await exec('INSERT INTO auth_handoffs (token_hash, user_id, audience, nonce_hash, expires_at) VALUES (?, ?, ?, ?, ?)', [
    sha256(token),
    userId,
    hostOf(targetBase),
    sha256(nonce),
    new Date(Date.now() + HANDOFF_TTL_MS),
  ])
  const u = new URL('/api/auth/handoff', targetBase)
  u.searchParams.set('t', token)
  u.searchParams.set('next', safeNext(next))
  return u.toString()
}

export async function consumeHandoff(token: string, host: string, nonce: string): Promise<string | null> {
  if (!token || !nonce) return null
  const hash = sha256(token)
  const res = await exec(
    'UPDATE auth_handoffs SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? AND audience = ? AND nonce_hash = ?',
    [new Date(), hash, new Date(), host, sha256(nonce)],
  )
  if (res.affectedRows !== 1) return null
  const row = await one<{ user_id: string }>('SELECT user_id FROM auth_handoffs WHERE token_hash = ?', [hash])
  return row?.user_id ?? null
}

// ── state OAuth (disimpan di server) ────────────────────────────────────
// authorize (domain asal) → penyedia → callback (domain redirect URI) → complete (domain asal).
// Hasil OAuth baru dipakai di langkah "complete", yang butuh dua bukti sekaligus: cookie nonce dari browser
// yang memulai alur, dan kunci sekali pakai yang hanya diterima browser yang menyetujui di penyedia.
// Untuk "connect", sesi yang aktif juga harus pengguna yang memulai alur.

const OAUTH_TTL_MS = 10 * 60 * 1000

export type OAuthState = {
  provider: string
  intent: 'login' | 'connect'
  userId: string | null
  returnBase: string
  nextPath: string
  result: string | null
  /** PKCE code_verifier (disimpan terenkripsi, tidak pernah dikirim ke browser). */
  pkceVerifier: string | null
}

/** PKCE S256: verifier acak + challenge = base64url(sha256(verifier)). */
export function pkcePair() {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export async function createOAuthState(
  s: Omit<OAuthState, 'result' | 'pkceVerifier'> & { pkceVerifier?: string | null },
): Promise<{ state: string; nonce: string }> {
  const state = randomBytes(24).toString('base64url')
  const nonce = randomBytes(24).toString('base64url')
  await exec('DELETE FROM oauth_states WHERE expires_at < ?', [new Date(Date.now() - 3600_000)])
  await exec(
    'INSERT INTO oauth_states (state_hash, provider, intent, user_id, nonce_hash, return_base, next_path, pkce_verifier, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      sha256(state),
      s.provider,
      s.intent,
      s.userId,
      sha256(nonce),
      s.returnBase,
      safeNext(s.nextPath),
      s.pkceVerifier ? encrypt(s.pkceVerifier) : null,
      new Date(Date.now() + OAUTH_TTL_MS),
    ],
  )
  return { state, nonce }
}

type StateRow = {
  provider: string
  intent: string
  user_id: string | null
  return_base: string
  next_path: string
  result: string | null
  pkce_verifier: string | null
}
const mapState = (r: StateRow): OAuthState => ({
  provider: r.provider,
  intent: r.intent === 'login' ? 'login' : 'connect',
  userId: r.user_id,
  returnBase: r.return_base,
  nextPath: r.next_path,
  result: r.result,
  pkceVerifier: r.pkce_verifier ? decrypt(r.pkce_verifier) : null,
})

/**
 * Callback: tandai state terpakai (sekali), kembalikan isinya. null = state tidak ada/kedaluwarsa/sudah dipakai;
 * error infrastruktur (DB, crypto) dilempar ke pemanggil, tidak ditelan.
 * Ulangan db.ts hanya terjadi pada error koneksi. Bila UPDATE sudah terterap tetapi balasannya hilang, ulangannya
 * mendapat 0 baris dan kita melapor invalid_state: aman (state tidak pernah terpakai dua kali), pengguna cukup mengulang login.
 * Dibiarkan begitu karena penanda "milik request ini" butuh kolom unik per request; cap waktu ms bisa kembar pada replay.
 */
export async function useOAuthState(state: string, provider: string): Promise<OAuthState | null> {
  const hash = sha256(state)
  const res = await exec(
    'UPDATE oauth_states SET used_at = ? WHERE state_hash = ? AND provider = ? AND used_at IS NULL AND expires_at > ?',
    [new Date(), hash, provider, new Date()],
  )
  if (res.affectedRows !== 1) return null
  const r = await one<StateRow>('SELECT * FROM oauth_states WHERE state_hash = ?', [hash])
  return r ? mapState(r) : null
}

/** Menyimpan hasil OAuth terenkripsi dan mengembalikan kunci penyelesaian untuk browser yang menyetujui. */
export async function saveOAuthResult(state: string, encryptedResult: string): Promise<string> {
  const key = randomBytes(24).toString('base64url')
  await exec('UPDATE oauth_states SET result = ?, completion_hash = ? WHERE state_hash = ?', [encryptedResult, sha256(key), sha256(state)])
  return key
}

/** Complete: hanya sekali, hanya dengan nonce yang cocok, dan hanya bila callback sudah selesai. */
export async function completeOAuthState(state: string, nonce: string, key: string): Promise<OAuthState | null> {
  if (!state || !nonce || !key) return null
  const hash = sha256(state)
  // Ulangan db.ts setelah UPDATE yang terlanjur terterap berakhir di sini sebagai null (lihat useOAuthState): gagal aman.
  const res = await exec(
    'UPDATE oauth_states SET completed_at = ? WHERE state_hash = ? AND nonce_hash = ? AND completion_hash = ? AND used_at IS NOT NULL AND completed_at IS NULL AND result IS NOT NULL AND expires_at > ?',
    [new Date(), hash, sha256(nonce), sha256(key), new Date()],
  )
  if (res.affectedRows !== 1) return null
  const r = await one<StateRow>('SELECT * FROM oauth_states WHERE state_hash = ?', [hash])
  if (!r) return null
  // Hasil (token terenkripsi) dan verifier PKCE dihapus dari tabel setelah diambil.
  await exec('UPDATE oauth_states SET result = NULL, pkce_verifier = NULL WHERE state_hash = ?', [hash])
  return mapState(r)
}

/** Base URL untuk host saat ini: APP_URL atau AUTH_URL (tidak pernah dari header mentah). */
export async function currentBase(): Promise<string> {
  const host = await currentHost()
  return env.splitAuth && host === hostOf(env.authUrl) ? env.authUrl : env.appUrl
}
