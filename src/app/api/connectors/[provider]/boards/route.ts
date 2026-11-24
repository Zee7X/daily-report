import { NextResponse } from 'next/server'
import { requireConnection } from '@/lib/connectors'
import { api } from '@/lib/http'

// GET /api/connectors/:provider/boards — daftar board (card table) per project
export const GET = api<{ params: Promise<{ provider: string }> }>(async (_req, { params, user }) => {
  const { provider } = await params
  const { connector, conn } = await requireConnection(user.id, provider)
  return NextResponse.json({ boards: await connector.listBoards(conn) })
})
