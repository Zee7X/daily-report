import Link from 'next/link'
import { Coord, formatDate, StatusTag } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'
import { listReports } from '@/lib/repo/reports'
import { requireUser } from '@/lib/session'

export const metadata = { title: 'Riwayat' }

// FR-17: riwayat laporan — daftar, status, tautan hasil posting
export default async function HistoryPage() {
  const user = await requireUser()
  const { t, locale } = await getDict()
  const reports = await listReports(user.id)
  return (
    <div className="grid">
      <div className="blob low" aria-hidden />
      <section className="cell span-9 hero compact">
        <Coord c="A1" />
        <p className="label">{t.history.label}</p>
        <h1 className="display">{t.history.title}</h1>
        <p className="muted">{t.history.subtitle}</p>
      </section>
      <section className="cell span-3 center">
        <Coord c="A2" />
        <Link href="/reports/new" className="btn primary">
          {t.nav.new} ↗
        </Link>
      </section>
      <section className="cell span-12 flush">
        {reports.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{t.history.colTitle}</th>
                  <th scope="col">{t.history.colStatus}</th>
                  <th scope="col">{t.history.colTarget}</th>
                  <th scope="col">{t.history.colImages}</th>
                  <th scope="col">{t.history.colDate}</th>
                  <th scope="col">
                    <span className="sr-only">Link</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link className="title-link" href={`/reports/${r.id}`}>
                        {r.title}
                      </Link>
                    </td>
                    <td>
                      <StatusTag status={r.status} t={t} />
                    </td>
                    <td className="small">{r.target?.cardTitle ?? '—'}</td>
                    <td className="mono small">{r.imageCount}</td>
                    <td className="mono small">{formatDate(r.createdAt, locale, true)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {r.target?.postedUrl ? (
                        <a className="icon-btn" href={r.target.postedUrl} target="_blank" rel="noreferrer" aria-label={t.editor.openComment}>
                          ↗
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: 'var(--pad)' }}>
            <div className="empty skeleton" style={{ minHeight: 120 }}>
              {t.history.empty}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
