import { NextResponse, type NextRequest } from 'next/server'
import { canSignup, completeOAuthState, currentBase, OAUTH_NONCE_COOKIE } from '@/lib/auth'
import { decrypt } from '@/lib/crypto'
import type { Identity } from '@/lib/connectors/types'
import { saveConnection, type ConnectionInput } from '@/lib/repo/connections'
import { createUser, findUserByEmail, markEmailVerified, setUserName } from '@/lib/repo/users'
import { createSession, currentUser } from '@/lib/session'

// GET /api/connectors/:provider/complete?s=<state>&k=<kunci> — langkah terakhir OAuth, di domain yang memulai alur.
// Syarat: cookie nonce browser ini cocok (browser pemulai), kunci k cocok (browser yang menyetujui di penyedia),
// dan untuk "connect" sesi aktif = pengguna pemulai.
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  const base = await currentBase()
  const go = (path: string) => {
    const res = NextResponse.redirect(new URL(path, base))
    res.cookies.delete({ name: OAUTH_NONCE_COOKIE, path: `/api/connectors/${provider}` })
    return res
  }
  const nonce = req.cookies.get(OAUTH_NONCE_COOKIE)?.value ?? ''
  const sp = req.nextUrl.searchParams
  let state: Awaited<ReturnType<typeof completeOAuthState>>
  try {
    state = await completeOAuthState(sp.get('s') ?? '', nonce, sp.get('k') ?? '')
  } catch (err) {
    console.error(`OAuth state ${provider} gagal diselesaikan:`, err instanceof Error ? err.message : err)
    return go('/login?error=server_busy')
  }
  if (!state || state.provider !== provider || !state.result || new URL(state.returnBase).host !== new URL(base).host) {
    return go('/login?error=invalid_state')
  }
  const { connection, identity } = JSON.parse(decrypt(state.result)) as {
    connection: ConnectionInput & { expiresAt: string | null }
    identity: Identity
  }
  const conn: ConnectionInput = { ...connection, expiresAt: connection.expiresAt ? new Date(connection.expiresAt) : null }

  try {
    if (state.intent === 'connect') {
      const user = await currentUser()
      if (!user || user.id !== state.userId) return go('/connect?error=session_mismatch')
      // Email terverifikasi penyedia = email akun, dan pemegang sesi yang menghubungkannya: kepemilikan terbukti.
      if (identity.verified && identity.email.toLowerCase() === user.email) await markEmailVerified(user, { keepPassword: true })
      await setUserName(user.id, identity.name)
      await saveConnection(user.id, provider, conn)
      return go(state.nextPath)
    }

    // Login hanya untuk penyedia yang menjamin email terverifikasi.
    if (!identity.verified) return go('/login?error=email_not_verified')
    let user = await findUserByEmail(identity.email)
    if (!user) {
      if (!(await canSignup(identity.email))) return go('/login?error=signup_closed')
      user = await createUser(identity.email, identity.name, { emailVerified: true })
    } else {
      user = await markEmailVerified(user)
    }
    await setUserName(user.id, identity.name)
    await saveConnection(user.id, provider, conn)
    await createSession(user)
    return go(state.nextPath)
  } catch (err) {
    console.error('OAuth complete gagal:', err instanceof Error ? err.message : err)
    return go(state.intent === 'login' ? '/login?error=oauth_failed' : '/connect?error=oauth_failed')
  }
}
