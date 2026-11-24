import { api } from '@/lib/http'
import { renderPdf } from '@/lib/browser'
import { buildPrintHtml } from '@/lib/report/service'

export const maxDuration = 90

// GET /api/reports/:id/pdf — ekspor PDF lewat worker Playwright (US-6)
export const GET = api<{ params: Promise<{ id: string }> }>(async (_req, { params, user }) => {
  const { id } = await params
  const { report, html } = await buildPrintHtml(user, id)
  const pdf = await renderPdf(html)
  const name = report.title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().replace(/\s+/g, '-') || 'laporan'
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}.pdf"; filename*=UTF-8''${encodeURIComponent(name)}.pdf`,
      'cache-control': 'private, no-store',
    },
  })
})
