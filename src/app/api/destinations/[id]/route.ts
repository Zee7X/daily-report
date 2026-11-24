import { NextResponse } from 'next/server'
import { api, HttpError } from '@/lib/http'
import { deleteDestination } from '@/lib/repo/destinations'

export const DELETE = api<{ params: Promise<{ id: string }> }>(async (_req, { params, user }) => {
  const { id } = await params
  if (!(await deleteDestination(user.id, id))) throw new HttpError(404, 'destination_not_found')
  return NextResponse.json({ ok: true })
})
