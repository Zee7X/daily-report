import 'server-only'
import type { RenderableImage } from '../connectors/types'
import { HttpError } from '../http'
import { listReportJobs } from '../repo/jobs'
import { getReport, getTarget, listImages, listSources, type ImageRow } from '../repo/reports'
import type { User } from '../repo/users'
import { storage } from '../storage'
import { LABELS, numberImages, renderPrintDocument } from './render'
import type { ReportImage } from './types'

export async function requireReport(user: User, id: string) {
  const report = await getReport(user.id, id)
  if (!report) throw new HttpError(404, 'report_not_found')
  return report
}

export async function toClientImages(rows: ImageRow[]): Promise<ReportImage[]> {
  const s = storage()
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      position: r.position,
      caption: r.caption,
      selected: r.selected,
      origin: r.origin,
      mime: r.mime,
      url: await s.signedUrl(r.storageKey),
      sourceUrl: r.sourceUrl,
    })),
  )
}

export async function loadReportView(user: User, id: string) {
  const report = await requireReport(user, id)
  const [sources, target, images, jobs] = await Promise.all([
    listSources(id),
    getTarget(id),
    listImages(id),
    listReportJobs(id, 20),
  ])
  return { report, sources, target, images: await toClientImages(images), jobs }
}

export function renderable(rows: ImageRow[]): (RenderableImage & { row: ImageRow })[] {
  const numbers = numberImages(rows)
  return rows
    .filter((r) => r.selected)
    .map((r) => ({ id: r.id, number: numbers.get(r.id)!, caption: r.caption, row: r }))
    .sort((a, b) => a.number - b.number)
}

/** HTML cetak dengan gambar tertanam (data URI) agar PDF tidak bergantung pada URL. */
export async function buildPrintHtml(user: User, id: string) {
  const report = await requireReport(user, id)
  const [rows, target] = await Promise.all([listImages(id), getTarget(id)])
  const s = storage()
  const images = await Promise.all(
    renderable(rows).map(async (img) => ({
      ...img,
      src: `data:${img.row.mime};base64,${(await s.get(img.row.storageKey)).toString('base64')}`,
    })),
  )
  const date = new Intl.DateTimeFormat(user.locale === 'en' ? 'en-GB' : 'id-ID', { dateStyle: 'long' }).format(
    report.updatedAt,
  )
  const meta = [date, target?.cardTitle].filter(Boolean).join(' · ')
  return {
    report,
    html: renderPrintDocument(report.title, report.body, images, LABELS[user.locale], meta),
  }
}
