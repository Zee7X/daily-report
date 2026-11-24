'use client'

import { useEffect, useId, useState } from 'react'
import { api, ApiError } from '@/lib/client'
import type { Board, Card, Column } from '@/lib/connectors/types'
import { useI18n } from '@/lib/i18n/client'

export type PickedCard = { provider: string; cardId: string; title: string; url: string | null }

// US-2: telusuri project → card table → kolom → kartu, atau tempel URL kartu (FR-3, FR-4).
export function CardPicker({ provider, onPick }: { provider: string; onPick: (c: PickedCard) => void }) {
  const { t } = useI18n()
  const uid = useId()
  const [mode, setMode] = useState<'browse' | 'paste'>('browse')
  const [boards, setBoards] = useState<Board[] | null>(null)
  const [columns, setColumns] = useState<Column[] | null>(null)
  const [cards, setCards] = useState<Card[] | null>(null)
  const [board, setBoard] = useState('')
  const [column, setColumn] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (mode !== 'browse' || boards) return
    api<{ boards: Board[] }>(`/api/connectors/${provider}/boards`)
      .then((r) => setBoards(r.boards))
      .catch((e: Error) => setError(e.message))
  }, [mode, boards, provider])

  const pickBoard = async (id: string) => {
    setBoard(id)
    setColumn('')
    setColumns(null)
    setCards(null)
    if (!id) return
    try {
      const r = await api<{ columns: Column[] }>(`/api/connectors/${provider}/boards/${encodeURIComponent(id)}/columns`)
      setColumns(r.columns)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const pickColumn = async (id: string) => {
    setColumn(id)
    setCards(null)
    if (!id) return
    try {
      const r = await api<{ cards: Card[] }>(
        `/api/connectors/${provider}/boards/${encodeURIComponent(board)}/cards?column=${encodeURIComponent(id)}`,
      )
      setCards(r.cards)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const resolveUrl = async () => {
    setError(null)
    setBusy(true)
    try {
      const r = await api<{ card: { id: string; title: string; url: string | null } }>(
        `/api/connectors/${provider}/resolve?url=${encodeURIComponent(url)}`,
      )
      onPick({ provider, cardId: r.card.id, title: r.card.title, url: r.card.url })
      setUrl('')
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'invalid_url' ? t.picker.invalidUrl : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div className="seg" role="group">
        <button type="button" aria-pressed={mode === 'browse'} onClick={() => setMode('browse')}>
          {t.picker.browse}
        </button>
        <button type="button" aria-pressed={mode === 'paste'} onClick={() => setMode('paste')}>
          {t.picker.paste}
        </button>
      </div>

      {mode === 'browse' ? (
        boards === null && !error ? (
          <div className="skeleton pulse" style={{ height: 36 }} aria-label={t.picker.loadingBoards} />
        ) : (
          <div className="stack">
            <label className="field">
              <span>{t.picker.board}</span>
              <select className="select" id={`${uid}-b`} value={board} onChange={(e) => pickBoard(e.target.value)}>
                <option value="">{t.picker.choose}</option>
                {(boards ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.project} / {b.name}
                  </option>
                ))}
              </select>
            </label>
            {columns && (
              <label className="field">
                <span>{t.picker.column}</span>
                <select className="select" value={column} onChange={(e) => pickColumn(e.target.value)}>
                  <option value="">{t.picker.choose}</option>
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.cardsCount})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {cards && (
              <label className="field">
                <span>{t.picker.card}</span>
                <select
                  className="select"
                  value=""
                  onChange={(e) => {
                    const c = cards.find((x) => x.id === e.target.value)
                    if (c) onPick({ provider, cardId: c.id, title: c.title, url: c.url })
                  }}
                >
                  <option value="">{t.picker.choose}</option>
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.completed ? '✓ ' : ''}
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )
      ) : (
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <label className="sr-only" htmlFor={`${uid}-u`}>
            URL
          </label>
          <input
            id={`${uid}-u`}
            className="input mono"
            type="url"
            placeholder={t.picker.urlPlaceholder}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (url) resolveUrl()
              }
            }}
          />
          <button type="button" className="btn" disabled={!url || busy} onClick={resolveUrl}>
            {t.picker.use}
          </button>
        </div>
      )}
      {error && (
        <p className="notice bad" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
