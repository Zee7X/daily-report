import { NextResponse } from 'next/server'
import { z } from 'zod'
import { listCustomModels, normalizeBaseUrl } from '@/lib/ai'
import { api } from '@/lib/http'
import { consume } from '@/lib/limits'
import { getAiSetting } from '@/lib/repo/ai-settings'

// POST /api/ai/models — daftar model dari endpoint OpenAI-compatible (mis. 9Router).
//   { baseUrl, apiKey }  → sebelum disimpan
//   {}                   → memakai endpoint yang sudah tersimpan
export const POST = api(async (req, { user }) => {
  await consume('ai_models', user.id, 30, 3600_000, 'rateAiModels')
  const input = z.object({ baseUrl: z.string().trim().max(500).optional(), apiKey: z.string().trim().max(500).optional() }).parse(await req.json())
  let baseUrl: string
  let apiKey: string
  if (input.baseUrl) {
    baseUrl = normalizeBaseUrl(input.baseUrl)
    apiKey = input.apiKey ?? ''
  } else {
    const s = await getAiSetting(user.id)
    if (!s || s.provider !== 'custom' || !s.baseUrl) return NextResponse.json({ models: [] })
    baseUrl = s.baseUrl
    apiKey = s.apiKey
  }
  return NextResponse.json({ models: await listCustomModels(baseUrl, apiKey) })
})
