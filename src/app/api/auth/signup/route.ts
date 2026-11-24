import { NextResponse } from 'next/server'
import { z } from 'zod'
import { afterLoginUrl, canSignup, hashPassword, safeNext } from '@/lib/auth'
import { api, HttpError } from '@/lib/http'
import { createUser, findUserByEmail } from '@/lib/repo/users'
import { createSession } from '@/lib/session'

const Input = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(255),
  password: z.string().min(10, 'Password minimal 10 karakter').max(200),
  next: z.string().max(500).optional(),
})

// POST /api/auth/signup — akun baru dengan email + password. Tidak butuh SMTP.
// Siapa yang boleh mendaftar diatur SIGNUP_ALLOWED_EMAILS (kosong = hanya akun pertama/pemilik).
export const POST = api(
  async (req) => {
    const input = Input.parse(await req.json())
    if (await findUserByEmail(input.email)) throw new HttpError(409, 'email_taken', 'Email sudah terdaftar. Silakan masuk.')
    if (!(await canSignup(input.email))) throw new HttpError(403, 'signup_closed', 'Pendaftaran untuk email ini tidak dibuka.')
    const user = await createUser(input.email, input.name, await hashPassword(input.password))
    const next = safeNext(input.next)
    const handoff = await afterLoginUrl(user.id, next)
    await createSession(user.id, { short: Boolean(handoff) })
    return NextResponse.json({ redirect: handoff ?? next }, { status: 201 })
  },
  { auth: false },
)
