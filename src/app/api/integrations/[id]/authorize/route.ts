import { NextResponse, type NextRequest } from 'next/server'
import { createOAuthState, currentBase, OAUTH_NONCE_COOKIE, pkcePair } from '@/lib/auth'
import { env } from '@/lib/env'
import { errorResponse, HttpError } from '@/lib/http'
import { getIntegration } from '@/lib/integrations'
import { currentUser } from '@/lib/session'

// GET /api/integrations/:id/authorize — "Connect Discord/Slack/OpenRouter" satu klik.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const integration = getIntegration(id)
    if (!integration) throw new HttpError(404, 'unknown_integration')
    if (!integration.isConfigured()) throw new HttpError(503, 'not_configured', 'notEnabled', undefined, { label: integration.label })
    const base = await currentBase()
    const user = await currentUser()
    if (!user) return NextResponse.redirect(new URL('/login?next=%2Fconnect', base))

    const pkce = integration.usesPkce ? pkcePair() : null
    const { state, nonce } = await createOAuthState({
      provider: `int:${id}`,
      intent: 'connect',
      userId: user.id,
      returnBase: base,
      nextPath: '/connect',
      pkceVerifier: pkce?.verifier ?? null,
    })
    const res = NextResponse.redirect(integration.authorizeUrl(state, pkce ? { challenge: pkce.challenge } : undefined))
    res.cookies.set(OAUTH_NONCE_COOKIE, nonce, {
      httpOnly: true,
      secure: env.isCloud,
      sameSite: 'lax',
      path: `/api/integrations/${id}`,
      maxAge: 600,
    })
    return res
  } catch (err) {
    return errorResponse(err)
  }
}
