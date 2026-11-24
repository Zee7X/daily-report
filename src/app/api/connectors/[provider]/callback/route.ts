import { NextResponse, type NextRequest } from 'next/server'
import { saveOAuthResult, useOAuthState, type OAuthState } from '@/lib/auth'
import { getConnector } from '@/lib/connectors'
import { encrypt } from '@/lib/crypto'
import { env } from '@/lib/env'

// Callback OAuth — berjalan di domain Redirect URI (AUTH_URL bila diisi).
// Menukar code dengan token, menyimpan hasilnya terenkripsi pada state, lalu mengembalikan browser ke
// domain asal untuk langkah "complete". Di sini belum ada data yang ditulis ke akun mana pun.
//   GET  ?code=&state=           → penyedia standar (code di query)
//   POST { state, token }        → penyedia yang mengembalikan token di #fragment (Trello), dari halaman /oauth/:provider

async function finish(provider: string, stateParam: string, state: OAuthState, code: string | null, error: string | null) {
  const fail = (c: string) =>
    new URL(state.intent === 'login' ? `/login?error=${encodeURIComponent(c)}` : `/connect?error=${encodeURIComponent(c)}`, state.returnBase)
  if (error) return fail(error)
  if (!code) return fail('missing_code')
  try {
    const result = await getConnector(provider).handleCallback(code, { verifier: state.pkceVerifier ?? undefined })
    const key = await saveOAuthResult(stateParam, encrypt(JSON.stringify(result)))
    return new URL(`/api/connectors/${provider}/complete?s=${encodeURIComponent(stateParam)}&k=${encodeURIComponent(key)}`, state.returnBase)
  } catch (err) {
    console.error(`OAuth callback ${provider} gagal:`, err instanceof Error ? err.message : err)
    return fail('oauth_failed')
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  const params = req.nextUrl.searchParams
  const stateParam = params.get('state') ?? ''
  const state = stateParam ? await useOAuthState(stateParam, provider).catch(() => null) : null
  if (!state) return NextResponse.redirect(new URL('/login?error=invalid_state', env.appUrl))
  const res = NextResponse.redirect(await finish(provider, stateParam, state, params.get('code'), params.get('error')))
  res.headers.set('Referrer-Policy', 'no-referrer')
  return res
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as { state?: string; token?: string; error?: string }
  const stateParam = String(body.state ?? '')
  const state = stateParam ? await useOAuthState(stateParam, provider).catch(() => null) : null
  if (!state) return NextResponse.json({ redirect: new URL('/login?error=invalid_state', env.appUrl).toString() })
  const url = await finish(provider, stateParam, state, body.token ? String(body.token) : null, body.error ? String(body.error) : null)
  return NextResponse.json({ redirect: url.toString() })
}
