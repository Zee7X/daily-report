import 'server-only'
import { randomUUID } from 'node:crypto'
import { exec, one, query } from '../db'
import { decrypt, encrypt } from '../crypto'

export type DestinationKind = 'discord' | 'slack' | 'teams' | 'generic'
export const DESTINATION_KINDS: DestinationKind[] = ['discord', 'slack', 'teams', 'generic']

export type Destination = {
  id: string
  kind: DestinationKind
  name: string
  url: string
  secret: string | null
  createdAt: Date
}

/** Tampilan aman untuk browser: URL disamarkan, secret tidak pernah dikirim. */
export type PublicDestination = { id: string; kind: DestinationKind; name: string; urlHint: string; hasSecret: boolean }

type Row = { id: string; kind: string; name: string; url: string; secret: string | null; created_at: Date }

const map = (r: Row): Destination => ({
  id: r.id,
  kind: r.kind as DestinationKind,
  name: r.name,
  url: decrypt(r.url),
  secret: r.secret ? decrypt(r.secret) : null,
  createdAt: r.created_at,
})

export function toPublic(d: Destination): PublicDestination {
  let hint = ''
  try {
    const u = new URL(d.url)
    hint = `${u.host}${u.pathname.length > 18 ? `${u.pathname.slice(0, 14)}…` : u.pathname}`
  } catch {
    hint = '—'
  }
  return { id: d.id, kind: d.kind, name: d.name, urlHint: hint, hasSecret: Boolean(d.secret) }
}

export async function listDestinations(userId: string): Promise<Destination[]> {
  const rows = await query<Row>('SELECT * FROM destinations WHERE user_id = ? ORDER BY created_at', [userId])
  return rows.map(map)
}

export async function getDestination(userId: string, id: string): Promise<Destination | null> {
  const r = await one<Row>('SELECT * FROM destinations WHERE id = ? AND user_id = ?', [id, userId])
  return r ? map(r) : null
}

export async function createDestination(
  userId: string,
  d: { kind: DestinationKind; name: string; url: string; secret: string | null },
): Promise<string> {
  const id = randomUUID()
  await exec('INSERT INTO destinations (id, user_id, kind, name, url, secret) VALUES (?, ?, ?, ?, ?, ?)', [
    id,
    userId,
    d.kind,
    d.name,
    encrypt(d.url),
    d.secret ? encrypt(d.secret) : null,
  ])
  return id
}

export async function deleteDestination(userId: string, id: string): Promise<boolean> {
  const res = await exec('DELETE FROM destinations WHERE id = ? AND user_id = ?', [id, userId])
  return res.affectedRows > 0
}
