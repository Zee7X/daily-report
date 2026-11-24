import { Coord, formatDate } from '@/components/ui'
import { getConnector } from '@/lib/connectors'
import { env } from '@/lib/env'
import { getDict } from '@/lib/i18n/server'
import { getConnection } from '@/lib/repo/connections'
import { requireUser } from '@/lib/session'
import { BoardsList, DisconnectButton } from './client'

export const metadata = { title: 'Koneksi' }

export default async function ConnectPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser()
  const { t, locale } = await getDict()
  const sp = await searchParams
  const connector = getConnector('basecamp')
  const conn = await getConnection(user.id, 'basecamp')

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

      <section className="cell span-6" aria-labelledby="h-bc">
        <Coord c="B1" />
        <p className="label">Basecamp</p>
        <h2 className="title" id="h-bc">
          {conn ? conn.accountName : t.home.connectTitle}
        </h2>
        {conn ? (
          <>
            <dl className="kv">
              <dt>Email</dt>
              <dd>{conn.meta.email}</dd>
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
            <div className="row push">
              <a className="btn" href="/api/connectors/basecamp/authorize">
                {t.connect.connect}
              </a>
              <DisconnectButton provider="basecamp" />
            </div>
          </>
        ) : (
          <>
            <p className="muted">{connector.isConfigured() ? t.home.notConnected : t.home.notConfigured}</p>
            <div className="row push">
              <a
                className="btn primary"
                href="/api/connectors/basecamp/authorize"
                aria-disabled={!connector.isConfigured()}
                style={connector.isConfigured() ? undefined : { pointerEvents: 'none', opacity: 0.45 }}
              >
                {t.connect.connect}
              </a>
            </div>
          </>
        )}
      </section>

      <section className="cell span-6" aria-labelledby="h-setup">
        <Coord c="B2" />
        <p className="label">{t.connect.setupLabel}</p>
        <h2 className="subtitle" id="h-setup">
          {t.connect.setupTitle}
        </h2>
        <ol className="muted" style={{ paddingLeft: 18, margin: 0 }}>
          {t.connect.setupSteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <label className="field">
          <span>{t.connect.redirectUri}</span>
          <input className="input mono" readOnly value={env.basecamp.redirectUri} />
        </label>
      </section>

      {conn && (
        <section className="cell span-8" aria-labelledby="h-projects">
          <Coord c="C1" />
          <p className="label" id="h-projects">
            {t.connect.projects}
          </p>
          <BoardsList provider="basecamp" />
        </section>
      )}

      <section className={`cell ${conn ? 'span-4' : 'span-12'} tight`}>
        <Coord c="C2" />
        <p className="label">Connectors</p>
        <ul className="list">
          <li>
            <span className="grow">Basecamp</span>
            <span className={`tag ${conn ? 'ok' : 'dim'}`}>{conn ? 'on' : 'off'}</span>
          </li>
          {['Jira', 'Trello', 'ClickUp', 'Linear'].map((n) => (
            <li key={n}>
              <span className="grow small">{n}</span>
              <span className="tag dim">{t.connect.comingSoon}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
