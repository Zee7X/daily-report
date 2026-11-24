import 'server-only'
import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise'
import { env } from './env'

// Satu pool per proses. Disimpan di globalThis agar tidak dibuat ulang saat hot reload.
const g = globalThis as unknown as { __rtPool?: Pool }

export function pool(): Pool {
  if (g.__rtPool) return g.__rtPool
  if (!env.databaseUrl) throw new Error('DATABASE_URL belum diisi')
  const u = new URL(env.databaseUrl)
  g.__rtPool = mysql.createPool({
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')),
    ssl: env.databaseSsl ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
    connectionLimit: env.isCloud ? 5 : 10,
    waitForConnections: true,
    timezone: 'Z',
    dateStrings: false,
    charset: 'utf8mb4',
  })
  return g.__rtPool
}

type Param = string | number | boolean | Date | null | Buffer
type Executor = Pool | PoolConnection

export async function query<T = RowDataPacket>(sql: string, params: Param[] = [], ex: Executor = pool()) {
  const [rows] = await ex.query<RowDataPacket[]>(sql, params)
  return rows as unknown as T[]
}

export async function one<T = RowDataPacket>(sql: string, params: Param[] = [], ex: Executor = pool()) {
  const rows = await query<T>(sql, params, ex)
  return rows[0] ?? null
}

export async function exec(sql: string, params: Param[] = [], ex: Executor = pool()) {
  const [res] = await ex.query<ResultSetHeader>(sql, params)
  return res
}

export async function tx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool().getConnection()
  try {
    await conn.beginTransaction()
    const out = await fn(conn)
    await conn.commit()
    return out
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

/** Kolom JSON: MySQL mengembalikan objek, TiDB/driver lama bisa mengembalikan string. */
export function json<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T
    } catch {
      return fallback
    }
  }
  return v as T
}
