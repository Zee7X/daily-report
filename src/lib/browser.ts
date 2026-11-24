import 'server-only'
import { lookup } from 'node:dns/promises'
import net from 'node:net'
import { env } from './env'
import { HttpError } from './http'

// Klien worker Python Playwright (screenshot + PDF). Lihat folder worker/.

export type ScreenshotOptions = { width: number; height: number; fullPage: boolean }

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' }
  if (env.browserWorkerToken) h.authorization = `Bearer ${env.browserWorkerToken}`
  return h
}

export function browserEnabled() {
  return env.browserDriver !== 'none'
}

async function call(path: string, body: object, timeoutMs: number): Promise<Buffer> {
  if (!browserEnabled()) throw new HttpError(503, 'browser_disabled', 'BROWSER_DRIVER=none')
  let res: Response
  try {
    res = await fetch(`${env.browserWorkerUrl}${path}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw new HttpError(503, 'browser_unreachable', `Worker browser tidak bisa dihubungi di ${env.browserWorkerUrl}: ${(err as Error).message}`)
  }
  if (!res.ok) throw new Error(`Worker ${path} gagal (${res.status}): ${(await res.text()).slice(0, 300)}`)
  return Buffer.from(await res.arrayBuffer())
}

export async function browserHealth(): Promise<boolean> {
  if (!browserEnabled()) return false
  try {
    const res = await fetch(`${env.browserWorkerUrl}/health`, { headers: headers(), signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

export async function screenshot(url: string, opts: ScreenshotOptions): Promise<Buffer> {
  await assertScreenshotUrl(url)
  return call('/screenshot', { url, ...opts, blockPrivate: env.isCloud }, 45_000)
}

export async function renderPdf(html: string): Promise<Buffer> {
  return call('/pdf', { html }, 60_000)
}

/** Mode cloud hanya boleh membuka URL publik (PRD 8.2). Mode lokal mengizinkan localhost. */
export async function assertScreenshotUrl(raw: string) {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new HttpError(400, 'invalid_url', `URL tidak valid: ${raw}`)
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new HttpError(400, 'invalid_url', 'Hanya http/https')
  if (!env.isCloud) return
  const host = u.hostname.replace(/^\[|\]$/g, '')
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => [])
  if (!addrs.length) throw new HttpError(400, 'invalid_url', `Host tidak ditemukan: ${host}`)
  if (addrs.some((a) => isPrivateAddress(a.address))) {
    throw new HttpError(400, 'private_url', 'Mode cloud hanya bisa mengambil screenshot dari URL publik')
  }
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    )
  }
  const v6 = ip.toLowerCase()
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7))
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80')
}
