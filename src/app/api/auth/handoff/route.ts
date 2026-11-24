import { NextResponse, type NextRequest } from 'next/server'
import { consumeHandoff, safeNext } from '@/lib/auth'
import { env } from '@/lib/env'
import { createSession } from '@/lib/session'

// GET /api/auth/handoff?t=<token>&next=/path — menerima sesi dari domain lain milik aplikasi ini.
// Token sekali pakai, berlaku 60 detik, dan hanya sah untuk domain yang dituju.
export async function GET(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? ''
  const base = host === new URL(env.authUrl).host ? env.authUrl : env.appUrl
  const token = req.nextUrl.searchParams.get('t') ?? ''
  const next = safeNext(req.nextUrl.searchParams.get('next'))
  const userId = token ? await consumeHandoff(token, host) : null
  if (!userId) return NextResponse.redirect(new URL('/login?error=handoff', base))
  const onAuth = env.splitAuth && host === new URL(env.authUrl).host
  await createSession(userId, { short: onAuth })
  const res = NextResponse.redirect(new URL(next, base))
  res.headers.set('Referrer-Policy', 'no-referrer')
  return res
}
