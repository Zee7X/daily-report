import 'server-only'
import { lookup } from 'node:dns/promises'
import net from 'node:net'
import { isPrivateAddress } from '../browser'
import { env } from '../env'
import { HttpError } from '../http'

// Pemeriksaan token pribadi: satu request identitas ke tool, tanpa retry dan tanpa token di pesan error.

type Probe = {
  method?: string
  headers: Record<string, string>
  json?: unknown
  /** Default: 401/403. Linear membalas error autentikasi di body GraphQL. */
  authFailed?: (status: number, data: unknown) => boolean
}

const invalid = (label: string) => new HttpError(400, 'invalid_token', 'tokenInvalid', undefined, { label })
const unreachable = (label: string) => new HttpError(502, 'token_unreachable', 'tokenUnreachable', undefined, { label })

export async function probe<T>(label: string, url: string, p: Probe): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method: p.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'daily-report',
        ...(p.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...p.headers,
      },
      body: p.json !== undefined ? JSON.stringify(p.json) : undefined,
      redirect: 'error', // URL situs Jira dari pengguna: jangan ikuti redirect ke alamat lain
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw unreachable(label)
  }
  const data: unknown = await res.json().catch(() => null)
  if ((p.authFailed ?? ((s: number) => s === 401 || s === 403))(res.status, data)) throw invalid(label)
  if (!res.ok || data === null) throw unreachable(label)
  return data as T
}

/** Mode cloud: URL buatan pengguna harus https dan publik (server tidak boleh membuka jaringan privat). */
export async function assertPublicHttps(u: URL) {
  if (u.protocol !== 'https:') throw new HttpError(400, 'invalid_site_url', 'siteUrlHttps')
  if (!env.isCloud) return
  const host = u.hostname.replace(/^\[|\]$/g, '')
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => [])
  if (!addrs.length) throw new HttpError(400, 'invalid_site_url', 'hostNotFound', undefined, { host })
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new HttpError(400, 'private_url', 'privateUrlSite')
}
