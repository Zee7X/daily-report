import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertAiBaseUrl, DEFAULT_MODEL, envAiEnabled, MODEL_PRESETS, normalizeBaseUrl, verifyAiKey } from '@/lib/ai'
import { api, HttpError } from '@/lib/http'
import { AI_PROVIDERS, deleteAiSetting, getAiSetting, saveAiSetting, setAiModel, toPublicAi, type AiProvider } from '@/lib/repo/ai-settings'

// AI milik pengguna. API key tidak pernah dikirim balik ke browser (hanya 4 karakter terakhir).

const LABEL: Record<AiProvider, string> = { anthropic: 'Anthropic', openai: 'OpenAI', openrouter: 'OpenRouter', custom: 'OpenAI-compatible' }

export const GET = api(async (_req, { user }) => {
  const s = await getAiSetting(user.id)
  return NextResponse.json({ setting: s ? toPublicAi(s) : null, builtIn: envAiEnabled(), presets: MODEL_PRESETS })
})

const KeyInput = z
  .object({
    provider: z.enum(AI_PROVIDERS as [AiProvider, ...AiProvider[]]),
    apiKey: z.string().trim().max(500).default(''),
    model: z.string().trim().max(128).optional(),
    baseUrl: z.string().trim().max(500).optional(),
    label: z.string().trim().max(60).optional(),
  })
  .refine((v) => v.provider === 'custom' || v.apiKey.length >= 10, { message: 'API key wajib diisi', path: ['apiKey'] })
  .refine((v) => v.provider !== 'custom' || Boolean(v.baseUrl), { message: 'Base URL wajib diisi', path: ['baseUrl'] })

// POST /api/ai — simpan API key / endpoint sendiri (diperiksa dulu ke provider)
export const POST = api(async (req, { user }) => {
  const input = KeyInput.parse(await req.json())
  const baseUrl = input.provider === 'custom' ? normalizeBaseUrl(input.baseUrl!) : null
  if (baseUrl) await assertAiBaseUrl(baseUrl)
  const model = input.model || DEFAULT_MODEL[input.provider]
  if (!model) throw new HttpError(400, 'model_required', 'Pilih atau isi nama model')
  if (!(await verifyAiKey(input.provider, input.apiKey, baseUrl).catch((e) => (e instanceof HttpError ? Promise.reject(e) : false)))) {
    throw new HttpError(400, 'invalid_key', 'API key ditolak oleh provider')
  }
  const label = input.provider === 'custom' ? input.label || `${LABEL.custom} · ${new URL(baseUrl!).host}` : LABEL[input.provider]
  await saveAiSetting(user.id, { provider: input.provider, apiKey: input.apiKey, model, label, baseUrl })
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
