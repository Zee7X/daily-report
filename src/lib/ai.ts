import 'server-only'
import { env } from './env'

// Provider AI dipilih lewat .env (FR-6). Hanya dipanggil dari server.

const TIMEOUT_MS = 55_000 // PRD: draf AI selesai < 60 detik

export function aiEnabled() {
  return env.aiProvider !== 'none' && Boolean(env.aiApiKey)
}

export async function completeJson(system: string, user: string): Promise<string> {
  if (!aiEnabled()) throw new Error('AI tidak aktif')
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  if (env.aiProvider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.aiApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.aiModel || 'claude-sonnet-5-5',
        max_tokens: 8000,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const data = (await res.json()) as { content: { type: string; text?: string }[] }
    return data.content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
  }
  if (!env.aiModel) throw new Error('AI_MODEL wajib diisi untuk provider openai')
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.aiApiKey}` },
    body: JSON.stringify({
      model: env.aiModel,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = (await res.json()) as { choices: { message: { content: string } }[] }
  return data.choices[0]?.message.content ?? ''
}

/** Mengambil objek JSON pertama dari jawaban model (toleran terhadap ```json ... ```). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Jawaban AI tidak berisi JSON')
  return JSON.parse(text.slice(start, end + 1))
}
