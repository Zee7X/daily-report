'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { CardPicker, NO_NAV, type PickedCard, type PickerNav } from '@/components/card-picker'
import { Select } from '@/components/select'
import { TargetChooser, type ProviderOption, type TargetDraft, type TargetValue } from '@/components/target-chooser'
import { Coord } from '@/components/ui'
import { api } from '@/lib/client'
import { useI18n } from '@/lib/i18n/client'
import type { PublicDestination } from '@/lib/repo/destinations'
import { clearDraft, readDraft, readLastBoard, writeDraft, writeLastBoard } from '@/lib/new-report-draft'

type Props = {
  userId: string
  templates: { id: string; name: string }[]
  providers: ProviderOption[]
  destinations: PublicDestination[]
  aiOn: boolean
  today: string
}

export function NewReportForm({ userId, templates, providers, destinations, aiOn, today }: Props) {
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
  // Pickers mount only after the saved draft is read, so they load once with the right board and column.
  const [hydrated, setHydrated] = useState(false)
  const [restored, setRestored] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const [sourceNav, setSourceNav] = useState<PickerNav>(NO_NAV)
  const [targetInit, setTargetInit] = useState<TargetDraft | undefined>()
  const [targetDraft, setTargetDraft] = useState<TargetDraft | null>(null)
  const sent = useRef(false)

  const defaultTitle = (id: string) => `${templates.find((x) => x.id === id)?.name ?? t.newReport.fallbackTitle} — ${today}`
  const defaultProvider = connected[0]?.id ?? ''

  useEffect(() => {
    const d = readDraft(userId)
    if (d && templates.some((x) => x.id === d.templateId) && (!d.provider || connected.some((p) => p.id === d.provider))) {
      const p = d.provider || defaultProvider
      setTemplateId(d.templateId)
      setTitle(d.title)
      setTitleTouched(d.titleTouched)
      setSourceMode(d.sourceMode === 'cards' && !connected.length ? 'write' : d.sourceMode)
      setProvider(p)
      setSources(d.sources)
      setNotes(d.notes)
      setSourceNav(d.sourceNav)
      setTargetInit(d.target)
      setRestored(true)
    } else {
      if (d) clearDraft(userId)
      setSourceNav(readLastBoard(userId, defaultProvider))
    }
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dirty = titleTouched || sources.length > 0 || notes.trim() !== '' || templateId !== templates[0]?.id
  useEffect(() => {
    if (!hydrated || sent.current) return
    if (!dirty) return clearDraft(userId)
    if (!targetDraft) return
    const timer = setTimeout(
      () => writeDraft(userId, { templateId, title, titleTouched, sourceMode, provider, sources, notes, sourceNav, target: targetDraft }),
      300,
    )
    return () => clearTimeout(timer)
  }, [userId, hydrated, dirty, templateId, title, titleTouched, sourceMode, provider, sources, notes, sourceNav, targetDraft])

  const startOver = () => {
    clearDraft(userId)
    setTemplateId(templates[0]?.id ?? '')
    setTitle(defaultTitle(templates[0]?.id ?? ''))
    setTitleTouched(false)
    setSourceMode(connected.length ? 'cards' : 'write')
    setProvider(defaultProvider)
    setSources([])
    setNotes('')
    setSourceNav(readLastBoard(userId, defaultProvider))
    setTargetInit(undefined)
    setTargetDraft(null)
    setRestored(false)
    setError(null)
    setResetKey((k) => k + 1)
  }

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
      sent.current = true
      clearDraft(userId)
      if (sourceMode === 'cards' && sources.length && sourceNav.board) writeLastBoard(userId, provider, sourceNav)
      router.push(`/reports/${r.id}`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'contents' }} aria-busy={busy}>
      {restored && (
        <section className="cell span-12">
          <p className="notice" role="status">
            {t.newReport.restored} ·{' '}
            <button type="button" className="btn sm ghost" onClick={startOver}>
              {t.newReport.startOver}
            </button>
          </p>
        </section>
      )}
      <section className="cell span-4">
        <Coord c="B1" />
        <p className="label">{t.newReport.templateLabel}</p>
        <label className="field">
          <span>{t.newReport.template}</span>
          <Select
            value={templateId}
            onChange={(v) => {
              setTemplateId(v)
              if (!titleTouched) {
                setTitle(defaultTitle(v))
              }
            }}
            options={templates.map((tpl) => ({ value: tpl.id, label: tpl.name }))}
            required
          />
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

        {/* Both panels stay mounted and hidden so switching tabs keeps the picker's board, column and card lists. */}
        <div style={{ display: 'contents' }} hidden={sourceMode !== 'cards'}>
          <p className="small">{t.newReport.sourcesHint}</p>
          {connected.length > 1 && (
            <label className="field">
              <span>{t.newReport.provider}</span>
              <Select
                value={provider}
                onChange={(p) => {
                  setProvider(p)
                  setSourceNav(readLastBoard(userId, p))
                }}
                options={connected.map((p) => ({ value: p.id, label: p.label }))}
              />
            </label>
          )}
          {hydrated && (
            <CardPicker
              key={`${provider}:${resetKey}`}
              provider={provider}
              active={sourceMode === 'cards'}
              initial={sourceNav}
              onNav={setSourceNav}
              onPick={(c) => setSources((prev) => (prev.some((p) => p.cardId === c.cardId) ? prev : [...prev, c]))}
              selectedIds={sources.map((s) => s.cardId)}
              onUnpick={(id) => setSources((prev) => prev.filter((p) => p.cardId !== id))}
            />
          )}
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
        </div>
        <div style={{ display: 'contents' }} hidden={sourceMode !== 'write'}>
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
        </div>
      </section>

      <section className="cell span-4">
        <Coord c="B3" />
        <p className="label">{t.newReport.targetLabel}</p>
        {hydrated && (
          <TargetChooser
            key={resetKey}
            providers={providers}
            destinations={destinations}
            sourceCard={sourceMode === 'cards' ? (sources[0] ?? null) : undefined}
            onChange={setTarget}
            initial={targetInit}
            onDraft={setTargetDraft}
          />
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
          <button className="btn primary" type="submit" disabled={busy || !canSubmit}>
            {t.newReport.submit} ↗
          </button>
        </div>
      </section>
    </form>
  )
}
