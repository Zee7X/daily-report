import Image from 'next/image'
import { redirect } from 'next/navigation'
import { Coord } from '@/components/ui'
import { handoffUrl, onAuthHost, safeNext } from '@/lib/auth'
import { listConnectors } from '@/lib/connectors'
import { env } from '@/lib/env'
import { fmt } from '@/lib/i18n/dict'
import { getDict } from '@/lib/i18n/server'
import { currentUser } from '@/lib/session'
import { LoginForm } from './form'

export const metadata = { title: 'Login' }

// FR-1: login email + password atau connector yang mendukung login ("Login with Basecamp").
// Bila AUTH_URL diisi, halaman ini hanya tampil di domain login (proxy mengarahkan /login ke sana).
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams
  const next = safeNext(sp.next)
  const user = await currentUser()
  if (user) {
    if (await onAuthHost()) redirect(await handoffUrl(user.id, env.appUrl, next))
    redirect(next)
  }
  const { t } = await getDict()
  const providers = listConnectors().filter((c) => c.supportsLogin && c.isConfigured())
  const error = sp.error ? (t.login.errors[sp.error] ?? sp.error) : null
  const host = (u: string) => new URL(u).host

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
        <LoginForm next={next} restricted={env.signupAllowed.length > 0} />
      </section>

      <section className="cell span-6">
        <Coord c="B2" />
        <p className="label">{t.login.or}</p>
        {providers.length ? (
          <div className="stack">
            {providers.map((c) => (
              <a key={c.id} className="btn" href={`/api/connectors/${c.id}/authorize?intent=login`}>
                {fmt(t.login.button, { tool: c.label })} ↗
              </a>
            ))}
          </div>
        ) : (
          <p className="small">{t.login.notConfigured}</p>
        )}
        {env.splitAuth && (
          <p className="small push">{fmt(t.login.via, { auth: host(env.authUrl), app: host(env.appUrl) })}</p>
        )}
      </section>
    </div>
  )
}
