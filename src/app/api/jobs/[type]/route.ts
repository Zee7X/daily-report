import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'
import { errorResponse, HttpError } from '@/lib/http'
import { runJob } from '@/lib/jobs'
import { JOB_TYPES, type JobType } from '@/lib/repo/jobs'

// Batas durasi fungsi di Vercel (posting dengan beberapa lampiran bisa butuh waktu).
export const maxDuration = 300

// POST /api/jobs/:type — dipanggil QStash (tanda tangan Upstash-Signature) atau worker (Bearer JOBS_SECRET).
export async function POST(req: NextRequest, ctx: { params: Promise<{ type: string }> }) {
  try {
    const { type } = await ctx.params
    if (!JOB_TYPES.includes(type as JobType)) throw new HttpError(404, 'unknown_job_type')
    const raw = await req.text()
    await authorize(req, raw)
    const { jobId } = JSON.parse(raw) as { jobId?: string }
    if (!jobId) throw new HttpError(400, 'missing_job_id')
    const outcome = await runJob(jobId, type as JobType)
    // 500 membuat QStash mengulang job; percobaan dibatasi MAX_ATTEMPTS di runJob.
    return NextResponse.json({ outcome }, { status: outcome === 'retry' ? 500 : 200 })
  } catch (err) {
    return errorResponse(err)
  }
}

async function authorize(req: NextRequest, body: string) {
  const signature = req.headers.get('upstash-signature')
  if (signature && env.qstash.currentSigningKey) {
    const { Receiver } = await import('@upstash/qstash')
    const receiver = new Receiver({
      currentSigningKey: env.qstash.currentSigningKey,
      nextSigningKey: env.qstash.nextSigningKey,
    })
    const ok = await receiver.verify({ signature, body }).catch(() => false)
    if (ok) return
    throw new HttpError(401, 'bad_signature')
  }
  const secret = env.jobsSecret
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return
  throw new HttpError(401, 'unauthorized')
}
