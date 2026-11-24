'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CardPicker, type PickedCard } from '@/components/card-picker'
import { Coord } from '@/components/ui'
import { api } from '@/lib/client'
import { useI18n } from '@/lib/i18n/client'

type Props = { templates: { id: string; name: string }[]; connected: boolean; aiOn: boolean; today: string }

export function NewReportForm({ templates, connected, aiOn, today }: Props) {
  const { t } = useI18n()
  const router = useRouter()
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [title, setTitle] = useState(`${templates[0]?.name ?? 'Laporan'} — ${today}`)
  const [titleTouched, setTitleTouched] = useState(false)
  const [notes, setNotes] = useState('')
  const [sources, setSources] = useState<PickedCard[]>([])
  const [target, setTarget] = useState<PickedCard | null>(null)
  const [sameAsSource, setSameAsSource] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveTarget = sameAsSource ? (sources[0] ?? null) : target

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await api<{ id: string }>('/api/reports', {
        method: 'POST',
        json: {
          templateId,
          title,
          notes,
          sources: sources.map((s) => ({ provider: s.provider, cardId: s.cardId })),
          target: effectiveTarget ? { provider: effectiveTarget.provider, cardId: effectiveTarget.cardId } : null,
        },
      })
      router.push(`/reports/${r.id}`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'contents' }} aria-busy={busy}>
      <section className="cell span-4">
        <Coord c="B1" />
        <p className="label">{t.newReport.templateLabel}</p>
        <label className="field">
          <span>{t.newReport.template}</span>
          <select
            className="select"
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value)
              if (!titleTouched) {
                const name = templates.find((x) => x.id === e.target.value)?.name ?? ''
                setTitle(`${name} — ${today}`)
              }
            }}
            required
          >
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t.newReport.reportTitle}</span>
          <input
            className="input"
            value={title}
            placeholder={t.newReport.titlePlaceholder}
            onChange={(e) => {
              setTitle(e.target.value)
              setTitleTouched(true)
            }}
            required
            maxLength={255}
          />
        </label>
        <label className="field">
          <span>{t.newReport.notes}</span>
          <textarea
            className="textarea"
            rows={6}
            value={notes}
            placeholder={t.newReport.notesPlaceholder}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {!aiOn && <p className="small">{t.newReport.aiOff}</p>}
      </section>

      <section className="cell span-4">
        <Coord c="B2" />
        <p className="label">{t.newReport.sourcesLabel}</p>
        {connected ? (
          <>
            <p className="small">{t.newReport.sourcesHint}</p>
            <CardPicker
              onPick={(c) => setSources((prev) => (prev.some((p) => p.cardId === c.cardId) ? prev : [...prev, c]))}
            />
            <p className="label" style={{ marginTop: 8 }}>
              {t.picker.added} · {sources.length}
            </p>
            {sources.length ? (
              <ul className="list">
                {sources.map((s, i) => (
                  <li key={s.cardId}>
                    <span className="mono small">{String(i + 1).padStart(2, '0')}</span>
                    <span className="grow truncate">{s.title}</span>
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={() => setSources((prev) => prev.filter((p) => p.cardId !== s.cardId))}
                    >
                      {t.common.remove}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty skeleton">{t.picker.empty}</div>
            )}
          </>
        ) : (
          <>
            <p className="notice">{t.newReport.noConnection}</p>
            <a className="btn" href="/connect">
              {t.nav.connect} ↗
            </a>
          </>
        )}
      </section>

      <section className="cell span-4">
        <Coord c="B3" />
        <p className="label">{t.newReport.targetLabel}</p>
        {connected ? (
          <>
            <label className="check">
              <input type="checkbox" checked={sameAsSource} onChange={(e) => setSameAsSource(e.target.checked)} />
              {t.newReport.sameAsSource}
            </label>
            {!sameAsSource && <CardPicker onPick={(c) => setTarget(c)} />}
            {effectiveTarget ? (
              <div className="notice">
                <strong>{effectiveTarget.title}</strong>
                {effectiveTarget.url && (
                  <>
                    {' '}
                    <a href={effectiveTarget.url} target="_blank" rel="noreferrer" className="small">
                      ↗
                    </a>
                  </>
                )}
              </div>
            ) : (
              <div className="empty skeleton">{t.picker.empty}</div>
            )}
          </>
        ) : (
          <div className="empty skeleton">{t.picker.empty}</div>
        )}
      </section>

      <section className="cell span-12">
        <div className="row between">
          <div className="stack" style={{ flex: 1 }}>
            {busy && (
              <>
                <p className="small" role="status">
                  {t.newReport.drafting}
                </p>
                <div className="skeleton pulse" style={{ height: 10, maxWidth: 420 }} />
              </>
            )}
            {error && (
              <p className="notice bad" role="alert">
                {error}
              </p>
            )}
          </div>
          <button className="btn primary" type="submit" disabled={busy || !templateId || !title.trim()}>
            {t.newReport.submit} ↗
          </button>
        </div>
      </section>
    </form>
  )
}
