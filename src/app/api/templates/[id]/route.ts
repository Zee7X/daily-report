import { NextResponse } from 'next/server'
import { api, HttpError } from '@/lib/http'
import { TemplateInput } from '@/lib/report/template-input'
import { deleteTemplate, getTemplate, updateTemplate } from '@/lib/repo/templates'

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = api<Ctx>(async (req, { params, user }) => {
  const { id } = await params
  const ok = await updateTemplate(user.id, id, TemplateInput.parse(await req.json()))
  if (!ok) throw new HttpError(404, 'template_not_found')
  return NextResponse.json({ template: await getTemplate(user.id, id) })
})

export const DELETE = api<Ctx>(async (_req, { params, user }) => {
  const { id } = await params
  if (!(await deleteTemplate(user.id, id))) throw new HttpError(404, 'template_not_found')
  return NextResponse.json({ ok: true })
})
