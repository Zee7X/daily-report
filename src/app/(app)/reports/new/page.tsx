import { Coord } from '@/components/ui'
import { aiFor } from '@/lib/ai'
import { getDict } from '@/lib/i18n/server'
import { targetOptions } from '@/lib/report/targets'
import { listTemplates } from '@/lib/repo/templates'
import { requireUser } from '@/lib/session'
import { NewReportForm } from './form'

export const metadata = { title: 'Laporan baru' }

export default async function NewReportPage() {
  const user = await requireUser()
  const { t, locale } = await getDict()
  const [templates, options, ai] = await Promise.all([listTemplates(user.id), targetOptions(user), aiFor(user.id)])
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
        providers={options.providers}
        destinations={options.destinations}
        aiOn={Boolean(ai)}
        today={today}
      />
    </div>
  )
}
