import 'server-only'
import { randomUUID } from 'node:crypto'
import { exec, one } from '../db'

export type User = {
  id: string
  email: string
  name: string
  locale: 'id' | 'en'
  /** Dinaikkan saat logout/pemulihan akun; cookie sesi dengan versi lama ditolak. */
  sessionVersion: number
  /** true bila kepemilikan email terbukti (akun dari "Login with Basecamp"). */
  emailVerified: boolean
}

type Row = { id: string; email: string; name: string; locale: string; session_version: number; email_verified: number }

const COLS = 'id, email, name, locale, session_version, email_verified'

const map = (r: Row): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  locale: r.locale === 'en' ? 'en' : 'id',
  sessionVersion: Number(r.session_version ?? 0),
  emailVerified: Boolean(r.email_verified),
})

export const LOCAL_EMAIL = 'local@localhost'

export async function getUser(id: string): Promise<User | null> {
  const r = await one<Row>(`SELECT ${COLS} FROM users WHERE id = ?`, [id])
  return r ? map(r) : null
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const r = await one<Row>(`SELECT ${COLS} FROM users WHERE email = ?`, [email.toLowerCase()])
  return r ? map(r) : null
}

export async function createUser(
  email: string,
  name: string,
  opts: { passwordHash?: string | null; emailVerified?: boolean } = {},
): Promise<User> {
  const id = randomUUID()
  await exec('INSERT IGNORE INTO users (id, email, name, password_hash, email_verified) VALUES (?, ?, ?, ?, ?)', [
    id,
    email.toLowerCase(),
    name,
    opts.passwordHash ?? null,
    opts.emailVerified ? 1 : 0,
  ])
  const user = await findUserByEmail(email)
  if (!user) throw new Error('Gagal membuat pengguna')
  return user
}

export async function getPasswordHash(email: string): Promise<{ user: User; hash: string | null } | null> {
  const r = await one<Row & { password_hash: string | null }>(`SELECT ${COLS}, password_hash FROM users WHERE email = ?`, [
    email.toLowerCase(),
  ])
  return r ? { user: map(r), hash: r.password_hash } : null
}

/** Membatalkan semua sesi pengguna (logout di semua perangkat). */
export async function bumpSessionVersion(id: string) {
  await exec('UPDATE users SET session_version = session_version + 1 WHERE id = ?', [id])
}

/**
 * Pemilik email terbukti lewat Basecamp. Bila akun ini sebelumnya dibuat dengan password oleh orang
 * yang belum terbukti memiliki email tersebut, password itu dihapus dan semua sesinya dibatalkan,
 * agar pendaftar palsu kehilangan akses sebelum pemilik asli menghubungkan Basecamp-nya.
 */
export async function markEmailVerified(user: User, opts: { keepPassword?: boolean } = {}): Promise<User> {
  if (user.emailVerified) return user
  if (opts.keepPassword) {
    // Pemegang sesi akun ini sendiri yang menghubungkan Basecamp dengan email yang sama: dia pemiliknya.
    await exec('UPDATE users SET email_verified = 1 WHERE id = ?', [user.id])
  } else {
    await exec(
      'UPDATE users SET email_verified = 1, password_hash = NULL, session_version = session_version + 1 WHERE id = ?',
      [user.id],
    )
  }
  return (await getUser(user.id))!
}

let localUser: User | null = null

/** Pengguna tunggal untuk SINGLE_USER=true (hanya mode lokal di komputer sendiri). */
export async function ensureLocalUser(): Promise<User> {
  if (localUser) return localUser
  localUser = (await findUserByEmail(LOCAL_EMAIL)) ?? (await createUser(LOCAL_EMAIL, 'Local user'))
  return localUser
}

export async function setUserLocale(id: string, locale: 'id' | 'en') {
  await exec('UPDATE users SET locale = ? WHERE id = ?', [locale, id])
  if (localUser?.id === id) localUser = { ...localUser, locale }
}

export async function setUserName(id: string, name: string) {
  await exec("UPDATE users SET name = ? WHERE id = ? AND (name = '' OR name = 'Local user')", [name, id])
  if (localUser?.id === id) localUser = null
}
