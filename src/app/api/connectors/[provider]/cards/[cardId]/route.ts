import { NextResponse } from 'next/server'
import { requireConnection } from '@/lib/connectors'
import { api } from '@/lib/http'
import { sanitizeSources } from '@/lib/report/draft'

// GET /api/connectors/:provider/cards/:cardId — detail kartu, termasuk step & komentar (disamarkan)
export const GET = api<{ params: Promise<{ provider: string; cardId: string }> }>(async (_req, { params, user }) => {
  const { provider, cardId } = await params
  const { connector, conn } = await requireConnection(user.id, provider)
  const [card] = sanitizeSources([await connector.getCard(conn, cardId)])
  return NextResponse.json({ card })
})
