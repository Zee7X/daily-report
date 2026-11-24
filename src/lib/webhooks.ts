import 'server-only'
import { createHmac } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import net from 'node:net'
import { isPrivateAddress } from './browser'
import { env } from './env'
import { HttpError } from './http'
import type { DestinationKind } from './repo/destinations'
import { layout, figureCaption, renderChat, renderHtml, renderMarkdown, escapeHtml, type ImageLabels } from './report/render'
import type { RenderableImage } from './connectors/types'
import type { ReportBody } from './report/types'

// Output webhook: Discord (gambar ikut sebagai file), Slack & Teams (teks + rujukan gambar),
// dan JSON umum untuk n8n/Zapier/Make (gambar base64, opsional tanda tangan HMAC).

export type WebhookImage = RenderableImage & { mime: string; data: Buffer }
export type WebhookReport = { id: string; title: string; body: ReportBody; images: WebhookImage[]; labels: ImageLabels }
export type WebhookResult = { messageId: string | null; url: string | null; imagesSent: number; note: string | null }

const TIMEOUT_MS = 20_000
const DISCORD_MAX_FILES = 10
const DISCORD_MAX_BYTES = 9.5 * 1024 * 1024 // batas upload webhook server non-boost: 10 MB per pesan
const DISCORD_EMBED_CHARS = 3900
const GENERIC_MAX_IMAGE_BYTES = 20 * 1024 * 1024

export const KIND_LABEL: Record<DestinationKind, string> = {
  discord: 'Discord',
  slack: 'Slack',
  teams: 'Microsoft Teams',
  generic: 'Webhook JSON',
}

/** Validasi URL saat disimpan dan saat dikirim (mencegah SSRF ke jaringan internal di mode cloud). */
export async function assertWebhookUrl(kind: DestinationKind, raw: string) {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new HttpError(400, 'invalid_webhook_url', 'URL webhook tidak valid')
  }
  // Mode lokal: endpoint di komputer sendiri (relay, n8n lokal, pengujian) diizinkan untuk semua jenis.
  const localRelay = !env.isCloud && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  if (localRelay) return
  const httpsOnly = kind !== 'generic' || env.isCloud
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && !httpsOnly)) {
    throw new HttpError(400, 'invalid_webhook_url', 'URL webhook harus https')
  }
  if (kind === 'discord' && !(/^(?:canary\.|ptb\.)?discord(?:app)?\.com$/.test(u.hostname) && u.pathname.startsWith('/api/webhooks/'))) {
    throw new HttpError(400, 'invalid_webhook_url', 'Bukan URL webhook Discord (https://discord.com/api/webhooks/…)')
  }
  if (kind === 'slack' && u.hostname !== 'hooks.slack.com') {
    throw new HttpError(400, 'invalid_webhook_url', 'Bukan URL incoming webhook Slack (https://hooks.slack.com/…)')
  }
  if (env.isCloud) {
    const host = u.hostname.replace(/^\[|\]$/g, '')
    const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => [])
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
      throw new HttpError(400, 'private_url', 'Mode cloud hanya bisa mengirim ke alamat publik')
    }
  }
}

async function send(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (res.status === 429) {
    const wait = Number(res.headers.get('retry-after')) || 2
    await new Promise((r) => setTimeout(r, Math.min(wait, 10) * 1000))
    return fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) })
  }
  return res
}

async function ensureOk(res: Response, label: string) {
  if (res.ok) return
  const text = await res.text().catch(() => '')
  throw new Error(`${label} menolak (${res.status}): ${text.slice(0, 200)}`)
}

function chunk(text: string, size: number): string[] {
  const out: string[] = []
  let cur = ''
  for (const line of text.split('\n')) {
    const piece = line.length > size ? line.slice(0, size - 1) + '…' : line
    if ((cur + '\n' + piece).length > size && cur) {
      out.push(cur)
      cur = piece
    } else cur = cur ? `${cur}\n${piece}` : piece
  }
  if (cur) out.push(cur)
  return out.length ? out : ['']
}

const ext = (mime: string) => (mime === 'image/jpeg' ? 'jpg' : 'png')

// ── Discord ───────────────────────────────────────────────────────────────

async function sendDiscord(url: string, r: WebhookReport): Promise<WebhookResult> {
  const target = new URL(url)
  target.searchParams.set('wait', 'true')
  const markdown = renderMarkdown(r.body, r.images, r.labels)
  const texts = chunk(markdown, DISCORD_EMBED_CHARS)

  // Kelompokkan gambar per pesan sesuai batas jumlah dan ukuran Discord.
  const batches: WebhookImage[][] = []
  const skipped: WebhookImage[] = []
  let cur: WebhookImage[] = []
  let bytes = 0
  for (const img of r.images) {
    if (img.data.length > DISCORD_MAX_BYTES) {
      skipped.push(img)
      continue
    }
    if (cur.length >= DISCORD_MAX_FILES || bytes + img.data.length > DISCORD_MAX_BYTES) {
      batches.push(cur)
      cur = []
      bytes = 0
    }
    cur.push(img)
    bytes += img.data.length
  }
  if (cur.length) batches.push(cur)

  const messages = Math.max(texts.length, batches.length)
  let firstId: string | null = null
  for (let i = 0; i < messages; i++) {
    const files = batches[i] ?? []
    const embeds = texts[i] !== undefined ? [{ title: i === 0 ? r.title.slice(0, 256) : undefined, description: texts[i] }] : []
    const payload = {
      embeds,
      attachments: files.map((f, idx) => ({ id: idx, filename: `${r.labels.figure.toLowerCase()}-${f.number}.${ext(f.mime)}`, description: figureCaption(f, r.labels).slice(0, 1000) })),
      allowed_mentions: { parse: [] },
    }
    const form = new FormData()
    form.append('payload_json', JSON.stringify(payload))
    files.forEach((f, idx) =>
      form.append(`files[${idx}]`, new Blob([new Uint8Array(f.data)], { type: f.mime }), `${r.labels.figure.toLowerCase()}-${f.number}.${ext(f.mime)}`),
    )
    const res = await send(target.toString(), { method: 'POST', body: form })
    await ensureOk(res, 'Discord')
    const msg = (await res.json().catch(() => ({}))) as { id?: string }
    firstId ??= msg.id ?? null
  }
  return {
    messageId: firstId,
    url: null,
    imagesSent: r.images.length - skipped.length,
    note: skipped.length ? `${skipped.length} gambar melebihi batas 10 MB Discord dan tidak terkirim` : null,
  }
}

// ── Slack ─────────────────────────────────────────────────────────────────

async function sendSlack(url: string, r: WebhookReport): Promise<WebhookResult> {
  const text = `*${r.title}*\n\n${renderChat(r.body, r.images, r.labels, 'slack')}`
  const res = await send(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: text.slice(0, 39000), mrkdwn: true }),
  })
  await ensureOk(res, 'Slack')
  return {
    messageId: null,
    url: null,
    imagesSent: 0,
    note: r.images.length ? 'Incoming webhook Slack tidak bisa melampirkan file; gambar ditulis sebagai rujukan' : null,
  }
}

// ── Microsoft Teams (Workflows / Power Automate: "When a Teams webhook request is received") ──

function teamsCard(r: WebhookReport) {
  const blocks: object[] = [{ type: 'TextBlock', text: r.title, weight: 'Bolder', size: 'Medium', wrap: true }]
  let list: string[] = []
  const flush = () => {
    if (list.length) blocks.push({ type: 'TextBlock', text: list.join('\r'), wrap: true })
    list = []
  }
  for (const b of layout(r.body, r.images, r.labels)) {
    if (b.kind === 'item') {
      const refs = b.figures.length ? ` (${r.labels.figure} ${b.figures.map((f) => f.number).join(', ')})` : ''
      list.push(`- ${b.text.trim().replace(/\n+/g, ' ')}${refs}`)
      continue
    }
    flush()
    if (b.kind === 'heading') blocks.push({ type: 'TextBlock', text: b.text, weight: 'Bolder', wrap: true, spacing: 'Medium' })
    else if (b.kind === 'intro' || b.kind === 'closing') blocks.push({ type: 'TextBlock', text: b.text.trim(), wrap: true })
    else if (b.kind === 'images') blocks.push({ type: 'TextBlock', text: b.images.map((i) => `[${figureCaption(i, r.labels)}]`).join('\r'), wrap: true, isSubtle: true, size: 'Small' })
  }
  flush()
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: { $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4', body: blocks },
      },
    ],
  }
}

async function sendTeams(url: string, r: WebhookReport): Promise<WebhookResult> {
  const res = await send(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(teamsCard(r)) })
  await ensureOk(res, 'Teams')
  return {
    messageId: null,
    url: null,
    imagesSent: 0,
    note: r.images.length ? 'Webhook Teams tidak bisa melampirkan file; gambar ditulis sebagai rujukan' : null,
  }
}

// ── JSON umum (n8n, Zapier, Make, server sendiri) ─────────────────────────

export function genericPayload(r: WebhookReport) {
  let budget = GENERIC_MAX_IMAGE_BYTES
  const images = r.images.map((img) => {
    const include = img.data.length <= budget
    if (include) budget -= img.data.length
    return {
      number: img.number,
      caption: img.caption,
      label: figureCaption(img, r.labels),
      filename: `${r.labels.figure.toLowerCase()}-${img.number}.${ext(img.mime)}`,
      mime: img.mime,
      bytes: img.data.length,
      base64: include ? img.data.toString('base64') : null,
    }
  })
  return {
    event: 'report.posted',
    source: 'daily-report',
    sentAt: new Date().toISOString(),
    report: { id: r.id, title: r.title },
    formats: {
      markdown: renderMarkdown(r.body, r.images, r.labels),
      html: renderHtml(r.body, r.images, r.labels, (img, caption) => `<p><em>[${escapeHtml(caption)}]</em></p>`),
      whatsapp: renderChat(r.body, r.images, r.labels, 'whatsapp'),
      slack: renderChat(r.body, r.images, r.labels, 'slack'),
    },
    body: r.body,
    images,
  }
}

async function sendGeneric(url: string, secret: string | null, r: WebhookReport): Promise<WebhookResult> {
  const payload = genericPayload(r)
  const raw = JSON.stringify(payload)
  const headers: Record<string, string> = { 'content-type': 'application/json', 'user-agent': 'daily-report-webhook/1' }
  if (secret) headers['x-daily-report-signature'] = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`
  const res = await send(url, { method: 'POST', headers, body: raw })
  await ensureOk(res, 'Webhook')
  const omitted = payload.images.filter((i) => !i.base64).length
  return {
    messageId: null,
    url: null,
    imagesSent: payload.images.length - omitted,
    note: omitted ? `${omitted} gambar tidak disertakan (total melebihi 20 MB)` : null,
  }
}

export async function sendWebhook(
  dest: { kind: DestinationKind; url: string; secret: string | null },
  report: WebhookReport,
): Promise<WebhookResult> {
  await assertWebhookUrl(dest.kind, dest.url)
  switch (dest.kind) {
    case 'discord':
      return sendDiscord(dest.url, report)
    case 'slack':
      return sendSlack(dest.url, report)
    case 'teams':
      return sendTeams(dest.url, report)
    default:
      return sendGeneric(dest.url, dest.secret, report)
  }
}

/** Pesan uji saat pengguna menambah webhook. */
export function testReport(labels: ImageLabels): WebhookReport {
  return {
    id: 'test',
    title: 'Daily Report — test webhook',
    labels,
    images: [],
    body: {
      intro: 'Webhook terhubung. Laporan berikutnya akan dikirim ke sini.',
      sections: [{ id: 's', title: 'Tes', selected: true, items: [{ id: 'i', text: 'Format poin dan **teks tebal**', selected: true, imageIds: [] }] }],
      closing: '',
    },
  }
}
