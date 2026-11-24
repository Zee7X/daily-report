import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'
import { LOCALE_COOKIE } from '@/lib/i18n/server'
import { setUserLocale } from '@/lib/repo/users'
import { currentUser } from '@/lib/session'

// GET /api/locale?l=en&next=/reports — ganti bahasa UI (dan bahasa label laporan)
export async function GET(req: NextRequest) {
  const l = req.nextUrl.searchParams.get('l') === 'en' ? 'en' : 'id'
  const next = req.nextUrl.searchParams.get('next') ?? '/'
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'
  const user = await currentUser().catch(() => null)
  if (user) await setUserLocale(user.id, l)
  const res = NextResponse.redirect(new URL(safeNext, env.appUrl))
  res.cookies.set(LOCALE_COOKIE, l, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', secure: env.isCloud })
  return res
}
