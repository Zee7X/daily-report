import 'server-only'
import { exec, one } from '../db'
import { decrypt, encrypt } from '../crypto'

/** "custom" = endpoint OpenAI-compatible milik pengguna (9Router, LiteLLM, Ollama, vLLM, ...). */
export type AiProvider = 'anthropic' | 'openai' | 'openrouter' | 'custom'
export const AI_PROVIDERS: AiProvider[] = ['openrouter', 'anthropic', 'openai', 'custom']

export type AiSetting = {
  provider: AiProvider
  apiKey: string
  model: string
  label: string
  baseUrl: string | null
  updatedAt: Date
}
/** Untuk browser: tanpa API key; base URL hanya host-nya. */
export type PublicAiSetting = { provider: AiProvider; model: string; label: string; keyHint: string; host: string | null }

type Row = { provider: string; api_key: string; model: string; label: string; base_url: string | null; updated_at: Date }

export async function getAiSetting(userId: string): Promise<AiSetting | null> {
  const r = await one<Row>('SELECT provider, api_key, model, label, base_url, updated_at FROM ai_settings WHERE user_id = ?', [userId])
  return r
    ? {
        provider: r.provider as AiProvider,
        apiKey: decrypt(r.api_key),
        model: r.model,
        label: r.label,
        baseUrl: r.base_url ? decrypt(r.base_url) : null,
        updatedAt: r.updated_at,
      }
    : null
}

export function toPublicAi(s: AiSetting): PublicAiSetting {
  let host: string | null = null
  try {
    host = s.baseUrl ? new URL(s.baseUrl).host : null
  } catch {
    host = null
  }
  return { provider: s.provider, model: s.model, label: s.label, keyHint: s.apiKey ? `••••${s.apiKey.slice(-4)}` : '—', host }
}

export async function saveAiSetting(
  userId: string,
  s: { provider: AiProvider; apiKey: string; model: string; label: string; baseUrl?: string | null },
) {
  await exec(
    `INSERT INTO ai_settings (user_id, provider, api_key, model, label, base_url) VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE provider = VALUES(provider), api_key = VALUES(api_key), model = VALUES(model),
       label = VALUES(label), base_url = VALUES(base_url), updated_at = CURRENT_TIMESTAMP(3)`,
    // Base URL juga dienkripsi: endpoint pribadi (mis. tunnel ke 9Router) sering berisi alamat rahasia.
    [userId, s.provider, encrypt(s.apiKey), s.model, s.label, s.baseUrl ? encrypt(s.baseUrl) : null],
  )
}

export async function setAiModel(userId: string, model: string) {
  await exec('UPDATE ai_settings SET model = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE user_id = ?', [model, userId])
}

export async function deleteAiSetting(userId: string) {
  await exec('DELETE FROM ai_settings WHERE user_id = ?', [userId])
}
