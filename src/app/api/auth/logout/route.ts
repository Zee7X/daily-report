import { NextResponse } from 'next/server'
import { handoffUrl } from '@/lib/auth'
import { env } from '@/lib/env'
import { api } from '@/lib/http'
import { currentUser, destroySession } from '@/lib/session'

// POST /api/auth/logout — hapus sesi. Bila AUTH_URL dipakai, sesi pendek di domain login juga dihapus
// lewat /api/auth/signout dengan token sekali pakai (bukan GET polos, agar tidak bisa dipicu situs lain).
export const POST = api(
  async () => {
    const user = await currentUser().catch(() => null)
    await destroySession()
    const target =
      env.splitAuth && user ? await handoffUrl(user.id, env.authUrl, '/login', '/api/auth/signout') : new URL('/login', env.appUrl).toString()
    return NextResponse.redirect(target, { status: 303 })
  },
  { auth: false },
)
