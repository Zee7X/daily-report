import type { NextRequest } from 'next/server'
import { getReport } from '@/lib/repo/reports'
import { currentUser } from '@/lib/session'
import { assertSafeKey, storage, verifyLocalFileSignature } from '@/lib/storage'

// GET /api/files/reports/<reportId>/<file>?e=<expiry>&s=<signature>
// File privat (storage lokal atau Vercel Blob). Syaratnya berlapis: tanda tangan URL valid dan belum
// kedaluwarsa, ada sesi login, dan laporan pemilik file adalah milik pengguna tersebut. URL yang
// bocor tidak bisa dibuka oleh orang lain.
export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await ctx.params
  const key = parts.join('/')
  try {
    assertSafeKey(key)
  } catch {
    return new Response('Bad key', { status: 400 })
  }
  const sp = req.nextUrl.searchParams
  if (!verifyLocalFileSignature(key, sp.get('e'), sp.get('s'))) return new Response('Forbidden', { status: 403 })
  const m = /^reports\/([0-9a-f-]{36})\//.exec(key)
  const user = await currentUser()
  if (!m || !user || !(await getReport(user.id, m[1]))) return new Response('Forbidden', { status: 403 })
  try {
    const data = await storage().get(key)
    const type = key.endsWith('.png') ? 'image/png' : key.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream'
    return new Response(new Uint8Array(data), {
      headers: {
        'content-type': type,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-disposition': 'inline',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
