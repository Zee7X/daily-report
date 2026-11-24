import { NextResponse } from 'next/server'
import { z } from 'zod'
import { canSignup, handoffUrl, hashPassword, onAuthHost, safeNext } from '@/lib/auth'
import { env } from '@/lib/env'
import { api, HttpError } from '@/lib/http'
import { createUser, findUserByEmail } from '@/lib/repo/users'
import { createSession } from '@/lib/session'

const Input = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(255),
  password: z.string().min(10, 'Password minimal 10 karakter').max(200),
  next: z.string().max(500).optional(),
  n: z.string().max(100).optional(),
})

// POST /api/auth/signup — akun baru dengan email + password. Tidak butuh SMTP, jadi email belum terverifikasi;
// bila pemilik asli email itu nanti "Login with Basecamp", password ini dihapus dan sesinya dibatalkan.
// Siapa yang boleh mendaftar diatur SIGNUP_ALLOWED_EMAILS (kosong = hanya akun pertama/pemilik).
export const POST = api(
  async (req) => {
    const input = Input.parse(await req.json())
    const split = await onAuthHost()
    if (split && !input.n) throw new HttpError(400, 'missing_nonce', 'Buka halaman login dari aplikasi lalu coba lagi.')
    if (await findUserByEmail(input.email)) throw new HttpError(409, 'email_taken', 'Email sudah terdaftar. Silakan masuk.')
    if (!(await canSignup(input.email))) throw new HttpError(403, 'signup_closed', 'Pendaftaran untuk email ini tidak dibuka.')
    const user = await createUser(input.email, input.name, { passwordHash: await hashPassword(input.password) })
    const next = safeNext(input.next)
    if (split) return NextResponse.json({ redirect: await handoffUrl(user.id, env.appUrl, next, input.n!) }, { status: 201 })
    await createSession(user)
    return NextResponse.json({ redirect: next }, { status: 201 })
  },
  { auth: false },
)
