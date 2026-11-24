import { NextResponse } from 'next/server'
import { requireConnection } from '@/lib/connectors'
import { api } from '@/lib/http'

// GET /api/connectors/:provider/boards/:boardId/columns
export const GET = api<{ params: Promise<{ provider: string; boardId: string }> }>(async (_req, { params, user }) => {
  const { provider, boardId } = await params
  const { connector, conn } = await requireConnection(user.id, provider)
  return NextResponse.json({ columns: await connector.listColumns(conn, boardId) })
})
