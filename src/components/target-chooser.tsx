'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/client'
import type { PublicDestination } from '@/lib/repo/destinations'
import { CardPicker, type PickedCard } from './card-picker'

export type ProviderOption = { id: string; label: string; connected: boolean; configured: boolean }
export type TargetMode = 'card' | 'webhook' | 'none'
export type TargetValue = { provider: string; cardId: string; title: string; url: string | null } | null

type Props = {
  providers: ProviderOption[]
  destinations: PublicDestination[]
  initialMode?: TargetMode
  /** Kartu sumber pertama; bila ada, mode kartu menawarkan "sama dengan sumber". */
  sourceCard?: PickedCard | null
  onChange: (v: TargetValue) => void
}

// Tujuan posting: kartu kanban (connector), webhook, atau "Salin saja" tanpa posting.
export function TargetChooser({ providers, destinations, initialMode, sourceCard, onChange }: Props) {
  const { t } = useI18n()
  const connected = providers.filter((p) => p.connected)
  const defaultMode: TargetMode = initialMode ?? (connected.length ? 'card' : destinations.length ? 'webhook' : 'none')
  const [mode, setMode] = useState<TargetMode>(defaultMode)
  const [provider, setProvider] = useState(connected[0]?.id ?? '')
  const [same, setSame] = useState(true)
  const [card, setCard] = useState<PickedCard | null>(null)
  const [dest, setDest] = useState(destinations[0]?.id ?? '')

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

      {mode === 'card' && (
        <>
          {sourceCard !== undefined && (
            <label className="check">
              <input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} />
              {t.newReport.sameAsSource}
            </label>
          )}
          {(!same || sourceCard === undefined) && (
            <>
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
              {provider && <CardPicker key={provider} provider={provider} onPick={setCard} />}
            </>
          )}
        </>
      )}

      {mode === 'webhook' &&
        (destinations.length ? (
          <label className="field">
            <span>{t.newReport.chooseWebhook}</span>
            <select className="select" value={dest} onChange={(e) => setDest(e.target.value)}>
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.kind} · {d.name}
                </option>
              ))}
            </select>
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
