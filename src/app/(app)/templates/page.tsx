import { Coord } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'
import { listTemplates } from '@/lib/repo/templates'
import { requireUser } from '@/lib/session'
import { TemplatesEditor } from './editor'

export const metadata = { title: 'Template' }

export default async function TemplatesPage() {
  const user = await requireUser()
  const { t } = await getDict()
  const templates = await listTemplates(user.id)
  return (
    <div className="grid">
      <div className="blob low" aria-hidden />
      <section className="cell span-12 hero compact">
        <Coord c="A1" />
        <p className="label">{t.templates.label}</p>
        <h1 className="display">{t.templates.title}</h1>
        <p className="muted">{t.templates.subtitle}</p>
      </section>
      <TemplatesEditor initial={JSON.parse(JSON.stringify(templates))} />
    </div>
  )
}
