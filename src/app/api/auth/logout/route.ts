import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { api } from '@/lib/http'
import { currentUser, destroySession } from '@/lib/session'

// POST /api/auth/logout — hapus cookie sesi dan batalkan semua sesi pengguna di perangkat lain.
export const POST = api(
  async () => {
    const user = await currentUser().catch(() => null)
    await destroySession(user)
    return NextResponse.redirect(new URL('/login', env.appUrl), { status: 303 })
  },
  { auth: false },
)
