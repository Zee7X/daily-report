import { NextResponse } from 'next/server'
import { getConnector } from '@/lib/connectors'
import { api } from '@/lib/http'
import { deleteConnection, getConnection } from '@/lib/repo/connections'

type Ctx = { params: Promise<{ provider: string }> }

// GET — status koneksi (tanpa token)
export const GET = api<Ctx>(async (_req, { params, user }) => {
  const { provider } = await params
  const connector = getConnector(provider)
  const conn = await getConnection(user.id, provider)
  return NextResponse.json({
    provider,
    label: connector.label,
    configured: connector.isConfigured(),
    tokenAuth: Boolean(connector.tokenAuth),
    connected: Boolean(conn),
    accountName: conn?.accountName ?? null,
    email: conn?.meta.email ?? null,
    accounts: conn?.meta.accounts ?? [],
    expiresAt: conn?.expiresAt ?? null,
  })
})

// DELETE — Disconnect: token dihapus dari database (US-1)
export const DELETE = api<Ctx>(async (_req, { params, user }) => {
  const { provider } = await params
  getConnector(provider)
  await deleteConnection(user.id, provider)
  return NextResponse.json({ ok: true })
})
