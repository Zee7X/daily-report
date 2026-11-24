import { NextResponse } from 'next/server'
import { z } from 'zod'
import { api, HttpError } from '@/lib/http'
import { enqueue } from '@/lib/jobs'
import { requireReport } from '@/lib/report/service'
import { activeJob } from '@/lib/repo/jobs'
import { getTarget } from '@/lib/repo/reports'

const Input = z.object({
  mode: z.enum(['new', 'update']).optional(),
  completeStepIds: z.array(z.string().max(128)).max(200).default([]),
})

// POST /api/reports/:id/post — posting ke kartu tujuan (US-5, FR-10..12)
export const POST = api<{ params: Promise<{ id: string }> }>(async (req, { params, user }) => {
  const { id } = await params
  const report = await requireReport(user, id)
  const input = Input.parse(await req.json().catch(() => ({})))
  const target = await getTarget(report.id)
  if (!target) throw new HttpError(409, 'no_target', 'Tujuan posting belum dipilih')

  // Klik ganda / job yang masih berjalan: kembalikan job yang sama, jangan posting dobel.
  const running = await activeJob(report.id, 'post')
  if (running) return NextResponse.json({ jobId: running.id, reused: true }, { status: 202 })

  // Sudah pernah diposting: pengguna wajib memilih update atau posting baru (FR-11).
  if (target.postedCommentId && !input.mode) {
    throw new HttpError(409, 'already_posted', 'Laporan ini sudah pernah diposting', {
      postedUrl: target.postedUrl,
      postedAt: target.postedAt,
    })
  }

  const jobId = await enqueue('post', {
    userId: user.id,
    reportId: report.id,
    payload: { reportId: report.id, mode: input.mode ?? 'new', completeStepIds: input.completeStepIds },
  })
  return NextResponse.json({ jobId }, { status: 202 })
})
