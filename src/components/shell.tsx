import Image from 'next/image'
import Link from 'next/link'
import { env } from '@/lib/env'
import { getDict } from '@/lib/i18n/server'
import { currentUser } from '@/lib/session'
import { FooterLang, Nav } from './nav'

export async function Shell({ children }: { children: React.ReactNode }) {
  const { t } = await getDict()
  const user = await currentUser().catch(() => null)
  const year = new Date().getFullYear()
  return (
    <div className="page">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="frame">
        <span className="corner-b" aria-hidden />
        <header className="topbar">
          <Link href="/" className="brand" aria-label={t.brand}>
            <Image src="/logo.png" alt="" width={26} height={26} priority />
            <span>{t.brand}</span>
            <small>{t.tagline}</small>
          </Link>
          {user && (
            <Nav
              items={[
                { href: '/', label: t.nav.home },
                { href: '/reports/new', label: t.nav.new },
                { href: '/reports', label: t.nav.history },
                { href: '/templates', label: t.nav.templates },
                { href: '/connect', label: t.nav.connect },
              ]}
            />
          )}
          <div className="meta">
            <span>{env.isCloud ? t.footer.modeCloud : t.footer.modeLocal}</span>
            {user && !env.singleUser && (
              <form action="/api/auth/logout" method="post">
                <button className="btn sm ghost" type="submit">
                  {t.nav.logout}
                </button>
              </form>
            )}
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="footbar">
          <div>
            © {year} {t.brand}. {t.footer.rights}
          </div>
          <div>
            <span className="mono small">
              {env.isCloud ? t.footer.modeCloud : t.footer.modeLocal}
              {env.singleUser ? ` · ${t.footer.singleUser}` : ''}
            </span>
          </div>
          <div>
            {user && <span className="small truncate">{user.name || user.email}</span>}
          </div>
          <div>
            <FooterLang label={t.footer.language} />
            <a href="https://github.com/Zee7X/daily-report" target="_blank" rel="noreferrer">
              {t.footer.source}
            </a>
          </div>
        </footer>
      </div>
    </div>
  )
}
