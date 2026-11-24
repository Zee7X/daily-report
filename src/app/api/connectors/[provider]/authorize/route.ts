import { NextResponse, type NextRequest } from 'next/server'
import { createOAuthState, currentBase, OAUTH_NONCE_COOKIE, safeNext } from '@/lib/auth'
import { getConnector } from '@/lib/connectors'
import { env } from '@/lib/env'
import { errorResponse, HttpError } from '@/lib/http'
import { currentUser } from '@/lib/session'

// GET /api/connectors/:provider/authorize[?intent=login&next=/path] — mulai OAuth (US-1).
// State disimpan di server dan nonce-nya di cookie browser ini; hasil OAuth hanya bisa diselesaikan
// (langkah complete) oleh browser yang sama. Untuk "connect", juga hanya oleh pengguna yang sama.
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await ctx.params
    const connector = getConnector(provider)
    if (!connector.isConfigured()) throw new HttpError(503, 'not_configured', `${connector.label} belum dikonfigurasi`)
    const intent = req.nextUrl.searchParams.get('intent') === 'login' ? 'login' : 'connect'
    const base = await currentBase()
    const user = intent === 'connect' ? await currentUser() : null
    if (intent === 'connect' && !user) return NextResponse.redirect(new URL('/login?next=%2Fconnect', base))

    const { state, nonce } = await createOAuthState({
      provider,
      intent,
      userId: user?.id ?? null,
      returnBase: base,
      nextPath: intent === 'connect' ? '/connect?connected=1' : safeNext(req.nextUrl.searchParams.get('next')),
    })
    const res = NextResponse.redirect(connector.authorizeUrl(state))
    res.cookies.set(OAUTH_NONCE_COOKIE, nonce, {
      httpOnly: true,
      secure: env.isCloud,
      sameSite: 'lax',
      path: `/api/connectors/${provider}`,
      maxAge: 600,
    })
    return res
  } catch (err) {
    return errorResponse(err)
  }
}
