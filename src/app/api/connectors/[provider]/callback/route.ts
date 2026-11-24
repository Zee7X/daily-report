import { NextResponse, type NextRequest } from 'next/server'
import { canSignup, handoffUrl, onAuthHost } from '@/lib/auth'
import { getConnector } from '@/lib/connectors'
import { verify } from '@/lib/crypto'
import { env } from '@/lib/env'
import { STATE_COOKIE } from '@/lib/oauth'
import { saveConnection } from '@/lib/repo/connections'
import { createUser, findUserByEmail, setUserName } from '@/lib/repo/users'
import { createSession, currentUser } from '@/lib/session'

// GET /api/connectors/:provider/callback — terima code, simpan token terenkripsi.
// Dengan AUTH_URL, callback ini berjalan di domain login lalu mengembalikan pengguna ke APP_URL.
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  const back = (url: string) => {
    const res = NextResponse.redirect(url)
    res.cookies.delete({ name: STATE_COOKIE, path: '/api/connectors' })
    return res
  }
  const app = (path: string) => new URL(path, env.appUrl).toString()
  const auth = (path: string) => new URL(path, env.authUrl).toString()
  let intent = 'connect'
  try {
    const connector = getConnector(provider)
    const params = req.nextUrl.searchParams
    const raw = req.cookies.get(STATE_COOKIE)?.value ?? ''
    const dot = raw.lastIndexOf('.')
    const value = raw.slice(0, dot)
    const [cookieProvider, cookieIntent, state] = value.split(':')
    intent = cookieIntent === 'login' ? 'login' : 'connect'
    const fail = (code: string) => back(intent === 'login' ? auth(`/login?error=${encodeURIComponent(code)}`) : app(`/connect?error=${encodeURIComponent(code)}`))

    if (params.get('error')) return fail(params.get('error')!)
    if (dot < 0 || !verify(value, raw.slice(dot + 1), 'oauth') || cookieProvider !== provider || state !== params.get('state')) {
      return fail('invalid_state')
    }
    const code = params.get('code')
    if (!code) return fail('missing_code')

    const { connection, identity } = await connector.handleCallback(code)
    const split = await onAuthHost()

    let user = await currentUser()
    if (intent === 'login') {
      user = await findUserByEmail(identity.email)
      if (!user) {
        if (!(await canSignup(identity.email))) return fail('signup_closed')
        user = await createUser(identity.email, identity.name)
      }
      await createSession(user.id, { short: split })
    }
    if (!user) return back(app('/login'))

    await setUserName(user.id, identity.name)
    await saveConnection(user.id, provider, connection)

    if (intent === 'login') return back(split ? await handoffUrl(user.id, env.appUrl, '/') : app('/'))
    return back(app('/connect?connected=1'))
  } catch (err) {
    console.error('OAuth callback gagal:', err)
    const msg = encodeURIComponent((err instanceof Error ? err.message : 'oauth_failed').slice(0, 200))
    return back(intent === 'login' ? auth(`/login?error=${msg}`) : app(`/connect?error=${msg}`))
  }
}
