import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertScreenshotUrl, browserEnabled } from '@/lib/browser'
import { api, HttpError } from '@/lib/http'
import { enqueue } from '@/lib/jobs'
import { limits } from '@/lib/limits'
import { requireReport, toClientImages } from '@/lib/report/service'
import { addImage, listImages, reorderImages } from '@/lib/repo/reports'
import { storage } from '@/lib/storage'

// Job lokal berjalan lewat `after()` di fungsi ini, jadi batas durasinya ikut dinaikkan (Vercel).
export const maxDuration = 300

type Ctx = { params: Promise<{ id: string }> }

const MAX_BYTES = 10 * 1024 * 1024 // US-4: maks. 10 MB per file
const MAX_FILES = 20

/** Jenis file ditentukan dari isi (magic bytes), bukan dari nama atau header yang dikirim browser. */
function sniff(buf: Buffer): 'image/png' | 'image/jpeg' | null {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  return null
}

const ScreenshotInput = z.object({
  urls: z.array(z.string().trim().min(1)).min(1).max(20),
  width: z.number().int().min(320).max(3840).default(1440),
  height: z.number().int().min(240).max(2160).default(900),
  fullPage: z.boolean().default(false),
})

// POST /api/reports/:id/images — upload (multipart) atau minta screenshot (JSON)
export const POST = api<Ctx>(async (req, { params, user }) => {
  const { id } = await params
  const report = await requireReport(user, id)
  const type = req.headers.get('content-type') ?? ''

  if (type.includes('application/json')) {
    if (!browserEnabled()) throw new HttpError(503, 'browser_disabled')
    const input = ScreenshotInput.parse(await req.json())
    for (const url of input.urls) await assertScreenshotUrl(url)
    await limits.imagesPerReport(report.id, input.urls.length)
    await limits.storage(user.id, 0)
    await limits.jobs(user.id, input.urls.length)
    const jobIds: string[] = []
    for (const url of input.urls) {
      jobIds.push(
        await enqueue('screenshot', {
          userId: user.id,
          reportId: report.id,
          payload: { reportId: report.id, url, width: input.width, height: input.height, fullPage: input.fullPage },
        }),
      )
    }
    return NextResponse.json({ jobIds }, { status: 202 })
  }

  const form = await req.formData()
  const files = form.getAll('files').filter((f): f is File => typeof f !== 'string')
  if (!files.length) throw new HttpError(400, 'no_files')
  if (files.length > MAX_FILES) throw new HttpError(400, 'too_many_files')

  const prepared: { name: string; mime: 'image/png' | 'image/jpeg'; data: Buffer }[] = []
  for (const f of files) {
    if (f.size > MAX_BYTES) throw new HttpError(413, 'file_too_large', `${f.name} > 10 MB`)
    const data = Buffer.from(await f.arrayBuffer())
    const mime = sniff(data)
    if (!mime) throw new HttpError(415, 'unsupported_type', `${f.name}: hanya PNG/JPG`)
    prepared.push({ name: f.name, mime, data })
  }

  await limits.imagesPerReport(report.id, prepared.length)
  await limits.storage(user.id, prepared.reduce((n, p) => n + p.data.length, 0))
  for (const p of prepared) {
    const imageId = randomUUID()
    const key = `reports/${report.id}/${imageId}.${p.mime === 'image/png' ? 'png' : 'jpg'}`
    await storage().put(key, p.data, p.mime)
    await addImage({
      id: imageId,
      reportId: report.id,
      caption: p.name.replace(/\.(png|jpe?g)$/i, '').replace(/[_-]+/g, ' ').slice(0, 200),
      storageKey: key,
      mime: p.mime,
      byteSize: p.data.length,
      origin: 'upload',
      sourceUrl: null,
      selected: true,
    })
  }
  return NextResponse.json({ images: await toClientImages(await listImages(report.id)) }, { status: 201 })
})

// PUT /api/reports/:id/images — urutan baru { order: [imageId, ...] }
export const PUT = api<Ctx>(async (req, { params, user }) => {
  const { id } = await params
  await requireReport(user, id)
  const { order } = z.object({ order: z.array(z.string()).max(500) }).parse(await req.json())
  await reorderImages(id, order)
  return NextResponse.json({ images: await toClientImages(await listImages(id)) })
})
