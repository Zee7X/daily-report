import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireConnection } from '@/lib/connectors'
import type { CardDetail } from '@/lib/connectors/types'
import { api, HttpError } from '@/lib/http'
import { aiEnabled } from '@/lib/ai'
import { limits } from '@/lib/limits'
import { composeDraft } from '@/lib/report/draft'
import { resolveTarget, WEBHOOK } from '@/lib/report/targets'
import { createReport, listReports } from '@/lib/repo/reports'
import { getTemplate } from '@/lib/repo/templates'

// Penyusunan draf AI ditargetkan < 60 detik.
export const maxDuration = 90

const CardRef = z.object({ provider: z.string().min(1).max(32), cardId: z.string().min(1).max(128) })

const CreateInput = z.object({
  templateId: z.string().min(1),
  title: z.string().trim().min(1).max(255),
  notes: z.string().max(20000).default(''),
  sources: z.array(CardRef).max(10).default([]),
  target: CardRef.nullable().default(null),
})

// GET /api/reports — riwayat laporan (FR-17)
export const GET = api(async (_req, { user }) => {
  return NextResponse.json({ reports: await listReports(user.id) })
})

// POST /api/reports — buat draf (US-3)
export const POST = api(async (req, { user }) => {
  const input = CreateInput.parse(await req.json())
  const template = await getTemplate(user.id, input.templateId)
  if (!template) throw new HttpError(404, 'template_not_found')
  await limits.report(user.id)

  const details = new Map<string, CardDetail>()
  const fetchCard = async (ref: z.infer<typeof CardRef>) => {
    const key = `${ref.provider}:${ref.cardId}`
    if (!details.has(key)) {
      const { connector, conn } = await requireConnection(user.id, ref.provider)
      details.set(key, await connector.getCard(conn, ref.cardId))
    }
    return details.get(key)!
  }

  const sources = await Promise.all(input.sources.map(fetchCard))
  // Tujuan kartu yang sama dengan sumber memakai data yang sudah diambil; webhook dicari di tabel destinations.
  const target = !input.target
    ? null
    : input.target.provider === WEBHOOK
      ? await resolveTarget(user, input.target)
      : await fetchCard(input.target).then((c) => ({ provider: input.target!.provider, cardId: c.id, cardUrl: c.url, cardTitle: c.title }))

  const allowAi = aiEnabled() ? await limits.tryAi(user.id) : false
  const draft = await composeDraft({ template, sources, notes: input.notes, locale: user.locale, allowAi })

  const id = await createReport({
    userId: user.id,
    templateId: template.id,
    title: input.title,
    body: draft.body,
    sources: input.sources.map((ref, i) => ({
      provider: ref.provider,
      refType: 'card',
      refId: ref.cardId,
      url: sources[i].url,
      title: sources[i].title,
    })),
    target,
  })
  return NextResponse.json({ id, usedAi: draft.usedAi, warning: draft.warning }, { status: 201 })
})
