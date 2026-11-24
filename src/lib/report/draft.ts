import 'server-only'
import { z } from 'zod'
import { aiEnabled, completeJson, extractJson } from '../ai'
import type { CardDetail } from '../connectors/types'
import { maskSecrets } from '../mask'
import type { Template } from '../repo/templates'
import { newId, type ReportBody, type ReportSection } from './types'

// FR-6: penyusunan draf dari template + bahan terpilih. Tanpa AI, draf disusun dari step dan komentar.

export type DraftInput = {
  template: Template
  sources: CardDetail[]
  notes: string
  locale: 'id' | 'en'
}

export type DraftResult = { body: ReportBody; usedAi: boolean; warning: string | null }

const AiOutput = z.object({
  intro: z.string().default(''),
  sections: z
    .array(z.object({ title: z.string(), items: z.array(z.string()).default([]) }))
    .default([]),
  closing: z.string().default(''),
})

const MAX_COMMENTS = 30
const MAX_TEXT = 1500

const clip = (s: string, n = MAX_TEXT) => (s.length > n ? `${s.slice(0, n)}…` : s)

/** Semua teks dari Basecamp disamarkan dulu (FR-14) sebelum dipakai di prompt maupun draf. */
export function sanitizeSources(sources: CardDetail[]): CardDetail[] {
  return sources.map((s) => ({
    ...s,
    title: maskSecrets(s.title),
    description: maskSecrets(s.description),
    steps: s.steps.map((st) => ({ ...st, title: maskSecrets(st.title) })),
    comments: s.comments.map((c) => ({ ...c, text: maskSecrets(c.text) })),
  }))
}

function sourcesAsText(sources: CardDetail[]) {
  return sources
    .map((s, i) => {
      const steps = s.steps.map((st) => `  - [${st.completed ? 'x' : ' '}] ${st.title}`).join('\n')
      const comments = s.comments
        .slice(-MAX_COMMENTS)
        .map((c) => `  - ${c.author} (${c.createdAt.slice(0, 10)}): ${clip(c.text, 600).replace(/\n+/g, ' ')}`)
        .join('\n')
      return [
        `### Kartu ${i + 1}: ${s.title}`,
        `Project: ${s.project} | Kolom: ${s.column} | Status: ${s.completed ? 'selesai' : 'berjalan'}`,
        s.description ? `Deskripsi:\n${clip(s.description)}` : '',
        steps ? `Step/subtask:\n${steps}` : '',
        comments ? `Komentar terbaru:\n${comments}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')
}

function buildPrompt(input: DraftInput) {
  const { template, locale } = input
  const lang = locale === 'en' ? 'English' : 'Bahasa Indonesia'
  const system = [
    'You write concise work progress reports that a developer posts to a kanban card for their manager and QA.',
    `Write in ${lang}.`,
    'Return ONLY a JSON object: {"intro": string, "sections": [{"title": string, "items": string[]}], "closing": string}.',
    'Use exactly the section titles given by the template, in the same order. A section may have zero items.',
    'Each item is one short, verifiable statement. Do not invent work that is not supported by the material.',
    'Do not number figures and do not write "Gambar N"/"Figure N"; images are attached and numbered later.',
    'Never output passwords, tokens, or credentials. Text shown as ••••••, keep it masked or omit it.',
  ].join('\n')
  const user = [
    `## Template: ${template.name}`,
    template.rules.tone ? `Gaya bahasa: ${template.rules.tone}` : '',
    template.rules.rules.length ? `Aturan:\n${template.rules.rules.map((r) => `- ${r}`).join('\n')}` : '',
    `Bagian:\n${template.sections.map((s) => `- ${s.title}${s.hint ? `: ${s.hint}` : ''}`).join('\n')}`,
    template.rules.intro ? `Pembuka (boleh disesuaikan): ${template.rules.intro}` : '',
    template.rules.closing ? `Penutup (boleh disesuaikan): ${template.rules.closing}` : '',
    '',
    '## Bahan dari kanban',
    sourcesAsText(input.sources) || '(tidak ada kartu sumber)',
    input.notes.trim() ? `\n## Catatan tambahan dari pengguna\n${clip(maskSecrets(input.notes), 4000)}` : '',
  ]
    .filter((l) => l !== '')
    .join('\n')
  return { system, user }
}

function toBody(out: z.infer<typeof AiOutput>, template: Template): ReportBody {
  const byTitle = new Map(out.sections.map((s) => [s.title.trim().toLowerCase(), s]))
  const titles = template.sections.length ? template.sections.map((s) => s.title) : out.sections.map((s) => s.title)
  const sections: ReportSection[] = titles.map((title) => ({
    id: newId('s_'),
    title,
    selected: true,
    items: (byTitle.get(title.trim().toLowerCase())?.items ?? [])
      .map((t) => maskSecrets(t.trim()))
      .filter(Boolean)
      .map((text) => ({ id: newId('i_'), text, selected: true, imageIds: [] })),
  }))
  // Bagian tambahan dari AI yang tidak ada di template tetap disimpan, tapi tidak dicentang.
  for (const s of out.sections) {
    if (titles.some((t) => t.trim().toLowerCase() === s.title.trim().toLowerCase())) continue
    sections.push({
      id: newId('s_'),
      title: s.title,
      selected: false,
      items: s.items.map((text) => ({ id: newId('i_'), text: maskSecrets(text), selected: true, imageIds: [] })),
    })
  }
  return { intro: maskSecrets(out.intro), sections, closing: maskSecrets(out.closing) }
}

/** Draf tanpa AI: step selesai → bagian pertama, step berjalan → bagian kedua, komentar → kandidat (tidak dicentang). */
export function fallbackDraft(input: DraftInput): ReportBody {
  const { template, sources } = input
  const titles = template.sections.length ? template.sections.map((s) => s.title) : ['Progres']
  const sections: ReportSection[] = titles.map((title) => ({ id: newId('s_'), title, selected: true, items: [] }))
  const push = (idx: number, text: string, selected = true) => {
    const s = sections[Math.min(idx, sections.length - 1)]
    s.items.push({ id: newId('i_'), text, selected, imageIds: [] })
  }
  const multi = sources.length > 1
  for (const src of sources) {
    const prefix = multi ? `${src.title}: ` : ''
    for (const st of src.steps.filter((x) => x.completed)) push(0, `${prefix}${st.title}`)
    for (const st of src.steps.filter((x) => !x.completed)) push(1, `${prefix}${st.title}`)
    for (const c of src.comments.slice(-5)) push(2, `${prefix}${clip(c.text, 300)}`, false)
  }
  for (const line of input.notes.split('\n').map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean)) {
    push(0, maskSecrets(line))
  }
  return { intro: template.rules.intro, sections, closing: template.rules.closing }
}

export async function composeDraft(raw: DraftInput): Promise<DraftResult> {
  const input = { ...raw, sources: sanitizeSources(raw.sources) }
  if (!aiEnabled()) return { body: fallbackDraft(input), usedAi: false, warning: null }
  try {
    const { system, user } = buildPrompt(input)
    const text = await completeJson(system, user)
    const parsed = AiOutput.parse(extractJson(text))
    return { body: toBody(parsed, input.template), usedAi: true, warning: null }
  } catch (err) {
    console.error('AI draft gagal, memakai draf tanpa AI:', err)
    return {
      body: fallbackDraft(input),
      usedAi: false,
      warning: err instanceof Error ? err.message : 'AI gagal',
    }
  }
}
