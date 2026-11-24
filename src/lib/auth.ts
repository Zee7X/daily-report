import 'server-only'
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { headers } from 'next/headers'
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

// ── pembatas percobaan login (per instance) ─────────────────────────────

const attempts = new Map<string, number[]>()
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 10

export function tooManyAttempts(key: string): boolean {
  const now = Date.now()
  const list = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  attempts.set(key, list)
  return list.length >= MAX_ATTEMPTS
}

export function recordFailure(key: string) {
  attempts.set(key, [...(attempts.get(key) ?? []), Date.now()])
}

// ── siapa yang boleh membuat akun ───────────────────────────────────────

/** SIGNUP_ALLOWED_EMAILS berisi email atau @domain. Bila kosong, hanya akun pertama (pemilik) yang boleh dibuat. */
export async function canSignup(email: string): Promise<boolean> {
  const e = email.toLowerCase()
  const allow = env.signupAllowed
  if (allow.length) return allow.some((a) => (a.startsWith('@') ? e.endsWith(a) : e === a))
  const row = await one<{ n: number }>('SELECT COUNT(*) AS n FROM users WHERE email <> ?', [LOCAL_EMAIL])
  return Number(row?.n ?? 0) === 0
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
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/**
 * Token sekali pakai untuk memindahkan sesi ke domain lain milik aplikasi ini (AUTH_URL ⇄ APP_URL).
 * Hanya hash token yang disimpan; token terikat ke satu domain tujuan dan kedaluwarsa dalam 60 detik.
 */
export async function handoffUrl(userId: string, targetBase: string, next: string, path = '/api/auth/handoff'): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await exec('DELETE FROM auth_handoffs WHERE expires_at < ?', [new Date(Date.now() - 3600_000)])
  await exec('INSERT INTO auth_handoffs (token_hash, user_id, audience, expires_at) VALUES (?, ?, ?, ?)', [
    sha256(token),
    userId,
    hostOf(targetBase),
    new Date(Date.now() + HANDOFF_TTL_MS),
  ])
  const u = new URL(path, targetBase)
  u.searchParams.set('t', token)
  u.searchParams.set('next', safeNext(next))
  return u.toString()
}

export async function consumeHandoff(token: string, host: string): Promise<string | null> {
  const hash = sha256(token)
  const res = await exec(
    'UPDATE auth_handoffs SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? AND audience = ?',
    [new Date(), hash, new Date(), host],
  )
  if (res.affectedRows !== 1) return null
  const row = await one<{ user_id: string }>('SELECT user_id FROM auth_handoffs WHERE token_hash = ?', [hash])
  return row?.user_id ?? null
}

/** URL tujuan setelah login berhasil: langsung, atau lewat serah-terima ke APP_URL bila login terjadi di AUTH_URL. */
export async function afterLoginUrl(userId: string, next: string): Promise<string | null> {
  if (await onAuthHost()) return handoffUrl(userId, env.appUrl, next)
  return null
}
