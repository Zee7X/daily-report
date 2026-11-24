import Image from 'next/image'
import { redirect } from 'next/navigation'
import { Coord } from '@/components/ui'
import { getConnector } from '@/lib/connectors'
import { getDict } from '@/lib/i18n/server'
import { currentUser } from '@/lib/session'

export const metadata = { title: 'Login' }

// FR-1: login aplikasi (mode cloud) lewat "Login with Basecamp".
export default async function LoginPage() {
  if (await currentUser()) redirect('/')
  const { t } = await getDict()
  const configured = getConnector('basecamp').isConfigured()
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
          {configured ? (
            <a className="btn primary" href="/api/connectors/basecamp/authorize?intent=login">
              {t.login.button} ↗
            </a>
          ) : (
            <p className="notice">{t.login.notConfigured}</p>
          )}
        </div>
      </section>
    </div>
  )
}
