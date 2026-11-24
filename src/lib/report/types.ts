import { z } from 'zod'

// Format netral isi laporan (PRD 8.3: reports.body). Dipakai bersama oleh server dan browser,
// lalu diterjemahkan ke HTML Basecamp / Markdown / PDF oleh renderer.

export const ItemSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().max(5000),
  selected: z.boolean(),
  imageIds: z.array(z.string().max(64)).max(50).default([]),
})

export const SectionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().max(300),
  selected: z.boolean(),
  items: z.array(ItemSchema).max(200),
})

export const ReportBodySchema = z.object({
  intro: z.string().max(5000).default(''),
  sections: z.array(SectionSchema).max(50),
  closing: z.string().max(5000).default(''),
})

export type ReportItem = z.infer<typeof ItemSchema>
export type ReportSection = z.infer<typeof SectionSchema>
export type ReportBody = z.infer<typeof ReportBodySchema>

export type ReportImage = {
  id: string
  position: number
  caption: string
  selected: boolean
  origin: 'upload' | 'screenshot'
  mime: string
  url: string
  sourceUrl: string | null
}

export const TemplateSectionSchema = z.object({
  title: z.string().min(1).max(200),
  hint: z.string().max(1000).default(''),
})

export const TemplateRulesSchema = z.object({
  tone: z.string().max(500).default(''),
  rules: z.array(z.string().max(500)).max(50).default([]),
  intro: z.string().max(2000).default(''),
  closing: z.string().max(2000).default(''),
})

export type TemplateSection = z.infer<typeof TemplateSectionSchema>
export type TemplateRules = z.infer<typeof TemplateRulesSchema>

export function newId(prefix = ''): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}${rnd}`
}

export function emptyBody(): ReportBody {
  return { intro: '', sections: [], closing: '' }
}
