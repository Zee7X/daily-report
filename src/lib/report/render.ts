import type { RenderableImage } from '../connectors/types'
import type { ReportBody } from './types'

// Renderer dari format netral ke HTML (Basecamp/clipboard/PDF) dan Markdown.
// Poin, bagian, dan gambar yang tidak dicentang tidak ikut dirender (US-3).

export type ImageLabels = { figure: string; attachments: string }

export const LABELS: Record<'id' | 'en', ImageLabels> = {
  id: { figure: 'Gambar', attachments: 'Lampiran' },
  en: { figure: 'Figure', attachments: 'Attachments' },
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Teks poin → HTML aman: escape, **tebal**, baris baru → <br>. */
export function inlineHtml(text: string): string {
  return escapeHtml(text.trim())
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
}

/** Nomor gambar mengikuti urutan gambar terpilih (US-4: penomoran ulang otomatis). */
export function numberImages<T extends { id: string; selected: boolean; position: number }>(images: T[]) {
  const map = new Map<string, number>()
  ;[...images]
    .filter((i) => i.selected)
    .sort((a, b) => a.position - b.position)
    .forEach((img, idx) => map.set(img.id, idx + 1))
  return map
}

type Block =
  | { kind: 'intro' | 'closing'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'item'; text: string; figures: RenderableImage[] }
  | { kind: 'images'; images: RenderableImage[] }

/** Menyusun urutan blok yang sama untuk semua format, agar posisi gambar identik dengan draf. */
export function layout(body: ReportBody, images: RenderableImage[], labels: ImageLabels): Block[] {
  const byId = new Map(images.map((i) => [i.id, i]))
  const placed = new Set<string>()
  const blocks: Block[] = []
  if (body.intro.trim()) blocks.push({ kind: 'intro', text: body.intro })
  for (const section of body.sections) {
    if (!section.selected) continue
    const items = section.items.filter((i) => i.selected && (i.text.trim() || i.imageIds.some((id) => byId.has(id))))
    if (!items.length) continue
    blocks.push({ kind: 'heading', text: section.title })
    for (const item of items) {
      const figures = item.imageIds
        .map((id) => byId.get(id))
        .filter((x): x is RenderableImage => Boolean(x))
        .sort((a, b) => a.number - b.number)
      blocks.push({ kind: 'item', text: item.text, figures })
      const fresh = figures.filter((f) => !placed.has(f.id))
      fresh.forEach((f) => placed.add(f.id))
      if (fresh.length) blocks.push({ kind: 'images', images: fresh })
    }
  }
  const rest = images.filter((i) => !placed.has(i.id)).sort((a, b) => a.number - b.number)
  if (rest.length) {
    blocks.push({ kind: 'heading', text: labels.attachments })
    blocks.push({ kind: 'images', images: rest })
  }
  if (body.closing.trim()) blocks.push({ kind: 'closing', text: body.closing })
  return blocks
}

function figureRef(figures: RenderableImage[], labels: ImageLabels) {
  if (!figures.length) return ''
  return ` (${labels.figure} ${figures.map((f) => f.number).join(', ')})`
}

export function figureCaption(img: RenderableImage, labels: ImageLabels) {
  return img.caption.trim() ? `${labels.figure} ${img.number}: ${img.caption.trim()}` : `${labels.figure} ${img.number}`
}

export type HtmlImageRenderer = (img: RenderableImage, caption: string) => string

export function renderHtml(
  body: ReportBody,
  images: RenderableImage[],
  labels: ImageLabels,
  renderImage: HtmlImageRenderer,
  opts: { headingTag?: string } = {},
): string {
  const h = opts.headingTag ?? 'h2'
  const out: string[] = []
  let listOpen = false
  const closeList = () => {
    if (listOpen) out.push('</ul>')
    listOpen = false
  }
  for (const b of layout(body, images, labels)) {
    if (b.kind === 'item') {
      if (!listOpen) out.push('<ul>')
      listOpen = true
      out.push(`<li>${inlineHtml(b.text)}${escapeHtml(figureRef(b.figures, labels))}</li>`)
      continue
    }
    closeList()
    if (b.kind === 'intro' || b.kind === 'closing') out.push(`<div>${inlineHtml(b.text)}</div>`)
    else if (b.kind === 'heading') out.push(`<${h}>${escapeHtml(b.text)}</${h}>`)
    else if (b.kind === 'images') out.push(`<div>${b.images.map((img) => renderImage(img, figureCaption(img, labels))).join('')}</div>`)
  }
  closeList()
  return out.join('\n')
}

/** HTML komentar Basecamp: gambar sebagai <bc-attachment> dari attachable_sgid (FR-10). */
export function renderBasecampHtml(body: ReportBody, images: RenderableImage[], labels: ImageLabels) {
  return renderHtml(body, images, labels, (img, caption) =>
    img.ref ? `<bc-attachment sgid="${escapeHtml(img.ref.sgid)}" caption="${escapeHtml(caption)}"></bc-attachment>` : '',
  )
}

export function renderMarkdown(
  body: ReportBody,
  images: RenderableImage[],
  labels: ImageLabels,
  imageUrl?: (img: RenderableImage) => string | null,
): string {
  const out: string[] = []
  for (const b of layout(body, images, labels)) {
    if (b.kind === 'intro' || b.kind === 'closing') out.push(b.text.trim(), '')
    else if (b.kind === 'heading') out.push(`## ${b.text.trim()}`, '')
    else if (b.kind === 'item') {
      const lines = b.text.trim().split('\n')
      out.push(`- ${lines[0]}${figureRef(b.figures, labels)}`, ...lines.slice(1).map((l) => `  ${l}`))
    } else if (b.kind === 'images') {
      if (out.at(-1) !== '') out.push('')
      for (const img of b.images) {
        const url = imageUrl?.(img)
        const cap = figureCaption(img, labels)
        out.push(url ? `![${cap}](${url})` : `*[${cap}]*`)
      }
      out.push('')
    }
  }
  return out
    .join('\n')
    .replace(/\n(## )/g, '\n\n$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export type ChatStyle = 'whatsapp' | 'slack' | 'teams'

/**
 * Teks biasa untuk aplikasi chat. Markdown standar sering rusak saat ditempel di WhatsApp/Slack,
 * jadi dipakai sintaks masing-masing: *tebal* di WhatsApp dan Slack, **tebal** di Teams, bullet "•".
 * Gambar tidak bisa ikut dalam teks, jadi ditulis sebagai rujukan [Gambar N: keterangan].
 */
export function renderChat(body: ReportBody, images: RenderableImage[], labels: ImageLabels, style: ChatStyle): string {
  const bold = (s: string) => (style === 'teams' ? `**${s}**` : `*${s}*`)
  const inline = (s: string) => s.trim().replace(/\*\*(.+?)\*\*/g, (_m, x: string) => bold(x))
  const out: string[] = []
  for (const b of layout(body, images, labels)) {
    if (b.kind === 'intro' || b.kind === 'closing') {
      if (out.length && out.at(-1) !== '') out.push('')
      out.push(inline(b.text), '')
    } else if (b.kind === 'heading') {
      if (out.length && out.at(-1) !== '') out.push('')
      out.push(bold(b.text.trim()))
    } else if (b.kind === 'item') {
      const [first, ...rest] = inline(b.text).split('\n')
      out.push(`• ${first}${figureRef(b.figures, labels)}`, ...rest.map((l) => `   ${l}`))
    } else if (b.kind === 'images') {
      for (const img of b.images) out.push(`   [${figureCaption(img, labels)}]`)
    }
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Dokumen HTML lengkap untuk PDF / tampilan cetak. */
export function renderPrintDocument(
  title: string,
  body: ReportBody,
  images: (RenderableImage & { src: string })[],
  labels: ImageLabels,
  meta: string,
) {
  const content = renderHtml(
    body,
    images,
    labels,
    (img, caption) => {
      const src = (img as RenderableImage & { src: string }).src
      return `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(caption)}"><figcaption>${escapeHtml(caption)}</figcaption></figure>`
    },
    { headingTag: 'h2' },
  )
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Geist", "Inter", "Helvetica Neue", Arial, sans-serif; color: #111; font-size: 11pt; line-height: 1.5; margin: 0; }
  header { border-bottom: 1px solid #111; padding-bottom: 10px; margin-bottom: 18px; }
  header h1 { font-size: 20pt; letter-spacing: -0.02em; margin: 0 0 4px; font-weight: 600; }
  header p { margin: 0; font-size: 8pt; text-transform: uppercase; letter-spacing: .08em; color: #555; }
  h2 { font-size: 12pt; margin: 18px 0 6px; padding-top: 6px; border-top: 1px solid #ddd; }
  ul { margin: 0 0 8px; padding-left: 18px; }
  li { margin: 2px 0; }
  figure { margin: 10px 0 14px; break-inside: avoid; }
  figure img { max-width: 100%; border: 1px solid #111; display: block; }
  figcaption { font-size: 8.5pt; color: #444; margin-top: 4px; }
</style></head><body><header><h1>${escapeHtml(title)}</h1><p>${escapeHtml(meta)}</p></header>${content}</body></html>`
}
