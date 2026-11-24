import { NextResponse, type NextRequest } from 'next/server'
import { getConnector } from '@/lib/connectors'
import { randomToken, sign } from '@/lib/crypto'
import { env } from '@/lib/env'
import { errorResponse, HttpError } from '@/lib/http'
import { STATE_COOKIE } from '@/lib/oauth'
import { currentUser } from '@/lib/session'

// GET /api/connectors/:provider/authorize — mulai OAuth (US-1). ?intent=login untuk "Login with Basecamp".
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await ctx.params
    const connector = getConnector(provider)
    if (!connector.isConfigured()) throw new HttpError(503, 'not_configured', `${connector.label} belum dikonfigurasi`)
    const intent = req.nextUrl.searchParams.get('intent') === 'login' ? 'login' : 'connect'
    if (intent === 'connect' && !(await currentUser())) throw new HttpError(401, 'unauthorized')

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
