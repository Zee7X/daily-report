import { NextResponse } from 'next/server'
import { z } from 'zod'
import { api } from '@/lib/http'
import { requireReport } from '@/lib/report/service'
import { describeTarget, resolveTarget } from '@/lib/report/targets'
import { clearTarget, getTarget, setTarget } from '@/lib/repo/reports'

type Ctx = { params: Promise<{ id: string }> }

// PUT /api/reports/:id/target — ganti tujuan posting (kartu connector atau webhook)
export const PUT = api<Ctx>(async (req, { params, user }) => {
  const { id } = await params
  await requireReport(user, id)
  const input = z.object({ provider: z.string().min(1).max(32), cardId: z.string().min(1).max(128) }).parse(await req.json())
  await setTarget(id, await resolveTarget(user, input))
  const target = await getTarget(id)
  return NextResponse.json({ target, targetInfo: await describeTarget(user, target) })
})

// DELETE /api/reports/:id/target — "Salin saja": laporan tanpa tujuan posting
export const DELETE = api<Ctx>(async (_req, { params, user }) => {
  const { id } = await params
  await requireReport(user, id)
  await clearTarget(id)
  return NextResponse.json({ target: null, targetInfo: null })
})
