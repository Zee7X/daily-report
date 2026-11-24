import { NextResponse } from 'next/server'
import { api } from '@/lib/http'
import { requireReport } from '@/lib/report/service'
import { listReportJobs } from '@/lib/repo/jobs'

// GET /api/reports/:id/jobs — status job screenshot/posting untuk polling dari editor
export const GET = api<{ params: Promise<{ id: string }> }>(async (_req, { params, user }) => {
  const { id } = await params
  await requireReport(user, id)
  return NextResponse.json({ jobs: await listReportJobs(id, 20) })
})
