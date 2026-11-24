import { api } from '@/lib/http'
import { buildPrintHtml } from '@/lib/report/service'

// GET /print/:id — tampilan cetak (cadangan bila worker PDF tidak aktif: Print → Save as PDF).
export const GET = api<{ params: Promise<{ id: string }> }>(async (req, { params, user }) => {
  const { id } = await params
  const { html } = await buildPrintHtml(user, id)
  const auto = req.nextUrl.searchParams.get('print') !== '0'
  const script = auto ? '<script>addEventListener("load",()=>setTimeout(()=>print(),300))</script>' : ''
  return new Response(html.replace('</body>', `${script}</body>`), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store' },
  })
})
