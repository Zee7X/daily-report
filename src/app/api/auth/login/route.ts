import { NextResponse } from 'next/server'
import { z } from 'zod'
import { afterLoginUrl, recordFailure, safeNext, tooManyAttempts, verifyPassword } from '@/lib/auth'
import { api, HttpError } from '@/lib/http'
import { getPasswordHash } from '@/lib/repo/users'
import { createSession } from '@/lib/session'

const Input = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(200),
  next: z.string().max(500).optional(),
})

// POST /api/auth/login — login email + password (FR-1)
export const POST = api(
  async (req) => {
    const input = Input.parse(await req.json())
    const key = `login:${input.email.toLowerCase()}`
    if (tooManyAttempts(key)) throw new HttpError(429, 'too_many_attempts', 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.')
    const found = await getPasswordHash(input.email)
    const ok = await verifyPassword(input.password, found?.hash ?? null)
    if (!found || !ok) {
      recordFailure(key)
      throw new HttpError(401, 'invalid_credentials', 'Email atau password salah')
    }
    const next = safeNext(input.next)
    const handoff = await afterLoginUrl(found.user.id, next)
    if (handoff) {
      await createSession(found.user.id, { short: true })
      return NextResponse.json({ redirect: handoff })
    }
    await createSession(found.user.id)
    return NextResponse.json({ redirect: next })
  },
  { auth: false },
)
