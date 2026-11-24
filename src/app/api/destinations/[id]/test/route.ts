import { NextResponse } from 'next/server'
import { api, HttpError } from '@/lib/http'
import { limits } from '@/lib/limits'
import { getDestination } from '@/lib/repo/destinations'
import { LABELS } from '@/lib/report/render'
import { sendWebhook, testReport } from '@/lib/webhooks'

// POST /api/destinations/:id/test — kirim pesan uji
export const POST = api<{ params: Promise<{ id: string }> }>(async (_req, { params, user }) => {
  const { id } = await params
  const dest = await getDestination(user.id, id)
  if (!dest) throw new HttpError(404, 'destination_not_found')
  await limits.webhookTest(user.id)
  try {
    await sendWebhook(dest, testReport(user.locale, LABELS[user.locale]))
  } catch (err) {
    if (err instanceof HttpError) throw err
    throw new HttpError(502, 'webhook_failed', err instanceof Error ? 'webhookFailedDetail' : 'webhookFailed', undefined, { detail: err instanceof Error ? err.message : '' })
  }
  return NextResponse.json({ ok: true })
})
