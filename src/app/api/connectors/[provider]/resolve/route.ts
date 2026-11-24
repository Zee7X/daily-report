import { NextResponse } from 'next/server'
import { requireConnection } from '@/lib/connectors'
import { api, HttpError } from '@/lib/http'
import { maskSecrets } from '@/lib/mask'

// GET /api/connectors/:provider/resolve?url=<URL kartu> — FR-4: input kartu lewat URL
export const GET = api<{ params: Promise<{ provider: string }> }>(async (req, { params, user }) => {
  const { provider } = await params
  const { connector, conn } = await requireConnection(user.id, provider)
  const url = req.nextUrl.searchParams.get('url') ?? ''
  const id = connector.parseCardUrl(url, conn)
  if (!id) throw new HttpError(400, 'invalid_url', 'URL kartu tidak dikenali')
  const card = await connector.getCard(conn, id)
  return NextResponse.json({
    card: { id: card.id, title: maskSecrets(card.title), url: card.url, column: card.column, project: card.project },
  })
})
