'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CardPicker, type PickedCard } from '@/components/card-picker'
import { TargetChooser, type ProviderOption, type TargetValue } from '@/components/target-chooser'
import { Coord } from '@/components/ui'
import { api } from '@/lib/client'
import { useI18n } from '@/lib/i18n/client'
import type { PublicDestination } from '@/lib/repo/destinations'

type Props = {
  templates: { id: string; name: string }[]
  providers: ProviderOption[]
  destinations: PublicDestination[]
  aiOn: boolean
  today: string
}

export function NewReportForm({ templates, providers, destinations, aiOn, today }: Props) {
  const { t } = useI18n()
  const router = useRouter()
  const connected = providers.filter((p) => p.connected)
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [title, setTitle] = useState(`${templates[0]?.name ?? t.newReport.fallbackTitle} — ${today}`)
  const [titleTouched, setTitleTouched] = useState(false)
  const [sourceMode, setSourceMode] = useState<'cards' | 'write'>(connected.length ? 'cards' : 'write')
  const [provider, setProvider] = useState(connected[0]?.id ?? '')
  const [notes, setNotes] = useState('')
  const [sources, setSources] = useState<PickedCard[]>([])
  const [target, setTarget] = useState<TargetValue>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeSources = sourceMode === 'cards' ? sources : []
  const canSubmit = Boolean(templateId && title.trim() && (activeSources.length || notes.trim()))

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
          sources: activeSources.map((s) => ({ provider: s.provider, cardId: s.cardId })),
          target: target ? { provider: target.provider, cardId: target.cardId } : null,
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
        {!aiOn && <p className="small">{t.newReport.aiOff}</p>}
      </section>

      <section className="cell span-4">
        <Coord c="B2" />
        <p className="label">{t.newReport.sourcesLabel}</p>
        <div className="seg" role="group" aria-label={t.newReport.sourcesLabel}>
          <button type="button" aria-pressed={sourceMode === 'cards'} disabled={!connected.length} onClick={() => setSourceMode('cards')}>
            {t.newReport.sourceCards}
          </button>
          <button type="button" aria-pressed={sourceMode === 'write'} onClick={() => setSourceMode('write')}>
            {t.newReport.sourceWrite}
          </button>
        </div>

        {sourceMode === 'cards' ? (
          <>
            <p className="small">{t.newReport.sourcesHint}</p>
            {connected.length > 1 && (
              <label className="field">
                <span>{t.newReport.provider}</span>
                <select className="select" value={provider} onChange={(e) => setProvider(e.target.value)}>
                  {connected.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <CardPicker
              key={provider}
              provider={provider}
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
            <label className="field">
              <span>{t.newReport.notes}</span>
              <textarea
                className="textarea"
                rows={3}
                value={notes}
                placeholder={t.newReport.notesPlaceholder}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            {!connected.length && <p className="small">{t.newReport.noConnection}</p>}
            <label className="field">
              <span>{t.newReport.material}</span>
              <textarea
                className="textarea"
                rows={11}
                value={notes}
                placeholder={t.newReport.materialPlaceholder}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </>
        )}
      </section>

      <section className="cell span-4">
        <Coord c="B3" />
        <p className="label">{t.newReport.targetLabel}</p>
        <TargetChooser
          providers={providers}
          destinations={destinations}
          sourceCard={sourceMode === 'cards' ? (sources[0] ?? null) : undefined}
          onChange={setTarget}
        />
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
          <button className="btn primary" type="submit" disabled={busy || !canSubmit}>
            {t.newReport.submit} ↗
          </button>
        </div>
      </section>
    </form>
  )
}
