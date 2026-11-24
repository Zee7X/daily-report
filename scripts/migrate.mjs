// Menjalankan file SQL di db/migrations secara berurutan dan mencatatnya di schema_migrations.
// Database dibuat otomatis bila belum ada (MySQL lokal / TiDB playground).
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL belum diisi. Salin .env.example ke .env lalu isi nilainya.')
  process.exit(1)
}

const parsed = new URL(url)
const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
if (!/^[A-Za-z0-9_]+$/.test(database)) {
  console.error(`Nama database tidak valid: "${database}"`)
  process.exit(1)
}

const sslOn = (process.env.DATABASE_SSL || (/tidbcloud\.com/.test(url) ? 'true' : 'false')) === 'true'
const ssl = sslOn ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined
const base = {
  host: parsed.hostname,
  port: Number(parsed.port || (/tidbcloud\.com$/.test(parsed.hostname) ? 4000 : 3306)),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  ssl,
  multipleStatements: true,
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')

async function connectWithRetry(opts, attempts = 30) {
  for (let i = 1; ; i++) {
    try {
      return await mysql.createConnection(opts)
    } catch (err) {
      if (i >= attempts) throw err
      console.log(`Menunggu database (${i}/${attempts}): ${err.code ?? err.message}`)
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}

const admin = await connectWithRetry(base)
await admin.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`)
await admin.end()

const conn = await connectWithRetry({ ...base, database })
await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  name VARCHAR(255) NOT NULL PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
)`)
const [rows] = await conn.query('SELECT name FROM schema_migrations')
const done = new Set(rows.map((r) => r.name))

const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
let applied = 0
for (const file of files) {
  if (done.has(file)) continue
  const sql = await readFile(path.join(dir, file), 'utf8')
  console.log(`→ ${file}`)
  await conn.query(sql)
  await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file])
  applied++
}
await conn.end()
console.log(applied ? `Selesai: ${applied} migrasi dijalankan.` : 'Database sudah terbaru.')
