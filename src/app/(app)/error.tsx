'use client'

import { useI18n } from '@/lib/i18n/client'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n()
  return (
    <div className="grid">
      <section className="cell span-12 hero">
        <p className="label">{t.common.error}</p>
        <h1 className="title" style={{ maxWidth: '40ch' }}>
          {error.message || t.common.error}
        </h1>
        <p className="muted">
          {t.errors.setupHint} <code>npm run db:migrate</code>
        </p>
        <div className="row">
          <button className="btn" onClick={reset}>
            {t.common.retry}
          </button>
        </div>
      </section>
    </div>
  )
}
