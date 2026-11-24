import { NextResponse, type NextRequest } from 'next/server'
import { saveOAuthResult, useOAuthState } from '@/lib/auth'
import { getConnector } from '@/lib/connectors'
import { encrypt } from '@/lib/crypto'
import { env } from '@/lib/env'

// GET /api/connectors/:provider/callback — berjalan di domain Redirect URI (AUTH_URL bila diisi).
// Menukar code dengan token, menyimpan hasilnya terenkripsi pada state, lalu mengembalikan browser ke
// domain asal untuk langkah "complete". Di sini belum ada data yang ditulis ke akun mana pun.
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  const params = req.nextUrl.searchParams
  const fallback = (code: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(code)}`, env.appUrl))
  const stateParam = params.get('state') ?? ''
  const state = stateParam ? await useOAuthState(stateParam, provider).catch(() => null) : null
  if (!state) return fallback('invalid_state')
  const back = (path: string) => NextResponse.redirect(new URL(path, state.returnBase))
  const fail = (code: string) =>
    back(state.intent === 'login' ? `/login?error=${encodeURIComponent(code)}` : `/connect?error=${encodeURIComponent(code)}`)

  try {
    if (params.get('error')) return fail(params.get('error')!)
    const code = params.get('code')
    if (!code) return fail('missing_code')
    const result = await getConnector(provider).handleCallback(code)
    const key = await saveOAuthResult(stateParam, encrypt(JSON.stringify(result)))
    const res = back(`/api/connectors/${provider}/complete?s=${encodeURIComponent(stateParam)}&k=${encodeURIComponent(key)}`)
    res.headers.set('Referrer-Policy', 'no-referrer')
    return res
  } catch (err) {
    console.error('OAuth callback gagal:', err instanceof Error ? err.message : err)
    return fail('oauth_failed')
  }
}
