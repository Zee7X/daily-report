import { NextResponse, type NextRequest } from 'next/server'
import { completeOAuthState, currentBase, OAUTH_NONCE_COOKIE } from '@/lib/auth'
import { decrypt } from '@/lib/crypto'
import { getIntegration } from '@/lib/integrations'
import { currentUser } from '@/lib/session'

// GET /api/integrations/:id/complete?s=&k= — butuh cookie nonce browser pemulai, kunci k dari callback,
// dan sesi pengguna yang sama dengan yang memulai. Baru di sini webhook/API key disimpan ke akunnya.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const base = await currentBase()
  const go = (path: string) => {
    const res = NextResponse.redirect(new URL(path, base))
    res.cookies.delete({ name: OAUTH_NONCE_COOKIE, path: `/api/integrations/${id}` })
    return res
  }
  const integration = getIntegration(id)
  const sp = req.nextUrl.searchParams
  let state: Awaited<ReturnType<typeof completeOAuthState>> = null
  if (integration) {
    try {
      state = await completeOAuthState(sp.get('s') ?? '', req.cookies.get(OAUTH_NONCE_COOKIE)?.value ?? '', sp.get('k') ?? '')
    } catch (err) {
      console.error(`Integrasi ${id} gagal menyelesaikan state:`, err instanceof Error ? err.message : err)
      return go('/connect?error=server_busy')
    }
  }
  if (!integration || !state || state.provider !== `int:${id}` || !state.result) return go('/connect?error=invalid_state')
  const user = await currentUser()
  if (!user || user.id !== state.userId) return go('/connect?error=session_mismatch')
  try {
    return go(await integration.apply(user.id, JSON.parse(decrypt(state.result))))
  } catch (err) {
    console.error(`Integrasi ${id} complete gagal:`, err instanceof Error ? err.message : err)
    return go('/connect?error=oauth_failed')
  }
}
