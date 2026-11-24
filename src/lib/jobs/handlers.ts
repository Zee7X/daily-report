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
import { getDestination } from '../repo/destinations'
import { getUser } from '../repo/users'
import { limits } from '../limits'
import { storage } from '../storage'
import { KIND_LABEL, sendWebhook, type WebhookImage } from '../webhooks'

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
  await limits.storage(job.userId, png.length)
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
  if (!target) throw new Error('Tujuan posting belum dipilih')
  const labels = LABELS[user.locale]

  // Tujuan webhook: Discord/Slack/Teams/JSON umum. Webhook tidak bisa mengedit pesan lama, jadi selalu kirim baru.
  if (target.provider === 'webhook') {
    const dest = await getDestination(user.id, target.cardId)
    if (!dest) throw new Error('Webhook tujuan sudah dihapus')
    const images: WebhookImage[] = []
    for (const img of renderable(await listImages(report.id))) {
      images.push({ id: img.id, number: img.number, caption: img.caption, mime: img.row.mime, data: await storage().get(img.row.storageKey) })
    }
    const result = await sendWebhook(dest, { id: report.id, title: report.title, body: report.body, images, labels })
    await markPosted(target.id, { commentId: result.messageId ?? `sent:${job.id}`, url: result.url, jobId: job.id })
    await setReportStatus(report.id, 'posted')
    const log = await getDraftLog(report.id)
    if (log) await saveFinalLog(log.id, report.body, computeEditDiff(log.draftBody, report.body))
    return { mode: 'new', destination: KIND_LABEL[dest.kind], images: result.imagesSent, note: result.note, url: result.url }
  }

  const { connector, conn } = await requireConnection(user.id, target.provider)

  // Idempoten: bila percobaan sebelumnya dari job ini sudah berhasil membuat komentar, perbarui saja.
  let mode = p.mode
  if (mode === 'new' && target.lastPostJobId === job.id && target.postedCommentId) mode = 'update'
  if (mode === 'update' && (!target.postedCommentId || !connector.updateReport)) mode = 'new'

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
