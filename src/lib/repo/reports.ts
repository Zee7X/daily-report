import 'server-only'
import { randomUUID } from 'node:crypto'
import { exec, json, one, query, tx } from '../db'
import type { ReportBody } from '../report/types'

export type ReportStatus = 'draft' | 'posted'

export type ReportSource = { id: string; provider: string; refType: string; refId: string; url: string | null; title: string }

export type ReportTarget = {
  id: string
  provider: string
  cardId: string
  cardUrl: string | null
  cardTitle: string
  postedCommentId: string | null
  postedUrl: string | null
  postedAt: Date | null
  lastPostJobId: string | null
}

export type ImageRow = {
  id: string
  reportId: string
  position: number
  caption: string
  storageKey: string
  mime: string
  byteSize: number
  origin: 'upload' | 'screenshot'
  sourceUrl: string | null
  selected: boolean
}

export type Report = {
  id: string
  userId: string
  templateId: string | null
  title: string
  body: ReportBody
  status: ReportStatus
  createdAt: Date
  updatedAt: Date
}

export type ReportListItem = Report & { target: ReportTarget | null; imageCount: number }

type ReportRow = {
  id: string
  user_id: string
  template_id: string | null
  title: string
  body: unknown
  status: string
  created_at: Date
  updated_at: Date
}

const mapReport = (r: ReportRow): Report => ({
  id: r.id,
  userId: r.user_id,
  templateId: r.template_id,
  title: r.title,
  body: json(r.body, { intro: '', sections: [], closing: '' }),
  status: r.status === 'posted' ? 'posted' : 'draft',
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

type TargetRow = {
  id: string
  report_id: string
  provider: string
  card_id: string
  card_url: string | null
  card_title: string
  posted_comment_id: string | null
  posted_url: string | null
  posted_at: Date | null
  last_post_job_id: string | null
}

const mapTarget = (r: TargetRow): ReportTarget => ({
  id: r.id,
  provider: r.provider,
  cardId: r.card_id,
  cardUrl: r.card_url,
  cardTitle: r.card_title,
  postedCommentId: r.posted_comment_id,
  postedUrl: r.posted_url,
  postedAt: r.posted_at,
  lastPostJobId: r.last_post_job_id,
})

type ImageDbRow = {
  id: string
  report_id: string
  position: number
  caption: string
  storage_key: string
  mime: string
  byte_size: number
  origin: string
  source_url: string | null
  selected: number
}

const mapImage = (r: ImageDbRow): ImageRow => ({
  id: r.id,
  reportId: r.report_id,
  position: r.position,
  caption: r.caption,
  storageKey: r.storage_key,
  mime: r.mime,
  byteSize: r.byte_size,
  origin: r.origin === 'screenshot' ? 'screenshot' : 'upload',
  sourceUrl: r.source_url,
  selected: Boolean(r.selected),
})

export type CreateReportInput = {
  userId: string
  templateId: string | null
  title: string
  body: ReportBody
  sources: Omit<ReportSource, 'id'>[]
  target: { provider: string; cardId: string; cardUrl: string | null; cardTitle: string } | null
}

export async function createReport(input: CreateReportInput): Promise<string> {
  const id = randomUUID()
  await tx(async (c) => {
    await exec(
      'INSERT INTO reports (id, user_id, template_id, title, body, status) VALUES (?, ?, ?, ?, ?, ?)',
      [id, input.userId, input.templateId, input.title, JSON.stringify(input.body), 'draft'],
      c,
    )
    for (const s of input.sources) {
      await exec(
        'INSERT INTO report_sources (id, report_id, provider, ref_type, ref_id, url, title) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), id, s.provider, s.refType, s.refId, s.url, s.title.slice(0, 500)],
        c,
      )
    }
    if (input.target) {
      await exec(
        'INSERT INTO report_targets (id, report_id, provider, card_id, card_url, card_title) VALUES (?, ?, ?, ?, ?, ?)',
        [randomUUID(), id, input.target.provider, input.target.cardId, input.target.cardUrl, input.target.cardTitle.slice(0, 500)],
        c,
      )
    }
    // Draf awal disimpan untuk menghitung diff saat posting (US-8).
    await exec(
      'INSERT INTO edit_logs (id, report_id, draft_body) VALUES (?, ?, ?)',
      [randomUUID(), id, JSON.stringify(input.body)],
      c,
    )
  })
  return id
}

export async function getReport(userId: string, id: string): Promise<Report | null> {
  const r = await one<ReportRow>('SELECT * FROM reports WHERE id = ? AND user_id = ?', [id, userId])
  return r ? mapReport(r) : null
}

export async function listReports(userId: string, limit = 100): Promise<ReportListItem[]> {
  const rows = await query<ReportRow>(
    'SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, limit],
  )
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const marks = ids.map(() => '?').join(',')
  const targets = await query<TargetRow>(`SELECT * FROM report_targets WHERE report_id IN (${marks})`, ids)
  const counts = await query<{ report_id: string; n: number }>(
    `SELECT report_id, COUNT(*) AS n FROM report_images WHERE report_id IN (${marks}) GROUP BY report_id`,
    ids,
  )
  return rows.map((r) => {
    const t = targets.find((x) => x.report_id === r.id)
    return {
      ...mapReport(r),
      target: t ? mapTarget(t) : null,
      imageCount: Number(counts.find((c) => c.report_id === r.id)?.n ?? 0),
    }
  })
}

export async function updateReport(userId: string, id: string, patch: { title?: string; body?: ReportBody }) {
  const sets: string[] = []
  const params: (string | null)[] = []
  if (patch.title !== undefined) {
    sets.push('title = ?')
    params.push(patch.title)
  }
  if (patch.body !== undefined) {
    sets.push('body = ?')
    params.push(JSON.stringify(patch.body))
  }
  if (!sets.length) return
  await exec(`UPDATE reports SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND user_id = ?`, [
    ...params,
    id,
    userId,
  ])
}

export async function setReportStatus(id: string, status: ReportStatus) {
  await exec('UPDATE reports SET status = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [status, id])
}

/** Menghapus laporan beserta seluruh data turunannya. Mengembalikan storage key gambar untuk dibersihkan. */
export async function deleteReport(userId: string, id: string): Promise<string[] | null> {
  const report = await getReport(userId, id)
  if (!report) return null
  const images = await listImages(id)
  await tx(async (c) => {
    for (const table of ['report_sources', 'report_images', 'report_targets', 'edit_logs', 'jobs']) {
      await exec(`DELETE FROM ${table} WHERE report_id = ?`, [id], c)
    }
    await exec('DELETE FROM reports WHERE id = ? AND user_id = ?', [id, userId], c)
  })
  return images.map((i) => i.storageKey)
}

// ── sources & target ────────────────────────────────────────────────────

export async function listSources(reportId: string): Promise<ReportSource[]> {
  const rows = await query<{
    id: string
    provider: string
    ref_type: string
    ref_id: string
    url: string | null
    title: string
  }>('SELECT * FROM report_sources WHERE report_id = ?', [reportId])
  return rows.map((r) => ({ id: r.id, provider: r.provider, refType: r.ref_type, refId: r.ref_id, url: r.url, title: r.title }))
}

export async function getTarget(reportId: string): Promise<ReportTarget | null> {
  const r = await one<TargetRow>('SELECT * FROM report_targets WHERE report_id = ? LIMIT 1', [reportId])
  return r ? mapTarget(r) : null
}

export async function setTarget(
  reportId: string,
  t: { provider: string; cardId: string; cardUrl: string | null; cardTitle: string },
) {
  const existing = await getTarget(reportId)
  if (existing && existing.cardId === t.cardId && existing.provider === t.provider) return
  // Kartu tujuan berganti: komentar lama bukan milik kartu baru, jadi riwayat posting direset.
  await exec('DELETE FROM report_targets WHERE report_id = ?', [reportId])
  await exec(
    'INSERT INTO report_targets (id, report_id, provider, card_id, card_url, card_title) VALUES (?, ?, ?, ?, ?, ?)',
    [randomUUID(), reportId, t.provider, t.cardId, t.cardUrl, t.cardTitle.slice(0, 500)],
  )
}

export async function markPosted(
  targetId: string,
  p: { commentId: string; url: string | null; jobId: string },
) {
  await exec(
    'UPDATE report_targets SET posted_comment_id = ?, posted_url = ?, posted_at = CURRENT_TIMESTAMP(3), last_post_job_id = ? WHERE id = ?',
    [p.commentId, p.url, p.jobId, targetId],
  )
}

// ── images ──────────────────────────────────────────────────────────────

export async function listImages(reportId: string): Promise<ImageRow[]> {
  const rows = await query<ImageDbRow>('SELECT * FROM report_images WHERE report_id = ? ORDER BY position, created_at', [
    reportId,
  ])
  return rows.map(mapImage)
}

export async function getImage(reportId: string, imageId: string): Promise<ImageRow | null> {
  const r = await one<ImageDbRow>('SELECT * FROM report_images WHERE id = ? AND report_id = ?', [imageId, reportId])
  return r ? mapImage(r) : null
}

export async function addImage(img: Omit<ImageRow, 'position'> & { position?: number }): Promise<ImageRow> {
  const max = await one<{ p: number | null }>('SELECT MAX(position) AS p FROM report_images WHERE report_id = ?', [
    img.reportId,
  ])
  const position = img.position ?? Number(max?.p ?? -1) + 1
  await exec(
    `INSERT INTO report_images (id, report_id, position, caption, storage_key, mime, byte_size, origin, source_url, selected)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      img.id,
      img.reportId,
      position,
      img.caption.slice(0, 500),
      img.storageKey,
      img.mime,
      img.byteSize,
      img.origin,
      img.sourceUrl,
      img.selected ? 1 : 0,
    ],
  )
  return { ...img, position }
}

export async function updateImage(reportId: string, imageId: string, patch: { caption?: string; selected?: boolean }) {
  const sets: string[] = []
  const params: (string | number)[] = []
  if (patch.caption !== undefined) {
    sets.push('caption = ?')
    params.push(patch.caption.slice(0, 500))
  }
  if (patch.selected !== undefined) {
    sets.push('selected = ?')
    params.push(patch.selected ? 1 : 0)
  }
  if (!sets.length) return
  await exec(`UPDATE report_images SET ${sets.join(', ')} WHERE id = ? AND report_id = ?`, [...params, imageId, reportId])
}

/** Urutan baru gambar (US-4). ID yang tidak dikenal diabaikan. */
export async function reorderImages(reportId: string, orderedIds: string[]) {
  const current = await listImages(reportId)
  const known = new Set(current.map((i) => i.id))
  const order = [...orderedIds.filter((id) => known.has(id)), ...current.map((i) => i.id).filter((id) => !orderedIds.includes(id))]
  await tx(async (c) => {
    for (let i = 0; i < order.length; i++) {
      await exec('UPDATE report_images SET position = ? WHERE id = ? AND report_id = ?', [i, order[i], reportId], c)
    }
  })
}

export async function deleteImage(reportId: string, imageId: string): Promise<ImageRow | null> {
  const img = await getImage(reportId, imageId)
  if (!img) return null
  await exec('DELETE FROM report_images WHERE id = ? AND report_id = ?', [imageId, reportId])
  return img
}

// ── edit logs (US-8) ────────────────────────────────────────────────────

export async function getDraftLog(reportId: string) {
  const r = await one<{ id: string; draft_body: unknown }>(
    'SELECT id, draft_body FROM edit_logs WHERE report_id = ? ORDER BY created_at LIMIT 1',
    [reportId],
  )
  return r ? { id: r.id, draftBody: json<ReportBody>(r.draft_body, { intro: '', sections: [], closing: '' }) } : null
}

export async function saveFinalLog(logId: string, finalBody: ReportBody, diff: unknown) {
  await exec('UPDATE edit_logs SET final_body = ?, diff = ? WHERE id = ?', [
    JSON.stringify(finalBody),
    JSON.stringify(diff),
    logId,
  ])
}
