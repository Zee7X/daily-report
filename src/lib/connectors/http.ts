import 'server-only'
import { updateTokens, type Connection } from '../repo/connections'

// Klien HTTP bersama untuk connector: pembatas laju per koneksi, retry untuk 429/5xx,
// dan refresh token otomatis (sekali) saat 401 atau menjelang kedaluwarsa.

const windows = new Map<string, number[]>()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function throttle(key: string, limit: number, windowMs: number) {
  for (;;) {
    const now = Date.now()
    const hits = (windows.get(key) ?? []).filter((t) => now - t < windowMs)
    if (hits.length < limit) {
      hits.push(now)
      windows.set(key, hits)
      return
    }
    windows.set(key, hits)
    await sleep(windowMs - (now - hits[0]) + 5)
  }
}

export type TokenSet = { accessToken: string; refreshToken: string | null; expiresAt: Date | null }

export type ClientOptions = {
  /** Nama untuk pesan error, mis. "Jira". */
  label: string
  /** Batas request per jendela waktu per koneksi. */
  rate?: { limit: number; windowMs: number }
  /** Header autentikasi; default Bearer access token. */
  authHeaders?: (conn: Connection) => Record<string, string>
  /** Refresh token bila didukung penyedia. */
  refresh?: (conn: Connection) => Promise<TokenSet>
  userAgent?: string
}

export type RequestInit2 = {
  method?: string
  json?: unknown
  body?: BodyInit
  headers?: Record<string, string>
  /** Status yang dianggap sukses walau bukan 2xx (mis. 404 saat mencari). */
  okStatus?: number[]
}

const REFRESH_MARGIN_MS = 5 * 60_000
const MAX_RETRIES = 3

export function createClient(opts: ClientOptions) {
  const rate = opts.rate ?? { limit: 40, windowMs: 10_000 }

  async function doRefresh(conn: Connection) {
    if (!opts.refresh || !conn.refreshToken) throw new Error(`Token ${opts.label} kedaluwarsa. Hubungkan ulang akun ${opts.label}.`)
    const t = await opts.refresh(conn)
    conn.accessToken = t.accessToken
    conn.refreshToken = t.refreshToken ?? conn.refreshToken
    conn.expiresAt = t.expiresAt
    await updateTokens(conn.id, conn)
  }

  async function request(conn: Connection, url: string, init: RequestInit2 = {}): Promise<Response> {
    if (conn.expiresAt && opts.refresh && conn.refreshToken && conn.expiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS) {
      await doRefresh(conn)
    }
    let refreshed = false
    for (let attempt = 0; ; attempt++) {
      await throttle(`${opts.label}:${conn.id}`, rate.limit, rate.windowMs)
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...(opts.userAgent ? { 'User-Agent': opts.userAgent } : {}),
        ...(opts.authHeaders ? opts.authHeaders(conn) : { Authorization: `Bearer ${conn.accessToken}` }),
        ...init.headers,
      }
      let body = init.body
      if (init.json !== undefined) {
        headers['Content-Type'] = 'application/json'
        body = JSON.stringify(init.json)
      }
      const res = await fetch(url, { method: init.method ?? 'GET', headers, body, signal: AbortSignal.timeout(30_000) })
      if (res.status === 401 && !refreshed && opts.refresh && conn.refreshToken) {
        refreshed = true
        await doRefresh(conn)
        continue
      }
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get('Retry-After'))
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 20) * 1000 : 1000 * 2 ** attempt)
        continue
      }
      if (!res.ok && !init.okStatus?.includes(res.status)) {
        const text = await res.text().catch(() => '')
        throw new Error(`${opts.label} ${init.method ?? 'GET'} gagal (${res.status}): ${text.slice(0, 200)}`)
      }
      return res
    }
  }

  async function json<T>(conn: Connection, url: string, init?: RequestInit2): Promise<T> {
    const res = await request(conn, url, init)
    const text = await res.text()
    return (text ? JSON.parse(text) : null) as T
  }

  return { request, json }
}

/** Menukar authorization code / refresh token di endpoint token OAuth 2.0 standar. */
export async function oauthToken(
  url: string,
  params: Record<string, string>,
  opts: { as?: 'form' | 'json' | 'query'; label: string; headers?: Record<string, string> },
): Promise<Record<string, unknown>> {
  const as = opts.as ?? 'form'
  const target = as === 'query' ? `${url}?${new URLSearchParams(params)}` : url
  const res = await fetch(target, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(as === 'json' ? { 'Content-Type': 'application/json' } : as === 'form' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...opts.headers,
    },
    body: as === 'json' ? JSON.stringify(params) : as === 'form' ? new URLSearchParams(params) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(text)
  } catch {
    data = Object.fromEntries(new URLSearchParams(text))
  }
  if (!res.ok || data.error) {
    throw new Error(`${opts.label} token error ${res.status}: ${String(data.error_description ?? data.error ?? text).slice(0, 200)}`)
  }
  return data
}

export const expiresIn = (v: unknown) => (typeof v === 'number' && v > 0 ? new Date(Date.now() + v * 1000) : null)

/** HTML/ADF → teks biasa sederhana untuk bahan draf. */
export function plain(text: string | null | undefined): string {
  return (text ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Komponen ID opak: bagian dipisah "~" dan di-encode agar aman dipakai di URL. */
export const ref = {
  // encodeURIComponent tidak meng-escape "~", jadi di-escape manual agar ID bersarang tetap utuh.
  make: (...parts: (string | number)[]) => parts.map((p) => encodeURIComponent(String(p)).replace(/~/g, '%7E')).join('~'),
  parse: (id: string, n: number, label: string) => {
    const parts = id.split('~').map(decodeURIComponent)
    if (parts.length !== n || parts.some((p) => !p)) throw new Error(`ID ${label} tidak valid`)
    return parts
  },
}
