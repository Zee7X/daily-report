import { NextResponse } from 'next/server'
import { z } from 'zod'
import { handoffUrl, onAuthHost, safeNext, verifyPassword } from '@/lib/auth'
import { env } from '@/lib/env'
import { api, HttpError } from '@/lib/http'
import { clientIp, limits } from '@/lib/limits'
import { getPasswordHash } from '@/lib/repo/users'
import { createSession } from '@/lib/session'

const Input = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(200),
  next: z.string().max(500).optional(),
  n: z.string().max(100).optional(),
})

// POST /api/auth/login — login email + password (FR-1).
// Di AUTH_URL tidak ada sesi yang dibuat; hasilnya diserahkan ke APP_URL lewat token yang terikat
// ke nonce browser (parameter n, berasal dari cookie yang dipasang APP_URL).
export const POST = api(
  async (req) => {
    const input = Input.parse(await req.json())
    const ip = await clientIp()
    if (await limits.loginBlocked(input.email, ip)) {
      throw new HttpError(429, 'too_many_attempts', 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.')
    }
    const found = await getPasswordHash(input.email)
    const ok = await verifyPassword(input.password, found?.hash ?? null)
    if (!found || !ok) {
      await limits.loginFailed(input.email, ip)
      throw new HttpError(401, 'invalid_credentials', 'Email atau password salah')
    }
    const next = safeNext(input.next)
    if (await onAuthHost()) {
      if (!input.n) throw new HttpError(400, 'missing_nonce', 'Buka halaman login dari aplikasi lalu coba lagi.')
      return NextResponse.json({ redirect: await handoffUrl(found.user.id, env.appUrl, next, input.n) })
    }
    await createSession(found.user)
    return NextResponse.json({ redirect: next })
  },
  { auth: false },
)
