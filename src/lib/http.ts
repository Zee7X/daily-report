import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { env } from './env'
import { dictionaries, fmt, type Locale } from './i18n/dict'
import { getLocale } from './i18n/server'
import { currentUser } from './session'
import type { User } from './repo/users'

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public extra?: Record<string, unknown>,
    public vars?: Record<string, string | number>,
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

/** message sebuah HttpError boleh berupa kunci t.apiErrors; diterjemahkan ke bahasa yang diminta. */
export function describeError(err: unknown, locale: Locale): string {
  if (!(err instanceof HttpError)) return err instanceof Error ? err.message : String(err)
  const tpl = (dictionaries[locale].apiErrors as Record<string, string>)[err.message]
  if (!tpl) return err.message
  return fmt(tpl, Object.fromEntries(Object.entries(err.vars ?? {}).map(([k, v]) => [k, String(v)])))
}

export async function errorResponse(err: unknown) {
  const locale = await getLocale().catch(() => 'en' as const)
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.code, message: describeError(err, locale), ...err.extra }, { status: err.status })
  }
  if (err instanceof ZodError) {
    const first = err.issues[0]?.message
    const message = first && (dictionaries[locale].apiErrors as Record<string, string>)[first]
    return NextResponse.json({ error: 'invalid_input', ...(message ? { message } : {}), issues: err.issues }, { status: 400 })
  }
  console.error(err)
  // Di mode cloud, detail error internal (SQL, API pihak ketiga) tidak dikirim ke browser.
  const message = env.isCloud ? dictionaries[locale].apiErrors.serverError : err instanceof Error ? err.message : 'Internal error'
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
