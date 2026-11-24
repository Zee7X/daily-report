import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { api } from '@/lib/http'
import { destroySession } from '@/lib/session'

export const POST = api(
  async () => {
    await destroySession()
    return NextResponse.redirect(new URL('/login', env.appUrl), { status: 303 })
  },
  { auth: false },
)
