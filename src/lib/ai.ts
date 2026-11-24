import 'server-only'
import { lookup } from 'node:dns/promises'
import net from 'node:net'
import { isPrivateAddress } from './browser'
import { env } from './env'
import { HttpError } from './http'
import { getAiSetting, type AiProvider } from './repo/ai-settings'

// Provider AI (FR-6). Urutan: AI milik pengguna (OpenRouter satu klik atau API key sendiri),
// lalu AI bawaan instalasi dari .env (dengan kuota harian). Hanya dipanggil dari server.

const TIMEOUT_MS = 55_000 // PRD: draf AI selesai < 60 detik

export const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: 'claude-sonnet-5-5',
  openai: '',
  openrouter: 'anthropic/claude-haiku-5.5',
  custom: '',
}

/** Pilihan model yang ditawarkan di UI. Nilai lain tetap boleh diketik. */
export const MODEL_PRESETS: Record<AiProvider, { id: string; label: string }[]> = {
  openrouter: [
    { id: 'anthropic/claude-haiku-5.5', label: 'Claude Haiku 5.5 — cepat, murah' },
    { id: 'anthropic/claude-sonnet-5.5', label: 'Claude Sonnet 5.5 — lebih rapi' },
    { id: 'deepseek/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash — paling hemat' },
    { id: 'openrouter/auto', label: 'Otomatis (OpenRouter memilih)' },
  ],
  anthropic: [
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  ],
  openai: [],
  // Daftar model endpoint custom (mis. 9Router) diambil langsung dari GET /v1/models.
  custom: [],
}

export type AiConfig = { provider: AiProvider; apiKey: string; model: string; own: boolean; baseUrl?: string | null }

/**
 * Normalisasi base URL endpoint OpenAI-compatible: "http://host:20128" → "http://host:20128/v1".
 * Path lain (mis. "/api/v1") dibiarkan apa adanya.
 */
export function normalizeBaseUrl(raw: string): string {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    throw new HttpError(400, 'invalid_base_url', 'Base URL tidak valid')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new HttpError(400, 'invalid_base_url', 'Base URL harus http/https')
  if (u.username || u.password) throw new HttpError(400, 'invalid_base_url', 'Jangan taruh kredensial di URL; isi di kolom API key')
  u.search = ''
  u.hash = ''
  const path = u.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/, '')
  u.pathname = path === '' ? '/v1' : path
  return u.toString().replace(/\/$/, '')
}

/** Mode cloud: endpoint custom harus https dan publik (server Vercel tidak bisa membuka localhost-mu). */
export async function assertAiBaseUrl(base: string) {
  if (!env.isCloud) return
  const u = new URL(base)
  if (u.protocol !== 'https:') throw new HttpError(400, 'invalid_base_url', 'Di versi online, endpoint harus https')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => [])
  if (!addrs.length) throw new HttpError(400, 'invalid_base_url', `Host tidak ditemukan: ${host}`)
  if (addrs.some((a) => isPrivateAddress(a.address))) {
    throw new HttpError(400, 'private_url', 'Versi online tidak bisa memakai localhost/jaringan privat. Pakai URL publik 9Router (VPS, Hugging Face, atau tunnel).')
  }
}

function customHeaders(apiKey: string): Record<string, string> {
  return apiKey ? { authorization: `Bearer ${apiKey}` } : {}
}

/** GET <base>/models — daftar model dari endpoint OpenAI-compatible. */
export async function listCustomModels(baseUrl: string, apiKey: string): Promise<string[]> {
  await assertAiBaseUrl(baseUrl)
  let res: Response
  try {
    res = await fetch(`${baseUrl}/models`, { headers: customHeaders(apiKey), redirect: 'manual', signal: AbortSignal.timeout(15_000) })
  } catch (err) {
    throw new HttpError(502, 'ai_unreachable', `Endpoint tidak bisa dihubungi: ${(err as Error).message}`)
  }
  if (res.status === 401 || res.status === 403) throw new HttpError(400, 'invalid_key', 'API key ditolak oleh endpoint')
  if (!res.ok) throw new HttpError(502, 'ai_error', `Endpoint menjawab ${res.status}`)
  const data = (await res.json().catch(() => ({}))) as { data?: { id?: string }[] }
  return (data.data ?? [])
    .map((m) => m.id)
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
    .slice(0, 500)
}

export function envAiEnabled() {
  return env.aiProvider !== 'none' && Boolean(env.aiApiKey)
}

/** @deprecated gunakan aiFor(userId); dipertahankan untuk pemeriksaan sistem. */
export const aiEnabled = envAiEnabled

export async function aiFor(userId: string): Promise<AiConfig | null> {
  const own = await getAiSetting(userId).catch(() => null)
  if (own) {
    return { provider: own.provider, apiKey: own.apiKey, model: own.model || DEFAULT_MODEL[own.provider], own: true, baseUrl: own.baseUrl }
  }
  if (!envAiEnabled()) return null
  const provider = env.aiProvider as AiProvider
  return { provider, apiKey: env.aiApiKey, model: env.aiModel || DEFAULT_MODEL[provider], own: false }
}

const OPENAI_COMPAT: Record<'openai' | 'openrouter', string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
}

function endpoint(cfg: AiConfig): string {
  if (cfg.provider === 'custom') {
    if (!cfg.baseUrl) throw new Error('Base URL AI belum diisi')
    return `${cfg.baseUrl}/chat/completions`
  }
  return OPENAI_COMPAT[cfg.provider as 'openai' | 'openrouter']
}

export async function completeJson(cfg: AiConfig, system: string, user: string): Promise<string> {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  if (cfg.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: cfg.model, max_tokens: 8000, system, messages: [{ role: 'user', content: user }] }),
    })
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const data = (await res.json()) as { content: { type: string; text?: string }[] }
    return data.content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
  }
  if (!cfg.model) throw new Error('Model AI belum dipilih')
  if (cfg.provider === 'custom') await assertAiBaseUrl(cfg.baseUrl ?? '')
  const res = await fetch(endpoint(cfg), {
    method: 'POST',
    signal,
    redirect: 'manual',
    headers: {
      'content-type': 'application/json',
      ...(cfg.provider === 'custom' ? customHeaders(cfg.apiKey) : { authorization: `Bearer ${cfg.apiKey}` }),
      ...(cfg.provider === 'openrouter' ? { 'HTTP-Referer': env.appUrl, 'X-Title': 'Daily Report' } : {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      // Tidak semua endpoint custom mendukung response_format; prompt sudah meminta JSON saja.
      ...(cfg.provider === 'custom' ? {} : { response_format: { type: 'json_object' } }),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!res.ok) throw new Error(`${cfg.provider} API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = (await res.json()) as { choices: { message: { content: string } }[] }
  return data.choices[0]?.message.content ?? ''
}

/** Memeriksa API key tanpa memakai token (endpoint daftar model / info key). */
export async function verifyAiKey(provider: AiProvider, apiKey: string, baseUrl?: string | null): Promise<boolean> {
  // Endpoint custom: berhasil memuat daftar model = endpoint dan key valid (listCustomModels melempar bila tidak).
  if (provider === 'custom') return (await listCustomModels(baseUrl ?? '', apiKey), true)
  const signal = AbortSignal.timeout(15_000)
  const res =
    provider === 'anthropic'
      ? await fetch('https://api.anthropic.com/v1/models?limit=1', { signal, headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } })
      : provider === 'openai'
        ? await fetch('https://api.openai.com/v1/models', { signal, headers: { authorization: `Bearer ${apiKey}` } })
        : await fetch('https://openrouter.ai/api/v1/key', { signal, headers: { authorization: `Bearer ${apiKey}` } })
  return res.ok
}

/** Mengambil objek JSON pertama dari jawaban model (toleran terhadap ```json ... ```). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Jawaban AI tidak berisi JSON')
  return JSON.parse(text.slice(start, end + 1))
}
