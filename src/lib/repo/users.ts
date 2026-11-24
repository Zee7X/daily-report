import 'server-only'
import { randomUUID } from 'node:crypto'
import { exec, one } from '../db'

export type User = { id: string; email: string; name: string; locale: 'id' | 'en' }

type Row = { id: string; email: string; name: string; locale: string }

const map = (r: Row): User => ({ id: r.id, email: r.email, name: r.name, locale: r.locale === 'en' ? 'en' : 'id' })

export const LOCAL_EMAIL = 'local@localhost'

export async function getUser(id: string): Promise<User | null> {
  const r = await one<Row>('SELECT id, email, name, locale FROM users WHERE id = ?', [id])
  return r ? map(r) : null
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const r = await one<Row>('SELECT id, email, name, locale FROM users WHERE email = ?', [email.toLowerCase()])
  return r ? map(r) : null
}

export async function createUser(email: string, name: string): Promise<User> {
  const id = randomUUID()
  await exec('INSERT IGNORE INTO users (id, email, name) VALUES (?, ?, ?)', [id, email.toLowerCase(), name])
  const user = await findUserByEmail(email)
  if (!user) throw new Error('Gagal membuat pengguna')
  return user
}

let localUser: User | null = null

/** Pengguna tunggal untuk SINGLE_USER=true. */
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
