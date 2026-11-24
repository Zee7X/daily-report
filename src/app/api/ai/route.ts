import { NextResponse } from 'next/server'
import { z } from 'zod'
import { envAiEnabled, MODEL_PRESETS, verifyAiKey, DEFAULT_MODEL } from '@/lib/ai'
import { api, HttpError } from '@/lib/http'
import { AI_PROVIDERS, deleteAiSetting, getAiSetting, saveAiSetting, setAiModel, toPublicAi, type AiProvider } from '@/lib/repo/ai-settings'

// AI milik pengguna. API key tidak pernah dikirim balik ke browser (hanya 4 karakter terakhir).

export const GET = api(async (_req, { user }) => {
  const s = await getAiSetting(user.id)
  return NextResponse.json({ setting: s ? toPublicAi(s) : null, builtIn: envAiEnabled(), presets: MODEL_PRESETS })
})

const KeyInput = z.object({
  provider: z.enum(AI_PROVIDERS as [AiProvider, ...AiProvider[]]),
  apiKey: z.string().trim().min(10).max(500),
  model: z.string().trim().max(128).optional(),
})

// POST /api/ai — simpan API key sendiri (diperiksa dulu ke provider)
export const POST = api(async (req, { user }) => {
  const input = KeyInput.parse(await req.json())
  const model = input.model || DEFAULT_MODEL[input.provider]
  if (!model) throw new HttpError(400, 'model_required', 'Isi nama model untuk provider ini')
  if (!(await verifyAiKey(input.provider, input.apiKey).catch(() => false))) {
    throw new HttpError(400, 'invalid_key', 'API key ditolak oleh provider')
  }
  const label = { anthropic: 'Anthropic', openai: 'OpenAI', openrouter: 'OpenRouter' }[input.provider]
  await saveAiSetting(user.id, { provider: input.provider, apiKey: input.apiKey, model, label })
  return NextResponse.json({ setting: toPublicAi((await getAiSetting(user.id))!) }, { status: 201 })
})

// PATCH /api/ai — ganti model
export const PATCH = api(async (req, { user }) => {
  const { model } = z.object({ model: z.string().trim().min(1).max(128) }).parse(await req.json())
  if (!(await getAiSetting(user.id))) throw new HttpError(404, 'ai_not_connected')
  await setAiModel(user.id, model)
  return NextResponse.json({ setting: toPublicAi((await getAiSetting(user.id))!) })
})

// DELETE /api/ai — putuskan AI (API key dihapus dari database)
export const DELETE = api(async (_req, { user }) => {
  await deleteAiSetting(user.id)
  return NextResponse.json({ ok: true })
})
