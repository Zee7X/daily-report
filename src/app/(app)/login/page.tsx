import Image from 'next/image'
import { redirect } from 'next/navigation'
import { Coord } from '@/components/ui'
import { onAuthHost, safeNext } from '@/lib/auth'
import { listConnectors } from '@/lib/connectors'
import { env } from '@/lib/env'
import { fmt } from '@/lib/i18n/dict'
import { getDict } from '@/lib/i18n/server'
import { currentUser } from '@/lib/session'
import { LoginForm } from './form'

export async function generateMetadata() {
  return { title: (await getDict()).t.titles.login }
}

// FR-1: login email + password atau connector yang mendukung login ("Login with Basecamp").
// Bila AUTH_URL diisi, halaman ini hanya tampil di domain login (proxy mengarahkan /login ke sana).
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams
  const next = safeNext(sp.next)
  const authHost = await onAuthHost()
  if (authHost) {
    // Domain login tidak menyimpan sesi. Tanpa nonce (dibuka langsung, bukan dari aplikasi),
    // kembali dulu ke APP_URL/login agar browser ini mendapat cookie nonce.
    if (!sp.n) redirect(`${env.appUrl}/login?next=${encodeURIComponent(next)}${sp.error ? `&error=${encodeURIComponent(sp.error)}` : ''}`)
  } else if (await currentUser()) {
    redirect(next)
  }
  const { t } = await getDict()
  const providers = listConnectors().filter((c) => c.supportsLogin && c.isConfigured())
  const error = sp.error ? (t.login.errors[sp.error] ?? sp.error) : null

  return (
    <div className="grid">
      <div className="blob low" aria-hidden />
      <section className="cell span-4 hero logo-cell" aria-hidden>
        <Coord c="A1" />
        <Image src="/logo.png" alt="" width={56} height={56} priority />
      </section>
      <section className="cell span-8 hero" style={{ minHeight: 220 }}>
        <Coord c="A2" />
        <p className="label">{t.login.label}</p>
        <h1 className="display" style={{ maxWidth: '16ch' }}>
          {t.login.title}
        </h1>
        <p className="muted">{t.login.text}</p>
      </section>

      <section className="cell span-6">
        <Coord c="B1" />
        {error && (
          <p className="notice bad" role="alert">
            {error}
          </p>
        )}
        <LoginForm next={next} nonce={sp.n ?? ''} restricted={env.signupAllowed.length > 0 && !env.signupAllowed.includes('*')} />
      </section>

      <section className="cell span-6">
        <Coord c="B2" />
        <p className="label">{t.login.or}</p>
        {providers.length ? (
          <div className="stack">
            {providers.map((c) => (
              <a
                key={c.id}
                className="btn"
                href={`${env.appUrl}/api/connectors/${c.id}/authorize?intent=login&next=${encodeURIComponent(next)}`}
              >
                {fmt(t.login.button, { tool: c.label })} ↗
              </a>
            ))}
          </div>
        ) : (
          <p className="small">{t.login.notConfigured}</p>
        )}
      </section>
    </div>
  )
}
