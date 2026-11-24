import 'server-only'
import { randomUUID } from 'node:crypto'
import { exec, json, one } from '../db'
import { decrypt, encrypt } from '../crypto'

export type ConnectionAccount = { id: string; name: string }

export type Connection = {
  id: string
  userId: string
  provider: string
  accountId: string
  accountName: string
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
  meta: { accounts?: ConnectionAccount[]; email?: string }
}

type Row = {
  id: string
  user_id: string
  provider: string
  account_id: string
  account_name: string
  access_token: string
  refresh_token: string | null
  expires_at: Date | null
  meta: unknown
}

function map(r: Row): Connection {
  return {
    id: r.id,
    userId: r.user_id,
    provider: r.provider,
    accountId: r.account_id,
    accountName: r.account_name,
    accessToken: decrypt(r.access_token),
    refreshToken: r.refresh_token ? decrypt(r.refresh_token) : null,
    expiresAt: r.expires_at,
    meta: json(r.meta, {}),
  }
}

export async function getConnection(userId: string, provider: string): Promise<Connection | null> {
  const r = await one<Row>('SELECT * FROM connections WHERE user_id = ? AND provider = ?', [userId, provider])
  return r ? map(r) : null
}

export type ConnectionInput = Omit<Connection, 'id' | 'userId' | 'provider'>

/** Token selalu disimpan terenkripsi (FR-2, BR-13). */
export async function saveConnection(userId: string, provider: string, c: ConnectionInput) {
  await exec(
    `INSERT INTO connections (id, user_id, provider, account_id, account_name, access_token, refresh_token, expires_at, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE account_id = VALUES(account_id), account_name = VALUES(account_name),
       access_token = VALUES(access_token), refresh_token = VALUES(refresh_token),
       expires_at = VALUES(expires_at), meta = VALUES(meta), updated_at = CURRENT_TIMESTAMP(3)`,
    [
      randomUUID(),
      userId,
      provider,
      c.accountId,
      c.accountName,
      encrypt(c.accessToken),
      c.refreshToken ? encrypt(c.refreshToken) : null,
      c.expiresAt,
      JSON.stringify(c.meta ?? {}),
    ],
  )
}

export async function updateTokens(
  id: string,
  t: { accessToken: string; refreshToken: string | null; expiresAt: Date | null },
) {
  await exec(
    'UPDATE connections SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
    [encrypt(t.accessToken), t.refreshToken ? encrypt(t.refreshToken) : null, t.expiresAt, id],
  )
}

export async function deleteConnection(userId: string, provider: string) {
  await exec('DELETE FROM connections WHERE user_id = ? AND provider = ?', [userId, provider])
}
