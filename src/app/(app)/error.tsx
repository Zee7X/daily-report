'use client'

import { useI18n } from '@/lib/i18n/client'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n()
  // Error produksi dari Server Component hanya berisi digest/pesan React yang dipotong; jangan tampilkan mentah.
  const hidden = Boolean(error.digest) || error.message.startsWith('Minified React error')
  return (
    <div className="grid">
      <section className="cell span-12 hero">
        <p className="label">{t.common.error}</p>
        <h1 className="title" style={{ maxWidth: '40ch' }}>
          {hidden ? t.errors.waking : error.message || t.common.error}
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
