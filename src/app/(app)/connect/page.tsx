import { Coord, formatDate } from '@/components/ui'
import { listConnectors } from '@/lib/connectors'
import { env } from '@/lib/env'
import { fmt } from '@/lib/i18n/dict'
import { getDict } from '@/lib/i18n/server'
import { getConnection } from '@/lib/repo/connections'
import { listDestinations, toPublic } from '@/lib/repo/destinations'
import { requireUser } from '@/lib/session'
import { BoardsList, DisconnectButton, WebhooksManager } from './client'

export const metadata = { title: 'Koneksi' }

const PLANNED = ['Jira', 'Trello', 'ClickUp', 'Linear', 'GitHub']

export default async function ConnectPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser()
  const { t, locale } = await getDict()
  const sp = await searchParams
  const connectors = await Promise.all(
    listConnectors().map(async (c) => ({ connector: c, conn: await getConnection(user.id, c.id) })),
  )
  const destinations = (await listDestinations(user.id)).map(toPublic)

  return (
    <div className="grid">
      <div className="blob low" aria-hidden />
      <section className="cell span-12 hero compact">
        <Coord c="A1" />
        <p className="label">{t.connect.label}</p>
        <h1 className="display">{t.connect.title}</h1>
        <p className="muted">{t.connect.subtitle}</p>
      </section>

      {(sp.connected || sp.error) && (
        <section className="cell span-12 tight">
          {sp.connected && <p className="notice ok">{t.connect.connected}</p>}
          {sp.error && (
            <p className="notice bad" role="alert">
              {t.connect.error}: {sp.error}
            </p>
          )}
        </section>
      )}

      {connectors.map(({ connector, conn }, i) => (
        <section key={connector.id} className="cell span-6" aria-labelledby={`h-${connector.id}`}>
          <Coord c={`B${i + 1}`} />
          <p className="label">{connector.label}</p>
          <h2 className="title" id={`h-${connector.id}`}>
            {conn ? conn.accountName : fmt(t.connect.connect, { tool: connector.label })}
          </h2>
          {conn ? (
            <>
              <dl className="kv">
                {conn.meta.email && (
                  <>
                    <dt>Email</dt>
                    <dd>{conn.meta.email}</dd>
                  </>
                )}
                <dt>{t.connect.accounts}</dt>
                <dd>{(conn.meta.accounts ?? []).map((a) => a.name).join(', ')}</dd>
                {conn.expiresAt && (
                  <>
                    <dt>Token</dt>
                    <dd className="small">
                      {t.connect.tokenExpires}: {formatDate(conn.expiresAt, locale, true)}
                    </dd>
                  </>
                )}
              </dl>
              <details>
                <summary className="label" style={{ cursor: 'pointer' }}>
                  {t.connect.projects}
                </summary>
                <div style={{ marginTop: 8 }}>
                  <BoardsList provider={connector.id} />
                </div>
              </details>
              <div className="row push">
                <a className="btn" href={`/api/connectors/${connector.id}/authorize`}>
                  {fmt(t.connect.connect, { tool: connector.label })}
                </a>
                <DisconnectButton provider={connector.id} label={connector.label} />
              </div>
            </>
          ) : connector.isConfigured() ? (
            <>
              <p className="muted">{t.home.notConnected}</p>
              <div className="row push">
                <a className="btn primary" href={`/api/connectors/${connector.id}/authorize`}>
                  {fmt(t.connect.connect, { tool: connector.label })}
                </a>
              </div>
            </>
          ) : (
            <>
              <p className="muted">{t.home.notConfigured}</p>
              <p className="label">{t.connect.setupTitle}</p>
              <ol className="muted" style={{ paddingLeft: 18, margin: 0 }}>
                {t.connect.setupSteps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <label className="field">
                <span>{t.connect.redirectUri}</span>
                <input className="input mono" readOnly value={connector.redirectUri()} />
              </label>
            </>
          )}
        </section>
      ))}

      <section className="cell span-6 tight">
        <Coord c="B9" />
        <p className="label">Connectors</p>
        <ul className="list">
          {connectors.map(({ connector, conn }) => (
            <li key={connector.id}>
              <span className="grow">{connector.label}</span>
              <span className={`tag ${conn ? 'ok' : 'dim'}`}>{conn ? 'on' : 'off'}</span>
            </li>
          ))}
          {PLANNED.map((n) => (
            <li key={n}>
              <span className="grow small">{n}</span>
              <span className="tag dim">{t.connect.comingSoon}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="cell span-12" aria-labelledby="h-webhooks">
        <Coord c="C1" />
        <p className="label">{t.connect.webhooksLabel}</p>
        <h2 className="title" id="h-webhooks">
          {t.connect.webhooksTitle}
        </h2>
        <p className="muted">{t.connect.webhooksText}</p>
        <WebhooksManager initial={destinations} cloud={env.isCloud} />
      </section>
    </div>
  )
}
