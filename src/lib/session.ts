import 'server-only'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { env } from './env'
import { sign, verify } from './crypto'
import { ensureLocalUser, getUser, type User } from './repo/users'

const COOKIE = 'rt_session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 hari
const AUTH_HOST_MAX_AGE = 60 * 15 // di domain login, sesi hanya untuk menyelesaikan OAuth

/** `short` dipakai di AUTH_URL: sesi di sana cukup untuk alur login/OAuth, lalu kedaluwarsa sendiri. */
export async function createSession(userId: string, opts: { short?: boolean } = {}) {
  const maxAge = opts.short ? AUTH_HOST_MAX_AGE : MAX_AGE
  const exp = Math.floor(Date.now() / 1000) + maxAge
  const value = `${userId}.${exp}`
  const jar = await cookies()
  jar.set(COOKIE, `${value}.${sign(value, 'session')}`, {
    httpOnly: true,
    secure: env.isCloud,
    sameSite: 'lax',
    path: '/',
    maxAge,
  })
}

export async function destroySession() {
  const jar = await cookies()
  jar.delete(COOKIE)
}

async function sessionUserId(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value
  if (!raw) return null
  const parts = raw.split('.')
  if (parts.length !== 3) return null
  const [id, exp, sig] = parts
  if (!verify(`${id}.${exp}`, sig, 'session')) return null
  if (Number(exp) < Date.now() / 1000) return null
  return id
}

/** Pengguna saat ini. Di mode SINGLE_USER, pengguna lokal dibuat otomatis. */
export async function currentUser(): Promise<User | null> {
  if (env.singleUser) return ensureLocalUser()
  const id = await sessionUserId()
  return id ? getUser(id) : null
}

/** Untuk halaman: arahkan ke /login bila belum masuk. */
export async function requireUser(): Promise<User> {
  const user = await currentUser()
  if (!user) {
    const path = (await headers()).get('x-rt-path') ?? '/'
    redirect(path === '/' || !path.startsWith('/') ? '/login' : `/login?next=${encodeURIComponent(path)}`)
  }
  return user
}
