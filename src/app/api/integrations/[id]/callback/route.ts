import { NextResponse, type NextRequest } from 'next/server'
import { saveOAuthResult, useOAuthState } from '@/lib/auth'
import { encrypt } from '@/lib/crypto'
import { env } from '@/lib/env'
import { getIntegration } from '@/lib/integrations'

// GET /api/integrations/:id/callback — di domain Redirect URI. Menukar code, menyimpan hasil terenkripsi,
// lalu kembali ke domain asal untuk langkah complete (belum ada data yang ditulis ke akun).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const integration = getIntegration(id)
  const params = req.nextUrl.searchParams
  const stateParam = params.get('state') ?? ''
  const state = integration && stateParam ? await useOAuthState(stateParam, `int:${id}`).catch(() => null) : null
  if (!integration || !state) return NextResponse.redirect(new URL('/connect?error=invalid_state', env.appUrl))
  const back = (path: string) => {
    const res = NextResponse.redirect(new URL(path, state.returnBase))
    res.headers.set('Referrer-Policy', 'no-referrer')
    return res
  }
  if (params.get('error')) return back(`/connect?error=${encodeURIComponent(params.get('error')!)}`)
  const code = params.get('code')
  if (!code) return back('/connect?error=missing_code')
  try {
    const result = await integration.exchange(code, state.pkceVerifier ?? undefined)
    const key = await saveOAuthResult(stateParam, encrypt(JSON.stringify(result)))
    return back(`/api/integrations/${id}/complete?s=${encodeURIComponent(stateParam)}&k=${encodeURIComponent(key)}`)
  } catch (err) {
    console.error(`Integrasi ${id} gagal:`, err instanceof Error ? err.message : err)
    return back('/connect?error=oauth_failed')
  }
}
