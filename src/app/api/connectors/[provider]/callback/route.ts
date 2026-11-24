import { NextResponse, type NextRequest } from 'next/server'
import { getConnector } from '@/lib/connectors'
import { verify } from '@/lib/crypto'
import { env } from '@/lib/env'
import { saveConnection } from '@/lib/repo/connections'
import { createUser, findUserByEmail, setUserName } from '@/lib/repo/users'
import { createSession, currentUser } from '@/lib/session'
import { STATE_COOKIE } from '@/lib/oauth'

// GET /api/connectors/:provider/callback — terima code, simpan token terenkripsi.
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  const back = (path: string) => {
    const res = NextResponse.redirect(new URL(path, env.appUrl))
    res.cookies.delete({ name: STATE_COOKIE, path: '/api/connectors' })
    return res
  }
  try {
    const connector = getConnector(provider)
    const params = req.nextUrl.searchParams
    if (params.get('error')) return back(`/connect?error=${encodeURIComponent(params.get('error')!)}`)

    const raw = req.cookies.get(STATE_COOKIE)?.value ?? ''
    const dot = raw.lastIndexOf('.')
    const value = raw.slice(0, dot)
    const [cookieProvider, intent, state] = value.split(':')
    if (dot < 0 || !verify(value, raw.slice(dot + 1), 'oauth') || cookieProvider !== provider || state !== params.get('state')) {
      return back('/connect?error=invalid_state')
    }
    const code = params.get('code')
    if (!code) return back('/connect?error=missing_code')

    const { connection, identity } = await connector.handleCallback(code)

    let user = await currentUser()
    if (!user) {
      if (intent !== 'login') return back('/login')
      user = (await findUserByEmail(identity.email)) ?? (await createUser(identity.email, identity.name))
      await createSession(user.id)
    }
    await setUserName(user.id, identity.name)
    await saveConnection(user.id, provider, connection)
    return back(intent === 'login' ? '/' : '/connect?connected=1')
  } catch (err) {
    console.error('OAuth callback gagal:', err)
    const msg = err instanceof Error ? err.message : 'oauth_failed'
    return back(`/connect?error=${encodeURIComponent(msg.slice(0, 200))}`)
  }
}
