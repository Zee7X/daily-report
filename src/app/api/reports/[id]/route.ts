import { NextResponse } from 'next/server'
import { z } from 'zod'
import { api, HttpError } from '@/lib/http'
import { loadReportView } from '@/lib/report/service'
import { ReportBodySchema } from '@/lib/report/types'
import { deleteReport, getReport, updateReport } from '@/lib/repo/reports'
import { storage } from '@/lib/storage'

type Ctx = { params: Promise<{ id: string }> }

const PatchInput = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  body: ReportBodySchema.optional(),
})

export const GET = api<Ctx>(async (_req, { params, user }) => {
  const { id } = await params
  return NextResponse.json(await loadReportView(user, id))
})

// PATCH /api/reports/:id — simpan perubahan draf (FR-7)
export const PATCH = api<Ctx>(async (req, { params, user }) => {
  const { id } = await params
  const patch = PatchInput.parse(await req.json())
  if (!(await getReport(user.id, id))) throw new HttpError(404, 'report_not_found')
  await updateReport(user.id, id, patch)
  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() })
})

// DELETE /api/reports/:id — pengguna bisa menghapus data laporannya (PRD 7, Privasi)
export const DELETE = api<Ctx>(async (_req, { params, user }) => {
  const { id } = await params
  const keys = await deleteReport(user.id, id)
  if (!keys) throw new HttpError(404, 'report_not_found')
  await Promise.allSettled(keys.map((k) => storage().delete(k)))
  return NextResponse.json({ ok: true })
})
