import 'server-only'
import { after } from 'next/server'
import { env } from '../env'
import { claimJob, failJob, finishJob, getJob, insertJob, MAX_ATTEMPTS, type Job, type JobType } from '../repo/jobs'
import { handlers } from './handlers'

// Antrean job (FR-9). Driver dipilih lewat QUEUE_DRIVER:
//   local  → dijalankan di proses yang sama setelah response dikirim (next/server `after`, di Vercel
//            memakai waitUntil sehingga fungsi tetap hidup sampai job selesai), retry dengan backoff
//   qstash → Upstash QStash memanggil POST /api/jobs/:type, QStash yang mengulang bila gagal

export async function enqueue(type: JobType, j: { userId: string; reportId: string | null; payload: object }) {
  const id = await insertJob({ ...j, type })
  if (env.queueDriver === 'qstash') await publishQstash(type, id)
  else
    after(async () => {
      await runLocal(id)
    })
  return id
}

async function publishQstash(type: JobType, jobId: string) {
  const { Client } = await import('@upstash/qstash')
  const client = new Client({ token: env.qstash.token })
  await client.publishJSON({
    url: `${env.appUrl}/api/jobs/${type}`,
    body: { jobId },
    retries: MAX_ATTEMPTS - 1,
  })
}

async function runLocal(jobId: string) {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const outcome = await runJob(jobId)
    if (outcome !== 'retry') return
    await new Promise((r) => setTimeout(r, 2000 * 2 ** i))
  }
}

/**
 * Menjalankan satu percobaan job. Dipakai runner lokal dan endpoint /api/jobs/:type.
 * Mengembalikan 'retry' bila gagal tapi masih ada sisa percobaan.
 */
export async function runJob(jobId: string, expectedType?: JobType): Promise<'done' | 'retry' | 'failed' | 'skipped'> {
  const peek = await getJob(jobId)
  if (!peek || (expectedType && peek.type !== expectedType)) return 'skipped'
  const job = await claimJob(jobId)
  if (!job) return 'skipped'
  try {
    const result = await handlers[job.type](job as Job)
    await finishJob(job.id, result ?? {})
    return 'done'
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const final = job.attempts >= MAX_ATTEMPTS
    console.error(`Job ${job.type} ${job.id} percobaan ${job.attempts} gagal:`, message)
    await failJob(job.id, message, final)
    return final ? 'failed' : 'retry'
  }
}
