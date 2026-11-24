import type { Dict } from '@/lib/i18n/dict'

export function Coord({ c }: { c: string }) {
  return (
    <span className="coord" aria-hidden>
      {c}
    </span>
  )
}

export function StatusTag({ status, t }: { status: string; t: Dict }) {
  const cls =
    status === 'posted' || status === 'done'
      ? 'ok'
      : status === 'failed'
        ? 'bad'
        : status === 'running' || status === 'queued'
          ? 'warn'
          : 'dim'
  const label = (t.status as Record<string, string>)[status] ?? status
  return <span className={`tag ${cls}`}>{label}</span>
}

export function formatDate(d: Date | string, locale: 'id' | 'en', withTime = false) {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'id-ID', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(new Date(d))
}
