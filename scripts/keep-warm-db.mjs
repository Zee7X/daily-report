// Menjalankan SELECT 1 ke setiap database di KEEPWARM_DATABASE_URLS (satu URL mysql:// per baris).
// Dipakai .github/workflows/keep-warm.yml. Berdiri sendiri: tidak mengimpor kode aplikasi.
// Output hanya "host[/db] OK 123ms" atau "host[/db] FAIL <kode>"; password di-mask sebelum apa pun dicetak.
import { createRequire } from 'node:module'
import path from 'node:path'

// mysql2 dicari di KEEPWARM_MODULES (folder berisi node_modules), default: folder kerja.
const require = createRequire(path.join(path.resolve(process.env.KEEPWARM_MODULES || '.'), 'x.js'))
const mysql = require('mysql2/promise')

const lines = (process.env.KEEPWARM_DATABASE_URLS || '')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))

if (lines.length === 0) {
  console.log('KEEPWARM_DATABASE_URLS kosong, dilewati.')
  process.exit(0)
}

const targets = lines.map((line) => {
  try {
    return { url: new URL(line) }
  } catch {
    return { error: 'invalid-url' }
  }
})

// Mask dulu semua password (mentah dan hasil decode) sebelum ada log lain.
for (const t of targets) {
  if (!t.url) continue
  for (const p of new Set([t.url.password, safeDecode(t.url.password)])) {
    if (p) console.log(`::add-mask::${p}`)
  }
}

let failed = 0
for (const t of targets) {
  if (!t.url) {
    console.log(`(url tidak valid) FAIL ${t.error}`)
    failed++
    continue
  }
  const { url } = t
  const database = safeDecode(url.pathname.replace(/^\//, ''))
  // Tanpa database di URL: hanya host yang dicek (user keepwarm tidak punya hak ke database mana pun).
  const label = database ? `${url.hostname}/${database}` : url.hostname
  const isTidb = /tidbcloud\.com$/.test(url.hostname)
  const useTls = isTidb || url.searchParams.get('ssl') === 'true'
  const started = Date.now()
  let conn
  try {
    conn = await mysql.createConnection({
      host: url.hostname,
      port: Number(url.port || (isTidb ? 4000 : 3306)),
      user: safeDecode(url.username),
      password: safeDecode(url.password),
      ...(database ? { database } : {}),
      ssl: useTls ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
      connectTimeout: 15000,
    })
    await conn.query('SELECT 1')
    console.log(`${label} OK ${Date.now() - started}ms`)
  } catch (err) {
    // Hanya kode error: pesan mysql2 bisa memuat user dan host.
    console.log(`${label} FAIL ${err?.code || err?.name || 'unknown'}`)
    failed++
  } finally {
    await conn?.end().catch(() => {})
  }
}

// Satu database gagal = ada cluster yang bermasalah, jadi run dibuat merah.
process.exit(failed ? 1 : 0)

function safeDecode(s) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
