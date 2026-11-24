import 'server-only'
import { env } from './env'
import { getAiSetting, type AiProvider } from './repo/ai-settings'

// Provider AI (FR-6). Urutan: AI milik pengguna (OpenRouter satu klik atau API key sendiri),
// lalu AI bawaan instalasi dari .env (dengan kuota harian). Hanya dipanggil dari server.

const TIMEOUT_MS = 55_000 // PRD: draf AI selesai < 60 detik

export const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: 'claude-sonnet-5-5',
  openai: '',
  openrouter: 'anthropic/claude-haiku-5.5',
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
}

export type AiConfig = { provider: AiProvider; apiKey: string; model: string; own: boolean }

export function envAiEnabled() {
  return env.aiProvider !== 'none' && Boolean(env.aiApiKey)
}

/** @deprecated gunakan aiFor(userId); dipertahankan untuk pemeriksaan sistem. */
export const aiEnabled = envAiEnabled

export async function aiFor(userId: string): Promise<AiConfig | null> {
  const own = await getAiSetting(userId).catch(() => null)
  if (own) return { provider: own.provider, apiKey: own.apiKey, model: own.model || DEFAULT_MODEL[own.provider], own: true }
  if (!envAiEnabled()) return null
  const provider = env.aiProvider as AiProvider
  return { provider, apiKey: env.aiApiKey, model: env.aiModel || DEFAULT_MODEL[provider], own: false }
}

const OPENAI_COMPAT: Record<'openai' | 'openrouter', string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
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
  const res = await fetch(OPENAI_COMPAT[cfg.provider], {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.apiKey}`,
      ...(cfg.provider === 'openrouter' ? { 'HTTP-Referer': env.appUrl, 'X-Title': 'Daily Report' } : {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      response_format: { type: 'json_object' },
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
export async function verifyAiKey(provider: AiProvider, apiKey: string): Promise<boolean> {
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
