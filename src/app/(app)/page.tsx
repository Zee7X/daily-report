import Image from 'next/image'
import Link from 'next/link'
import { Coord, formatDate, StatusTag } from '@/components/ui'
import { health } from '@/lib/health'
import { fmt } from '@/lib/i18n/dict'
import { getDict } from '@/lib/i18n/server'
import { targetOptions } from '@/lib/report/targets'
import { listReports } from '@/lib/repo/reports'
import { listTemplates } from '@/lib/repo/templates'
import { requireUser } from '@/lib/session'

export default async function Home() {
  const user = await requireUser()
  const { t, locale } = await getDict()
  const [h, options, reports, templates] = await Promise.all([
    health(),
    targetOptions(user),
    listReports(user.id, 4),
    listTemplates(user.id),
  ])
  const connected = options.providers.filter((p) => p.connected)
  const connectable = options.providers.filter((p) => p.configured && !p.connected)
  const configuredConnectors = h.connectors.filter((c) => c.configured)
  const c = t.home.checks

  const checks: { label: string; value: string; tone: 'ok' | 'warn' | 'bad' | 'dim' | 'ink' }[] = [
    { label: c.database, value: h.database ? c.ok : c.unreachable, tone: h.database ? 'ok' : 'bad' },
    { label: c.key, value: h.encryptionKey ? c.ok : c.missing, tone: h.encryptionKey ? 'ok' : 'bad' },
    {
      label: c.basecamp,
      value: configuredConnectors.length ? configuredConnectors.map((x) => x.label).join(', ') : c.missing,
      tone: configuredConnectors.length ? 'ok' : 'dim',
    },
    { label: c.ai, value: h.ai === 'on' ? h.aiProvider : c.fallback, tone: h.ai === 'on' ? 'ok' : 'dim' },
    {
      label: c.worker,
      value: h.worker === 'ok' ? c.ok : h.worker === 'off' ? c.off : c.unreachable,
      tone: h.worker === 'ok' ? 'ok' : h.worker === 'off' ? 'dim' : 'warn',
    },
    { label: c.storage, value: h.storage, tone: 'ink' },
    { label: c.queue, value: h.queue, tone: 'ink' },
  ]

  return (
    <div className="grid">
      <div className="blob" aria-hidden />

      <section className="cell span-3 logo-cell hero" aria-hidden>
        <Coord c="A1" />
        <Image src="/logo.png" alt="" width={56} height={56} priority />
      </section>
      <section className="cell span-9 hero">
        <Coord c="A2" />
        <h1 className="display">{t.home.title}</h1>
        <p className="muted">{t.home.subtitle}</p>
      </section>

      <section className="cell span-4" aria-labelledby="h-connect">
        <Coord c="B1" />
        <p className="label">{t.home.connectLabel}</p>
        <h2 className="title" id="h-connect">
          {t.home.connectTitle}
        </h2>
        {connected.length || options.destinations.length ? (
          <ul className="list">
            {connected.map((p) => (
              <li key={p.id}>
                <span className="grow">{p.label}</span>
                <span className="tag ok">{t.home.connectedTo}</span>
              </li>
            ))}
            {options.destinations.map((d) => (
              <li key={d.id}>
                <span className="grow truncate">{d.name}</span>
                <span className="tag ink">{d.kind}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t.home.noKanban}</p>
        )}
        <div className="row push">
          {connectable.map((p) => (
            <a key={p.id} className="btn primary" href={`/api/connectors/${p.id}/authorize`}>
              {fmt(t.connect.connect, { tool: p.label })}
            </a>
          ))}
          <Link className="btn" href="/connect">
            + {t.connect.webhooksLabel}
          </Link>
        </div>
        <Link href="/connect" className="arrow" aria-label={t.nav.connect}>
          ↗
        </Link>
      </section>

      <section className="cell span-4" aria-labelledby="h-compose">
        <Coord c="B2" />
        <p className="label">{t.home.composeLabel}</p>
        <h2 className="title" id="h-compose">
          {t.home.composeTitle}
        </h2>
        <p className="muted">{t.home.composeText}</p>
        <div className="row push">
          <Link className="btn primary" href="/reports/new">
            {t.nav.new}
          </Link>
        </div>
        <Link href="/reports/new" className="arrow" aria-label={t.nav.new}>
          ↗
        </Link>
      </section>

      <section className="cell span-4" aria-labelledby="h-history">
        <Coord c="B3" />
        <p className="label">{t.home.historyLabel}</p>
        <h2 className="title" id="h-history">
          {t.home.historyTitle}
        </h2>
        {reports.length ? (
          <ul className="list">
            {reports.map((r) => (
              <li key={r.id}>
                <Link href={`/reports/${r.id}`} className="grow truncate">
                  {r.title}
                </Link>
                <span className="small mono">{formatDate(r.createdAt, locale)}</span>
                <StatusTag status={r.status} t={t} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty skeleton" style={{ minHeight: 72 }}>
            {t.home.historyEmpty}
          </div>
        )}
        <Link href="/reports" className="arrow push" aria-label={t.nav.history}>
          ↗
        </Link>
      </section>

      <section className="cell span-4 tight">
        <Coord c="C1" />
        <p className="label">{t.home.templatesLabel}</p>
        <ul className="list">
          {templates.map((tpl) => (
            <li key={tpl.id}>
              <span className="grow truncate">{tpl.name}</span>
              <span className="small mono">{tpl.sections.length}§</span>
            </li>
          ))}
        </ul>
        <Link href="/templates" className="small push">
          {t.nav.templates} →
        </Link>
      </section>

      <section className="cell span-5 tight">
        <Coord c="C2" />
        <p className="label">{t.home.systemLabel}</p>
        <dl className="kv">
          {checks.map((k) => (
            <div key={k.label} style={{ display: 'contents' }}>
              <dt>{k.label}</dt>
              <dd>
                <span className={`tag ${k.tone}`}>{k.value}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="cell span-3 tight">
        <Coord c="C3" />
        <p className="label">{t.home.exportLabel}</p>
        <p className="subtitle">{t.home.exportTitle}</p>
        <p className="muted">{t.home.exportText}</p>
        <div className="row push" aria-hidden>
          <span className="icon-btn">PDF</span>
          <span className="icon-btn">&lt;/&gt;</span>
          <span className="icon-btn">MD</span>
          <span className="icon-btn">WA</span>
          <span className="icon-btn">SL</span>
          <span className="icon-btn">TM</span>
        </div>
      </section>
    </div>
  )
}
