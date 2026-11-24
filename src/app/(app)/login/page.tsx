import Image from 'next/image'
import { redirect } from 'next/navigation'
import { Coord } from '@/components/ui'
import { listConnectors } from '@/lib/connectors'
import { fmt } from '@/lib/i18n/dict'
import { getDict } from '@/lib/i18n/server'
import { currentUser } from '@/lib/session'

export const metadata = { title: 'Login' }

// FR-1: login aplikasi (mode cloud) lewat connector yang mendukung login, mis. "Login with Basecamp".
export default async function LoginPage() {
  if (await currentUser()) redirect('/')
  const { t } = await getDict()
  const providers = listConnectors().filter((c) => c.supportsLogin && c.isConfigured())
  return (
    <div className="grid">
      <div className="blob low" aria-hidden />
      <section className="cell span-4 hero logo-cell" aria-hidden>
        <Coord c="A1" />
        <Image src="/logo.png" alt="" width={56} height={56} priority />
      </section>
      <section className="cell span-8 hero" style={{ minHeight: 320 }}>
        <Coord c="A2" />
        <p className="label">{t.login.label}</p>
        <h1 className="display" style={{ maxWidth: '14ch' }}>
          {t.login.title}
        </h1>
        <p className="muted">{t.login.text}</p>
        <div className="row">
          {providers.length ? (
            providers.map((c) => (
              <a key={c.id} className="btn primary" href={`/api/connectors/${c.id}/authorize?intent=login`}>
                {fmt(t.login.button, { tool: c.label })} ↗
              </a>
            ))
          ) : (
            <p className="notice">{t.login.notConfigured}</p>
          )}
        </div>
      </section>
    </div>
  )
}
