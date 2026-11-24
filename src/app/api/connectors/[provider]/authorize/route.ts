import { NextResponse, type NextRequest } from 'next/server'
import { handoffUrl, onAuthHost } from '@/lib/auth'
import { getConnector } from '@/lib/connectors'
import { randomToken, sign } from '@/lib/crypto'
import { env } from '@/lib/env'
import { errorResponse, HttpError } from '@/lib/http'
import { STATE_COOKIE } from '@/lib/oauth'
import { currentUser } from '@/lib/session'

// GET /api/connectors/:provider/authorize — mulai OAuth (US-1). ?intent=login untuk "Login with …".
// Bila AUTH_URL diisi, OAuth selalu berjalan di domain login: request dari APP_URL diteruskan ke sana dulu.
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await ctx.params
    const connector = getConnector(provider)
    if (!connector.isConfigured()) throw new HttpError(503, 'not_configured', `${connector.label} belum dikonfigurasi`)
    const intent = req.nextUrl.searchParams.get('intent') === 'login' ? 'login' : 'connect'
    const user = await currentUser()
    if (intent === 'connect' && !user) return NextResponse.redirect(new URL('/login', env.appUrl))

    if (env.splitAuth && !(await onAuthHost())) {
      const path = `/api/connectors/${provider}/authorize${intent === 'login' ? '?intent=login' : ''}`
      // Untuk "connect", sesi pengguna dibawa ke domain login dengan token sekali pakai.
      const target = intent === 'connect' && user ? await handoffUrl(user.id, env.authUrl, path) : new URL(path, env.authUrl).toString()
      return NextResponse.redirect(target)
    }

    const state = randomToken()
    const value = `${provider}:${intent}:${state}`
    const res = NextResponse.redirect(connector.authorizeUrl(state))
    res.cookies.set(STATE_COOKIE, `${value}.${sign(value, 'oauth')}`, {
      httpOnly: true,
      secure: env.isCloud,
      sameSite: 'lax',
      path: '/api/connectors',
      maxAge: 600,
    })
    return res
  } catch (err) {
    return errorResponse(err)
  }
}
