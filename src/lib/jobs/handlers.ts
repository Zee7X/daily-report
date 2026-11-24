import 'server-only'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { screenshot } from '../browser'
import { requireConnection } from '../connectors'
import type { RenderableImage } from '../connectors/types'
import { computeEditDiff } from '../report/diff'
import { LABELS } from '../report/render'
import { renderable } from '../report/service'
import type { Job, JobType } from '../repo/jobs'
import {
  addImage,
  getDraftLog,
  getReport,
  getTarget,
  listImages,
  markPosted,
  saveFinalLog,
  setReportStatus,
} from '../repo/reports'
import { getUser } from '../repo/users'
import { storage } from '../storage'

type Handler = (job: Job) => Promise<Record<string, unknown>>

export const ScreenshotPayload = z.object({
  reportId: z.string(),
  url: z.string().url(),
  width: z.number().int().min(320).max(3840).default(1440),
  height: z.number().int().min(240).max(2160).default(900),
  fullPage: z.boolean().default(false),
})

export const PostPayload = z.object({
  reportId: z.string(),
  mode: z.enum(['new', 'update']),
  completeStepIds: z.array(z.string()).max(200).default([]),
})

function captionFromUrl(raw: string) {
  try {
    const u = new URL(raw)
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}`
  } catch {
    return raw
  }
}

const screenshotHandler: Handler = async (job) => {
  const p = ScreenshotPayload.parse(job.payload)
  const report = await getReport(job.userId, p.reportId)
  if (!report) throw new Error('Laporan tidak ditemukan')
  const png = await screenshot(p.url, { width: p.width, height: p.height, fullPage: p.fullPage })
  const id = randomUUID()
  const key = `reports/${report.id}/${id}.png`
  await storage().put(key, png, 'image/png')
  await addImage({
    id,
    reportId: report.id,
    caption: captionFromUrl(p.url),
    storageKey: key,
    mime: 'image/png',
    byteSize: png.length,
    origin: 'screenshot',
    sourceUrl: p.url,
    selected: true,
  })
  return { imageId: id, url: p.url }
}

const postHandler: Handler = async (job) => {
  const p = PostPayload.parse(job.payload)
  const user = await getUser(job.userId)
  const report = await getReport(job.userId, p.reportId)
  if (!user || !report) throw new Error('Laporan tidak ditemukan')
  const target = await getTarget(report.id)
  if (!target) throw new Error('Kartu tujuan belum dipilih')
  const { connector, conn } = await requireConnection(user.id, target.provider)

  // Idempoten: bila percobaan sebelumnya dari job ini sudah berhasil membuat komentar, perbarui saja.
  let mode = p.mode
  if (mode === 'new' && target.lastPostJobId === job.id && target.postedCommentId) mode = 'update'
  if (mode === 'update' && !target.postedCommentId) mode = 'new'

  const labels = LABELS[user.locale]
  const images: RenderableImage[] = []
  for (const img of renderable(await listImages(report.id))) {
    let ref
    if (connector.uploadImage) {
      const data = await storage().get(img.row.storageKey)
      const ext = img.row.mime === 'image/jpeg' ? 'jpg' : 'png'
      const sgid = await connector.uploadImage(conn, target.cardId, {
        name: `${labels.figure.toLowerCase()}-${img.number}.${ext}`,
        mime: img.row.mime,
        data,
      })
      ref = { sgid, caption: img.caption }
    }
    images.push({ id: img.id, number: img.number, caption: img.caption, ref })
  }

  const html = connector.renderReport(report.body, images, labels)
  const posted =
    mode === 'update' && connector.updateReport
      ? await connector.updateReport(conn, { commentId: target.postedCommentId!, url: target.postedUrl }, html)
      : await connector.postReport(conn, target.cardId, html)

  await markPosted(target.id, { commentId: posted.commentId, url: posted.url, jobId: job.id })
  await setReportStatus(report.id, 'posted')

  let completedSteps = 0
  if (p.completeStepIds.length && connector.setChecklist) {
    await connector.setChecklist(conn, target.cardId, p.completeStepIds)
    completedSteps = p.completeStepIds.length
  }

  const log = await getDraftLog(report.id)
  if (log) await saveFinalLog(log.id, report.body, computeEditDiff(log.draftBody, report.body))

  return { mode, commentId: posted.commentId, url: posted.url, images: images.length, completedSteps }
}

export const handlers: Record<JobType, Handler> = {
  screenshot: screenshotHandler,
  post: postHandler,
}
