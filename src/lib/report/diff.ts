import type { ReportBody } from './types'

// US-8: diff antara draf awal dan versi yang diposting. Rasio edit dipakai untuk KPI "≤ 10% teks diedit".

export type EditDiff = {
  ratio: number
  changed: { section: string; before: string; after: string }[]
  added: { section: string; text: string }[]
  removed: { section: string; text: string }[]
  deselected: { section: string; text: string }[]
}

function words(s: string) {
  return s.split(/\s+/).filter(Boolean)
}

/** Jarak edit tingkat kata (Levenshtein), cukup untuk ukuran laporan. */
function wordDistance(a: string[], b: string[]) {
  const prev = new Array(b.length + 1).fill(0).map((_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

function flatten(body: ReportBody, onlySelected: boolean) {
  const out: string[] = [body.intro]
  for (const s of body.sections) {
    if (onlySelected && !s.selected) continue
    out.push(s.title)
    for (const i of s.items) if (!onlySelected || i.selected) out.push(i.text)
  }
  out.push(body.closing)
  return out.join(' ')
}

export function computeEditDiff(draft: ReportBody, final: ReportBody): EditDiff {
  const before = new Map<string, { section: string; text: string }>()
  for (const s of draft.sections) for (const i of s.items) before.set(i.id, { section: s.title, text: i.text })

  const diff: EditDiff = { ratio: 0, changed: [], added: [], removed: [], deselected: [] }
  const seen = new Set<string>()
  for (const s of final.sections) {
    for (const i of s.items) {
      const b = before.get(i.id)
      seen.add(i.id)
      if (!b) diff.added.push({ section: s.title, text: i.text })
      else if (b.text.trim() !== i.text.trim()) diff.changed.push({ section: s.title, before: b.text, after: i.text })
      if (b && (!i.selected || !s.selected)) diff.deselected.push({ section: s.title, text: i.text })
    }
  }
  for (const [id, b] of before) if (!seen.has(id)) diff.removed.push(b)

  const a = words(flatten(draft, false))
  const f = words(flatten(final, true))
  diff.ratio = a.length ? Math.min(1, wordDistance(a, f) / a.length) : 0
  return diff
}
