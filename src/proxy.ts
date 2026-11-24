import { NextResponse, type NextRequest } from 'next/server'

// Pemisahan domain (opsional, aktif bila AUTH_URL berbeda dari APP_URL):
// - AUTH_URL (mis. https://daily-report-lumelo.vercel.app) hanya melayani form login dan callback OAuth,
//   dan tidak pernah menyimpan sesi.
// - APP_URL (mis. https://daily-report.lumelo.my.id) melayani aplikasi. /login di sini memasang cookie nonce
//   lalu dialihkan ke AUTH_URL; hasil login hanya diterima kembali oleh browser yang memegang nonce itu.
// Proxy hanya membaca host dan path, tanpa akses database.

const AUTH_PATHS = [
  /^\/login$/,
  /^\/api\/auth\/(login|signup)$/,
  /^\/api\/connectors\/[^/]+\/callback$/,
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
    const nonce = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    const target = new URL('/login', auth)
    req.nextUrl.searchParams.forEach((v, k) => k !== 'n' && target.searchParams.set(k, v))
    target.searchParams.set('n', nonce)
    const res = NextResponse.redirect(target, 307)
    res.cookies.set('rt_hn', nonce, {
      httpOnly: true,
      secure: app.protocol === 'https:',
      sameSite: 'lax',
      path: '/api/auth/handoff',
      maxAge: 600,
    })
    return res
  }
  return pass(req)
}

export const config = {
  // Aset statis dan file ikon tidak perlu melewati proxy.
  matcher: ['/((?!_next/|icon.png|apple-icon.png|logo.png|favicon.ico).*)'],
}
