import { Coord } from '@/components/ui'
import { aiEnabled } from '@/lib/ai'
import { getDict } from '@/lib/i18n/server'
import { getConnection } from '@/lib/repo/connections'
import { listTemplates } from '@/lib/repo/templates'
import { requireUser } from '@/lib/session'
import { NewReportForm } from './form'

export const metadata = { title: 'Laporan baru' }

export default async function NewReportPage() {
  const user = await requireUser()
  const { t, locale } = await getDict()
  const [templates, conn] = await Promise.all([listTemplates(user.id), getConnection(user.id, 'basecamp')])
  const today = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'short' }).format(
    new Date(),
  )
  return (
    <div className="grid">
      <div className="blob" aria-hidden />
      <section className="cell span-12 hero compact">
        <Coord c="A1" />
        <p className="label">{t.newReport.label}</p>
        <h1 className="display">{t.newReport.title}</h1>
        <p className="muted">{t.newReport.subtitle}</p>
      </section>
      <NewReportForm
        templates={templates.map((tpl) => ({ id: tpl.id, name: tpl.name }))}
        connected={Boolean(conn)}
        aiOn={aiEnabled()}
        today={today}
      />
    </div>
  )
}
