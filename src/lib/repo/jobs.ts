import 'server-only'
import { randomUUID } from 'node:crypto'
import { exec, json, one, query } from '../db'

// PDF dibuat langsung (sinkron) lewat GET /api/reports/:id/pdf, jadi tidak lewat antrean.
export type JobType = 'screenshot' | 'post'
export const JOB_TYPES: JobType[] = ['screenshot', 'post']
// queued = antre, running = jalan, done = selesai, failed = gagal (FR-9)
export type JobStatus = 'queued' | 'running' | 'done' | 'failed'

export type Job = {
  id: string
  userId: string
  reportId: string | null
  type: JobType
  payload: Record<string, unknown>
  status: JobStatus
  attempts: number
  error: string | null
  result: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}

type Row = {
  id: string
  user_id: string
  report_id: string | null
  type: string
  payload: unknown
  status: string
  attempts: number
  error: string | null
  result: unknown
  created_at: Date
  updated_at: Date
}

const map = (r: Row): Job => ({
  id: r.id,
  userId: r.user_id,
  reportId: r.report_id,
  type: r.type as JobType,
  payload: json(r.payload, {}),
  status: r.status as JobStatus,
  attempts: r.attempts,
  error: r.error,
  result: json(r.result, null),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const MAX_ATTEMPTS = 3
/** Job "running" yang tidak bergerak selama ini dianggap mati (proses restart, dsb.). */
const STALE_MS = 10 * 60 * 1000

export async function insertJob(j: { userId: string; reportId: string | null; type: JobType; payload: object }) {
  const id = randomUUID()
  await exec('INSERT INTO jobs (id, user_id, report_id, type, payload, status) VALUES (?, ?, ?, ?, ?, ?)', [
    id,
    j.userId,
    j.reportId,
    j.type,
    JSON.stringify(j.payload),
    'queued',
  ])
  return id
}

export async function getJob(id: string): Promise<Job | null> {
  const r = await one<Row>('SELECT * FROM jobs WHERE id = ?', [id])
  return r ? map(r) : null
}

export async function listReportJobs(reportId: string, limit = 30): Promise<Job[]> {
  await exec(
    "UPDATE jobs SET status = 'failed', error = 'Job berhenti (timeout)' WHERE report_id = ? AND status IN ('queued','running') AND updated_at < ?",
    [reportId, new Date(Date.now() - STALE_MS)],
  )
  const rows = await query<Row>('SELECT * FROM jobs WHERE report_id = ? ORDER BY created_at DESC LIMIT ?', [reportId, limit])
  return rows.map(map)
}

export async function activeJob(reportId: string, type: JobType): Promise<Job | null> {
  const r = await one<Row>(
    "SELECT * FROM jobs WHERE report_id = ? AND type = ? AND status IN ('queued','running') AND updated_at >= ? ORDER BY created_at DESC LIMIT 1",
    [reportId, type, new Date(Date.now() - STALE_MS)],
  )
  return r ? map(r) : null
}

/** Mengambil job untuk dijalankan. Atomik: hanya satu runner yang bisa memindahkan status ke running. */
export async function claimJob(id: string): Promise<Job | null> {
  const res = await exec(
    "UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND status IN ('queued','failed') AND attempts < ?",
    [id, MAX_ATTEMPTS],
  )
  if (res.affectedRows === 0) return null
  return getJob(id)
}

export async function finishJob(id: string, result: object) {
  await exec("UPDATE jobs SET status = 'done', result = ?, error = NULL, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?", [
    JSON.stringify(result),
    id,
  ])
}

export async function failJob(id: string, error: string, final: boolean) {
  await exec('UPDATE jobs SET status = ?, error = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [
    final ? 'failed' : 'queued',
    error.slice(0, 2000),
    id,
  ])
}
