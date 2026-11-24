import 'server-only'
import { attachDatabasePool } from '@vercel/functions'
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
    // TiDB Cloud memakai port 4000; MySQL biasa 3306.
    port: Number(u.port || (/tidbcloud\.com$/.test(u.hostname) ? 4000 : 3306)),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')),
    ssl: env.databaseSsl ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
    connectionLimit: env.isCloud ? 5 : 10,
    waitForConnections: true,
    // Serverless + TiDB Cloud: gateway memutus koneksi yang lama menganggur. Koneksi menganggur ditutup
    // cepat (5 dtk) dan keep-alive aktif, agar request berikutnya tidak tersangkut di koneksi mati.
    maxIdle: env.isCloud ? 2 : 10,
    idleTimeout: env.isCloud ? 5_000 : 60_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    connectTimeout: 10_000,
    timezone: 'Z',
    dateStrings: false,
    charset: 'utf8mb4',
  })
  // Vercel Fluid compute: tutup koneksi menganggur sebelum instance dibekukan.
  if (env.onVercel) attachDatabasePool(g.__rtPool)
  return g.__rtPool
}

type Param = string | number | boolean | Date | null | Buffer
type Executor = Pool | PoolConnection

const CONNECTION_CODES = new Set(['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'EPIPE', 'ETIMEDOUT', 'ECONNREFUSED'])

// SQL errors (ER_*) carry their own code and never match; only dead-socket errors do.
export function isConnectionError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  return Boolean(e && ((e.code && CONNECTION_CODES.has(e.code)) || /connection is in closed state/i.test(e.message ?? '')))
}

// Vercel membekukan instance, gateway TiDB memutus koneksi pool, dan koneksi mati baru ketahuan saat dipakai.
// mysql2 membuang koneksi itu setelah gagal, jadi satu kali ulang mengambil koneksi baru. Hanya untuk pool:
// koneksi tx tidak boleh diulang karena transaksinya sudah hilang bersama koneksinya.
async function run<R>(ex: Executor, fn: () => Promise<R>): Promise<R> {
  try {
    return await fn()
  } catch (err) {
    if ('release' in ex || !isConnectionError(err)) throw err
    return fn()
  }
}

export async function query<T = RowDataPacket>(sql: string, params: Param[] = [], ex: Executor = pool()) {
  const [rows] = await run(ex, () => ex.query<RowDataPacket[]>(sql, params))
  return rows as unknown as T[]
}

export async function one<T = RowDataPacket>(sql: string, params: Param[] = [], ex: Executor = pool()) {
  const rows = await query<T>(sql, params, ex)
  return rows[0] ?? null
}

export async function exec(sql: string, params: Param[] = [], ex: Executor = pool()) {
  const [res] = await run(ex, () => ex.query<ResultSetHeader>(sql, params))
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
