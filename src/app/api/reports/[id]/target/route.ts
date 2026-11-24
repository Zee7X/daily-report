import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireConnection } from '@/lib/connectors'
import { api } from '@/lib/http'
import { requireReport } from '@/lib/report/service'
import { getTarget, setTarget } from '@/lib/repo/reports'

// PUT /api/reports/:id/target — ganti kartu tujuan posting
export const PUT = api<{ params: Promise<{ id: string }> }>(async (req, { params, user }) => {
  const { id } = await params
  await requireReport(user, id)
  const input = z.object({ provider: z.string().min(1), cardId: z.string().min(1).max(128) }).parse(await req.json())
  const { connector, conn } = await requireConnection(user.id, input.provider)
  const card = await connector.getCard(conn, input.cardId)
  await setTarget(id, { provider: input.provider, cardId: card.id, cardUrl: card.url, cardTitle: card.title })
  return NextResponse.json({ target: await getTarget(id) })
})
