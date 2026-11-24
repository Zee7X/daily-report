import { NextResponse, type NextRequest } from 'next/server'
import { consumeHandoff, HANDOFF_NONCE_COOKIE, safeNext } from '@/lib/auth'
import { env } from '@/lib/env'
import { getUser } from '@/lib/repo/users'
import { createSession } from '@/lib/session'

// GET /api/auth/handoff?t=<token>&next=/path — menerima hasil login dari AUTH_URL di APP_URL.
// Token sekali pakai, berlaku 60 detik, hanya sah untuk domain ini, dan hanya untuk browser yang
// memegang cookie nonce dari awal alur login (link handoff milik orang lain tidak bisa dipakai).
export async function GET(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? ''
  const token = req.nextUrl.searchParams.get('t') ?? ''
  const next = safeNext(req.nextUrl.searchParams.get('next'))
  const nonce = req.cookies.get(HANDOFF_NONCE_COOKIE)?.value ?? ''
  const userId = await consumeHandoff(token, host, nonce)
  const user = userId ? await getUser(userId) : null
  const res = NextResponse.redirect(new URL(user ? next : '/login?error=handoff', env.appUrl))
  res.cookies.delete({ name: HANDOFF_NONCE_COOKIE, path: '/api/auth/handoff' })
  res.headers.set('Referrer-Policy', 'no-referrer')
  if (user) await createSession(user)
  return res
}
