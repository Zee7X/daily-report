'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/client'
import type { PublicDestination } from '@/lib/repo/destinations'
import { CardPicker, NO_NAV, type PickedCard, type PickerNav } from './card-picker'
import { Select } from './select'

export type ProviderOption = { id: string; label: string; connected: boolean; configured: boolean }
export type TargetMode = 'card' | 'webhook' | 'none'
export type TargetValue = { provider: string; cardId: string; title: string; url: string | null } | null
/** Chooser state worth keeping across a reload: ids and display text only. */
export type TargetDraft = { mode: TargetMode; provider: string; same: boolean; card: PickedCard | null; dest: string; nav: PickerNav }

type Props = {
  providers: ProviderOption[]
  destinations: PublicDestination[]
  initialMode?: TargetMode
  /** Kartu sumber pertama; bila ada, mode kartu menawarkan "sama dengan sumber". */
  sourceCard?: PickedCard | null
  onChange: (v: TargetValue) => void
  /** Read once at mount; values that no longer exist (provider, webhook) fall back to the defaults. */
  initial?: TargetDraft
  onDraft?: (d: TargetDraft) => void
}

// Tujuan posting: kartu kanban (connector), webhook, atau "Salin saja" tanpa posting.
export function TargetChooser({ providers, destinations, initialMode, sourceCard, onChange, initial, onDraft }: Props) {
  const { t } = useI18n()
  const connected = providers.filter((p) => p.connected)
  const defaultMode: TargetMode = initialMode ?? (connected.length ? 'card' : destinations.length ? 'webhook' : 'none')
  const [mode, setMode] = useState<TargetMode>(() => (initial && (initial.mode !== 'card' || connected.length) ? initial.mode : defaultMode))
  const [provider, setProvider] = useState(() => (connected.some((p) => p.id === initial?.provider) ? initial!.provider : (connected[0]?.id ?? '')))
  const [same, setSame] = useState(initial?.same ?? true)
  const [card, setCard] = useState<PickedCard | null>(() => (initial?.card && connected.some((p) => p.id === initial.card!.provider) ? initial.card : null))
  const [dest, setDest] = useState(() => (destinations.some((d) => d.id === initial?.dest) ? initial!.dest : (destinations[0]?.id ?? '')))
  const [nav, setNav] = useState<PickerNav>(initial?.nav ?? NO_NAV)

  const value: TargetValue =
    mode === 'card'
      ? same && sourceCard
        ? { provider: sourceCard.provider, cardId: sourceCard.cardId, title: sourceCard.title, url: sourceCard.url }
        : card
          ? { provider: card.provider, cardId: card.cardId, title: card.title, url: card.url }
          : null
      : mode === 'webhook' && dest
        ? { provider: 'webhook', cardId: dest, title: destinations.find((d) => d.id === dest)?.name ?? '', url: null }
        : null

  const key = value ? `${value.provider}:${value.cardId}` : `none:${mode}`
  useEffect(() => {
    onChange(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    onDraft?.({ mode, provider, same, card, dest, nav })
  }, [onDraft, mode, provider, same, card, dest, nav])

  const pickerShown = mode === 'card' && (!same || sourceCard === undefined)

  return (
    <div className="stack">
      <div className="seg" role="group" aria-label={t.newReport.targetLabel} style={{ flexWrap: 'wrap' }}>
        <button type="button" aria-pressed={mode === 'card'} disabled={!connected.length} onClick={() => setMode('card')}>
          {t.newReport.targetCard}
        </button>
        <button type="button" aria-pressed={mode === 'webhook'} onClick={() => setMode('webhook')}>
          {t.newReport.targetWebhook}
        </button>
        <button type="button" aria-pressed={mode === 'none'} onClick={() => setMode('none')}>
          {t.newReport.targetNone}
        </button>
      </div>

      {/* Kept mounted and hidden so switching tabs does not drop the picker's board, column and card lists. */}
      <div style={{ display: 'contents' }} hidden={mode !== 'card'}>
        {sourceCard !== undefined && (
          <label className="check">
            <input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} />
            {t.newReport.sameAsSource}
          </label>
        )}
        <div style={{ display: 'contents' }} hidden={!pickerShown}>
          {connected.length > 1 && (
            <label className="field">
              <span>{t.newReport.provider}</span>
              <Select
                value={provider}
                onChange={(p) => {
                  setProvider(p)
                  setNav(NO_NAV)
                }}
                options={connected.map((p) => ({ value: p.id, label: p.label }))}
              />
            </label>
          )}
          {provider && <CardPicker key={provider} provider={provider} onPick={setCard} active={pickerShown} initial={nav} onNav={setNav} />}
        </div>
      </div>

      {mode === 'webhook' &&
        (destinations.length ? (
          <label className="field">
            <span>{t.newReport.chooseWebhook}</span>
            <Select value={dest} onChange={setDest} options={destinations.map((d) => ({ value: d.id, label: `${d.kind} · ${d.name}` }))} />
          </label>
        ) : (
          <p className="notice">
            {t.newReport.noWebhooks}{' '}
            <a href="/connect" className="small">
              ↗
            </a>
          </p>
        ))}

      {mode === 'none' && <p className="small">{t.newReport.targetNoneHint}</p>}

      {value ? (
        <div className="notice">
          <strong>{value.title}</strong>
          {value.url && (
            <>
              {' '}
              <a href={value.url} target="_blank" rel="noreferrer" className="small">
                ↗
              </a>
            </>
          )}
        </div>
      ) : (
        mode !== 'none' && <div className="empty skeleton">{t.picker.empty}</div>
      )}
    </div>
  )
}
