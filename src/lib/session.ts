import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { env } from './env'
import { sign, verify } from './crypto'
import { ensureLocalUser, getUser, type User } from './repo/users'

const COOKIE = 'rt_session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 hari

export async function createSession(userId: string) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE
  const value = `${userId}.${exp}`
  const jar = await cookies()
  jar.set(COOKIE, `${value}.${sign(value, 'session')}`, {
    httpOnly: true,
    secure: env.isCloud,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
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
  if (!user) redirect('/login')
  return user
}
