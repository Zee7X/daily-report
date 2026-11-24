import 'server-only'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { env } from './env'
import { sign, verify } from './crypto'
import { bumpSessionVersion, ensureLocalUser, getUser, type User } from './repo/users'

const COOKIE = 'rt_session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 hari

/**
 * Cookie sesi: "<userId>.<sessionVersion>.<exp>.<hmac>". Versi dibandingkan dengan database setiap request,
 * jadi logout atau pemulihan akun langsung membatalkan cookie lama di semua perangkat.
 */
export async function createSession(user: User) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE
  const value = `${user.id}.${user.sessionVersion}.${exp}`
  const jar = await cookies()
  jar.set(COOKIE, `${value}.${sign(value, 'session')}`, {
    httpOnly: true,
    secure: env.isCloud,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  })
}

/** Logout: hapus cookie di browser ini dan batalkan semua sesi lain milik pengguna. */
export async function destroySession(user?: User | null) {
  if (user && !env.singleUser) await bumpSessionVersion(user.id)
  const jar = await cookies()
  jar.delete(COOKIE)
}

async function parseSession(): Promise<{ id: string; version: number } | null> {
  const raw = (await cookies()).get(COOKIE)?.value
  if (!raw) return null
  const parts = raw.split('.')
  if (parts.length !== 4) return null
  const [id, version, exp, sig] = parts
  if (!verify(`${id}.${version}.${exp}`, sig, 'session')) return null
  if (Number(exp) < Date.now() / 1000) return null
  return { id, version: Number(version) }
}

/** Pengguna saat ini. Di mode SINGLE_USER (hanya lokal), pengguna lokal dibuat otomatis. */
export async function currentUser(): Promise<User | null> {
  if (env.singleUser) return ensureLocalUser()
  const s = await parseSession()
  if (!s) return null
  const user = await getUser(s.id)
  return user && user.sessionVersion === s.version ? user : null
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
