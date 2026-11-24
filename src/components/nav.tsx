'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/lib/i18n/client'

export function Nav({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname()
  const active = (href: string) =>
    href === '/' ? path === '/' : href === '/reports' ? path === '/reports' || /^\/reports\/(?!new)/.test(path) : path.startsWith(href)
  return (
    <nav className="nav" aria-label="Main">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={active(i.href) ? 'page' : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  )
}

export function FooterLang({ label }: { label: string }) {
  const { locale } = useI18n()
  const path = usePathname()
  const next = encodeURIComponent(path)
  return (
    <span className="lang row" aria-label={label}>
      <a href={`/api/locale?l=id&next=${next}`} aria-current={locale === 'id'} lang="id">
        ID
      </a>
      <span aria-hidden>/</span>
      <a href={`/api/locale?l=en&next=${next}`} aria-current={locale === 'en'} lang="en">
        EN
      </a>
    </span>
  )
}
