import { NextResponse } from 'next/server'
import { requireConnection } from '@/lib/connectors'
import { api } from '@/lib/http'

// GET /api/connectors/:provider/boards/:boardId/cards?column=<columnId>
export const GET = api<{ params: Promise<{ provider: string; boardId: string }> }>(async (req, { params, user }) => {
  const { provider, boardId } = await params
  const { connector, conn } = await requireConnection(user.id, provider)
  const columnId = req.nextUrl.searchParams.get('column') ?? undefined
  return NextResponse.json({ cards: await connector.listCards(conn, boardId, { columnId }) })
})
