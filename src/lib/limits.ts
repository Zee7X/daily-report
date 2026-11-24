import 'server-only'
import { createHmac, randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
import { exec, one } from './db'
import { env } from './env'
import { HttpError } from './http'

// Pembatas laju dan kuota. Penting saat pendaftaran dibuka untuk umum (SIGNUP_ALLOWED_EMAILS=*):
// mencegah satu akun atau satu IP menghabiskan kuota AI, storage, atau memakai webhook untuk spam.

const HOUR = 3600_000
const DAY = 24 * HOUR

const int = (name: string, fallback: number) => {
  const v = Number(process.env[name])
  return Number.isFinite(v) && v > 0 ? v : fallback
}

export const QUOTA = {
  get aiPerDay() {
    return int('QUOTA_AI_PER_DAY', 30)
  },
  get reportsPerDay() {
    return int('QUOTA_REPORTS_PER_DAY', 50)
  },
  get jobsPerHour() {
    return int('QUOTA_JOBS_PER_HOUR', 60)
  },
  get storageMb() {
    return int('QUOTA_STORAGE_MB', 200)
  },
  imagesPerReport: 50,
  webhookTestsPerHour: 10,
  signupsPerIpPerDay: 5,
  loginFailuresPerEmail: 10,
  loginFailuresPerIp: 30,
  loginWindowMs: 15 * 60_000,
}

function keyHash(key: string) {
  // HMAC dengan kunci aplikasi: tidak bisa dibalik menjadi IP/email walau tabel bocor.
  return createHmac('sha256', env.encryptionKey || 'rate').update(key).digest('hex')
}

export async function count(bucket: string, key: string, windowMs: number): Promise<number> {
  const r = await one<{ n: number }>(
    'SELECT COUNT(*) AS n FROM rate_events WHERE bucket = ? AND key_hash = ? AND created_at > ?',
    [bucket, keyHash(key), new Date(Date.now() - windowMs)],
  )
  return Number(r?.n ?? 0)
}

export async function record(bucket: string, key: string, times = 1) {
  for (let i = 0; i < times; i++) {
    await exec('INSERT INTO rate_events (id, bucket, key_hash) VALUES (?, ?, ?)', [randomUUID(), bucket, keyHash(key)])
  }
  if (Math.random() < 0.02) await exec('DELETE FROM rate_events WHERE created_at < ?', [new Date(Date.now() - 2 * DAY)])
}

/** Hitung lalu catat; lempar 429 bila batas sudah tercapai. */
export async function consume(bucket: string, key: string, limit: number, windowMs: number, message: string, times = 1, vars?: Record<string, string | number>) {
  if ((await count(bucket, key, windowMs)) + times > limit) throw new HttpError(429, 'rate_limited', message, undefined, vars)
  await record(bucket, key, times)
}

export async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

export const limits = {
  async signup(ip: string) {
    await consume('signup', ip, QUOTA.signupsPerIpPerDay, DAY, 'rateSignup')
  },
  async loginBlocked(email: string, ip: string) {
    const [byEmail, byIp] = await Promise.all([
      count('login_fail', `e:${email.toLowerCase()}`, QUOTA.loginWindowMs),
      count('login_fail', `ip:${ip}`, QUOTA.loginWindowMs),
    ])
    return byEmail >= QUOTA.loginFailuresPerEmail || byIp >= QUOTA.loginFailuresPerIp
  },
  async loginFailed(email: string, ip: string) {
    await record('login_fail', `e:${email.toLowerCase()}`)
    await record('login_fail', `ip:${ip}`)
  },
  async report(userId: string) {
    await consume('report', userId, QUOTA.reportsPerDay, DAY, 'rateReport', 1, { limit: QUOTA.reportsPerDay })
  },
  /** Mengembalikan false bila kuota AI hari ini habis (draf tetap dibuat, tanpa AI). */
  async tryAi(userId: string): Promise<boolean> {
    if ((await count('ai', userId, DAY)) >= QUOTA.aiPerDay) return false
    await record('ai', userId)
    return true
  },
  async jobs(userId: string, n: number) {
    await consume('job', userId, QUOTA.jobsPerHour, HOUR, 'rateJobs', n, { limit: QUOTA.jobsPerHour })
  },
  async webhookTest(userId: string) {
    await consume('webhook_test', userId, QUOTA.webhookTestsPerHour, HOUR, 'rateWebhookTest')
  },
  /** Total storage gambar milik pengguna + tambahan baru tidak boleh melebihi kuota. */
  async storage(userId: string, addBytes: number) {
    const r = await one<{ total: number | null }>(
      'SELECT SUM(i.byte_size) AS total FROM report_images i JOIN reports r ON r.id = i.report_id WHERE r.user_id = ?',
      [userId],
    )
    if (Number(r?.total ?? 0) + addBytes > QUOTA.storageMb * 1024 * 1024) {
      throw new HttpError(413, 'storage_quota', 'storageQuota', undefined, { mb: QUOTA.storageMb })
    }
  },
  async imagesPerReport(reportId: string, adding: number) {
    const r = await one<{ n: number }>('SELECT COUNT(*) AS n FROM report_images WHERE report_id = ?', [reportId])
    if (Number(r?.n ?? 0) + adding > QUOTA.imagesPerReport) {
      throw new HttpError(413, 'image_limit', 'imageLimit', undefined, { max: QUOTA.imagesPerReport })
    }
  },
}
