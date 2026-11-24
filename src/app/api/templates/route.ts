import { NextResponse } from 'next/server'
import { api } from '@/lib/http'
import { TemplateInput } from '@/lib/report/template-input'
import { createTemplate, getTemplate, listTemplates } from '@/lib/repo/templates'

// FR-5: CRUD template laporan
export const GET = api(async (_req, { user }) => {
  return NextResponse.json({ templates: await listTemplates(user.id, user.locale) })
})

export const POST = api(async (req, { user }) => {
  const input = TemplateInput.parse(await req.json())
  const id = await createTemplate(user.id, input)
  return NextResponse.json({ template: await getTemplate(user.id, id) }, { status: 201 })
})
