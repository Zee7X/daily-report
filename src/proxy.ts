import { NextResponse, type NextRequest } from 'next/server'

// Pemisahan domain (opsional, aktif bila AUTH_URL berbeda dari APP_URL):
// - AUTH_URL (mis. https://daily-report.vercel.app) hanya melayani login dan callback OAuth.
// - APP_URL (mis. https://daily-report.lumelo.my.id) melayani aplikasinya; /login diarahkan ke AUTH_URL.
// Proxy hanya membaca host dan path, tanpa akses database.

const AUTH_PATHS = [
  /^\/login$/,
  /^\/api\/auth\//,
  /^\/api\/connectors\/[^/]+\/(authorize|callback)$/,
  /^\/api\/locale$/,
  /^\/api\/health$/,
]

function origin(raw: string | undefined) {
  if (!raw) return null
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

/** Path yang diminta diteruskan ke halaman, agar redirect ke /login bisa membawa ?next=. */
function pass(req: NextRequest) {
  const headers = new Headers(req.headers)
  headers.set('x-rt-path', req.nextUrl.pathname + req.nextUrl.search)
  return NextResponse.next({ request: { headers } })
}

export function proxy(req: NextRequest) {
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const app = origin(process.env.APP_URL || (vercelProd ? `https://${vercelProd}` : undefined))
  const auth = origin(process.env.AUTH_URL)
  if (!app || !auth || app.host === auth.host) return pass(req)

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? ''
  const { pathname, search } = req.nextUrl

  if (host === auth.host && !AUTH_PATHS.some((re) => re.test(pathname))) {
    return NextResponse.redirect(new URL(pathname + search, app), 307)
  }
  if (host === app.host && pathname === '/login') {
    return NextResponse.redirect(new URL(pathname + search, auth), 307)
  }
  return pass(req)
}

export const config = {
  // Aset statis dan file ikon tidak perlu melewati proxy.
  matcher: ['/((?!_next/|icon.png|apple-icon.png|logo.png|favicon.ico).*)'],
}
