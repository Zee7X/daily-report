import type { NextRequest } from 'next/server'
import { assertSafeKey, storage, verifyLocalFileSignature } from '@/lib/storage'

// GET /api/files/<key>?e=<expiry>&s=<signature> — file privat dari storage lokal lewat signed URL.
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
  try {
    const data = await storage().get(key)
    const type = key.endsWith('.png') ? 'image/png' : key.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream'
    return new Response(new Uint8Array(data), {
      headers: { 'content-type': type, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
