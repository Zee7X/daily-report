import { notFound } from 'next/navigation'
import { browserEnabled } from '@/lib/browser'
import { env } from '@/lib/env'
import { HttpError } from '@/lib/http'
import { getDict } from '@/lib/i18n/server'
import { loadReportView } from '@/lib/report/service'
import { targetOptions } from '@/lib/report/targets'
import { getTemplate } from '@/lib/repo/templates'
import { requireUser } from '@/lib/session'
import { Editor, type EditorData } from './editor'

export async function generateMetadata() {
  return { title: (await getDict()).t.titles.draft }
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const view = await loadReportView(user, id).catch((e) => {
    if (e instanceof HttpError && e.status === 404) notFound()
    throw e
  })
  const [template, options] = await Promise.all([
    view.report.templateId ? getTemplate(user.id, view.report.templateId) : null,
    targetOptions(user),
  ])
  const data: EditorData = JSON.parse(
    JSON.stringify({
      report: {
        id: view.report.id,
        title: view.report.title,
        body: view.report.body,
        status: view.report.status,
        createdAt: view.report.createdAt,
        updatedAt: view.report.updatedAt,
      },
      templateName: template?.name ?? null,
      sources: view.sources,
      target: view.target,
      targetInfo: view.targetInfo,
      images: view.images,
      jobs: view.jobs,
      providers: options.providers,
      destinations: options.destinations,
      browser: browserEnabled(),
      cloud: env.isCloud,
    }),
  )
  return <Editor initial={data} />
}
