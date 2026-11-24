import { NextResponse } from 'next/server'
import { z } from 'zod'
import { api, HttpError } from '@/lib/http'
import { requireReport } from '@/lib/report/service'
import { deleteImage, getImage, updateImage } from '@/lib/repo/reports'
import { storage } from '@/lib/storage'

type Ctx = { params: Promise<{ id: string; imageId: string }> }

const PatchInput = z.object({
  caption: z.string().max(500).optional(),
  selected: z.boolean().optional(),
})

export const PATCH = api<Ctx>(async (req, { params, user }) => {
  const { id, imageId } = await params
  await requireReport(user, id)
  if (!(await getImage(id, imageId))) throw new HttpError(404, 'image_not_found')
  await updateImage(id, imageId, PatchInput.parse(await req.json()))
  return NextResponse.json({ ok: true })
})

export const DELETE = api<Ctx>(async (_req, { params, user }) => {
  const { id, imageId } = await params
  await requireReport(user, id)
  const img = await deleteImage(id, imageId)
  if (!img) throw new HttpError(404, 'image_not_found')
  await storage().delete(img.storageKey).catch(() => undefined)
  return NextResponse.json({ ok: true })
})
