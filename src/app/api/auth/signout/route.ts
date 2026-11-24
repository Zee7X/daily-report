import { NextResponse, type NextRequest } from 'next/server'
import { consumeHandoff } from '@/lib/auth'
import { env } from '@/lib/env'
import { destroySession } from '@/lib/session'

// GET /api/auth/signout?t=<token> — bagian kedua logout di domain login (lihat /api/auth/logout).
export async function GET(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? ''
  const token = req.nextUrl.searchParams.get('t') ?? ''
  if (token && (await consumeHandoff(token, host))) await destroySession()
  return NextResponse.redirect(new URL('/login', env.authUrl))
}
