import { NextResponse } from 'next/server'
import { z } from 'zod'
import { api } from '@/lib/http'
import { createDestination, DESTINATION_KINDS, getDestination, listDestinations, toPublic } from '@/lib/repo/destinations'
import { assertWebhookUrl } from '@/lib/webhooks'

const Input = z.object({
  kind: z.enum(DESTINATION_KINDS as [string, ...string[]]),
  name: z.string().trim().min(1).max(255),
  url: z.string().trim().min(8).max(2000),
  secret: z.string().max(500).optional().nullable(),
})

// GET /api/destinations — daftar webhook (URL disamarkan, secret tidak pernah dikirim)
export const GET = api(async (_req, { user }) => {
  return NextResponse.json({ destinations: (await listDestinations(user.id)).map(toPublic) })
})

// POST /api/destinations — tambah webhook
export const POST = api(async (req, { user }) => {
  const input = Input.parse(await req.json())
  const kind = input.kind as (typeof DESTINATION_KINDS)[number]
  await assertWebhookUrl(kind, input.url)
  const id = await createDestination(user.id, {
    kind,
    name: input.name,
    url: input.url,
    secret: kind === 'generic' && input.secret ? input.secret : null,
  })
  return NextResponse.json({ destination: toPublic((await getDestination(user.id, id))!) }, { status: 201 })
})
