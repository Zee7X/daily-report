import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getConnector } from '@/lib/connectors'
import { api, HttpError } from '@/lib/http'
import { consume } from '@/lib/limits'
import { saveConnection } from '@/lib/repo/connections'

type Ctx = { params: Promise<{ provider: string }> }

// POST /api/connectors/:provider/token: sambungkan tool dengan token pribadi yang ditempel pengguna.
// Token diperiksa dulu ke tool, disimpan terenkripsi, dan tidak pernah dikirim balik (hanya 4 karakter terakhir di UI).
// Koneksi ini tidak pernah dipakai untuk login: sesi hanya dibuat oleh alur OAuth dengan email terverifikasi.
export const POST = api<Ctx>(async (req, { params, user }) => {
  const { provider } = await params
  const connector = getConnector(provider)
  const auth = connector.tokenAuth
  if (!auth) throw new HttpError(400, 'token_not_supported', 'tokenNotSupported', undefined, { label: connector.label })

  await consume('connector_token', user.id, 20, 3600_000, 'rateTokenConnect')
  const shape = Object.fromEntries(auth.fields.map((f) => [f.name, z.string().trim().min(1, 'tokenFieldRequired').max(2000)]))
  const input = z.strictObject(shape).parse(await req.json())

  const { connection } = await auth.verify(input as Record<string, string>)
  await saveConnection(user.id, provider, connection)
  return NextResponse.json({ ok: true, account: connection.accountName }, { status: 201 })
})
