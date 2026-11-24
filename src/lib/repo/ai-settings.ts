import 'server-only'
import { exec, one } from '../db'
import { decrypt, encrypt } from '../crypto'

export type AiProvider = 'anthropic' | 'openai' | 'openrouter'
export const AI_PROVIDERS: AiProvider[] = ['openrouter', 'anthropic', 'openai']

export type AiSetting = { provider: AiProvider; apiKey: string; model: string; label: string; updatedAt: Date }
/** Untuk browser: tanpa API key. */
export type PublicAiSetting = { provider: AiProvider; model: string; label: string; keyHint: string }

type Row = { provider: string; api_key: string; model: string; label: string; updated_at: Date }

export async function getAiSetting(userId: string): Promise<AiSetting | null> {
  const r = await one<Row>('SELECT provider, api_key, model, label, updated_at FROM ai_settings WHERE user_id = ?', [userId])
  return r ? { provider: r.provider as AiProvider, apiKey: decrypt(r.api_key), model: r.model, label: r.label, updatedAt: r.updated_at } : null
}

export function toPublicAi(s: AiSetting): PublicAiSetting {
  return { provider: s.provider, model: s.model, label: s.label, keyHint: `••••${s.apiKey.slice(-4)}` }
}

export async function saveAiSetting(userId: string, s: { provider: AiProvider; apiKey: string; model: string; label: string }) {
  await exec(
    `INSERT INTO ai_settings (user_id, provider, api_key, model, label) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE provider = VALUES(provider), api_key = VALUES(api_key), model = VALUES(model),
       label = VALUES(label), updated_at = CURRENT_TIMESTAMP(3)`,
    [userId, s.provider, encrypt(s.apiKey), s.model, s.label],
  )
}

export async function setAiModel(userId: string, model: string) {
  await exec('UPDATE ai_settings SET model = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE user_id = ?', [model, userId])
}

export async function deleteAiSetting(userId: string) {
  await exec('DELETE FROM ai_settings WHERE user_id = ?', [userId])
}
