import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { currentUser } from './session'
import type { User } from './repo/users'

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message ?? code)
  }
}

/**
 * Pembungkus route handler: autentikasi, cek Origin untuk request yang mengubah data (CSRF),
 * dan format error yang seragam.
 */
export function api<Ctx = unknown>(
  handler: (req: NextRequest, ctx: Ctx & { user: User }) => Promise<Response>,
  opts: { auth?: boolean } = {},
) {
  return async (req: NextRequest, ctx: Ctx) => {
    try {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) assertSameOrigin(req)
      const user = opts.auth === false ? (null as unknown as User) : await currentUser()
      if (opts.auth !== false && !user) throw new HttpError(401, 'unauthorized')
      return await handler(req, { ...(ctx as object), user } as Ctx & { user: User })
    } catch (err) {
      return errorResponse(err)
    }
  }
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.code, message: err.message, ...err.extra }, { status: err.status })
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ error: 'invalid_input', issues: err.issues }, { status: 400 })
  }
  console.error(err)
  const message = err instanceof Error ? err.message : 'Internal error'
  return NextResponse.json({ error: 'internal', message }, { status: 500 })
}

function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin')
  // Request tanpa Origin (curl, worker, QStash) diperiksa lewat mekanisme lain (secret/signature).
  if (!origin) return
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    throw new HttpError(403, 'bad_origin')
  }
  if (originHost !== host) throw new HttpError(403, 'bad_origin')
}

export function notFound(what = 'not_found'): never {
  throw new HttpError(404, what)
}
