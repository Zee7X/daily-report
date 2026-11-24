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
  /^\/api\/integrations\/[^/]+\/callback$/,
  /^\/oauth\/[^/]+$/,
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

/** Halaman aplikasi (bukan API, login, atau callback) yang butuh sesi. */
const PUBLIC = [/^\/login$/, /^\/api\//, /^\/oauth\//, /^\/print\//]

function singleUser() {
  const mode = process.env.APP_MODE || (process.env.VERCEL ? 'cloud' : 'local')
  return !process.env.VERCEL && mode === 'local' && (process.env.SINGLE_USER ?? 'true') === 'true'
}

export function proxy(req: NextRequest) {
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const app = origin(process.env.APP_URL || (vercelProd ? `https://${vercelProd}` : undefined))
  const auth = origin(process.env.AUTH_URL)
  const split = Boolean(app && auth && app.host !== auth.host)
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? ''
  const { pathname, search } = req.nextUrl

  // Pengunjung tanpa cookie sesi langsung diarahkan ke /login, tanpa sempat melihat kerangka halaman.
  // (Validitas cookie tetap diperiksa di server oleh halaman itu sendiri.)
  const onApp = !split || host === app!.host
  if (onApp && !singleUser() && !req.cookies.has('rt_session') && !PUBLIC.some((re) => re.test(pathname))) {
    const login = new URL('/login', app && host === app.host ? app : req.nextUrl)
    if (pathname !== '/') login.searchParams.set('next', pathname + search)
    return NextResponse.redirect(login, 307)
  }

  if (!split) return pass(req)

  if (host === auth!.host && !AUTH_PATHS.some((re) => re.test(pathname))) {
    return NextResponse.redirect(new URL(pathname + search, app!), 307)
  }
  if (host === app!.host && pathname === '/login') {
    const nonce = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    const target = new URL('/login', auth!)
    req.nextUrl.searchParams.forEach((v, k) => k !== 'n' && target.searchParams.set(k, v))
    target.searchParams.set('n', nonce)
    const res = NextResponse.redirect(target, 307)
    res.cookies.set('rt_hn', nonce, {
      httpOnly: true,
      secure: app!.protocol === 'https:',
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
