'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/client'
import type { Board, Card, Column } from '@/lib/connectors/types'
import { useI18n } from '@/lib/i18n/client'
import { fmt } from '@/lib/i18n/dict'
import { Select } from './select'

export type PickedCard = { provider: string; cardId: string; title: string; url: string | null }
export type PickerNav = { board: string; column: string }
export const NO_NAV: PickerNav = { board: '', column: '' }

// US-2: telusuri project → card table → kolom → kartu, atau tempel URL kartu (FR-3, FR-4).
// `selectedIds` + `onUnpick` turn the card list into a multi-pick (checked rows toggle off); without them it picks one card.
// `initial` is read once at mount and its lists are reloaded; ids missing from them fall back to "Choose…". `onNav` fires on user picks only.
// While `active` is false the picker stays mounted (keeping its state) but does not load boards yet.
export function CardPicker({
  provider,
  onPick,
  selectedIds,
  onUnpick,
  initial,
  onNav,
  active = true,
}: {
  provider: string
  onPick: (c: PickedCard) => void
  selectedIds?: string[]
  onUnpick?: (cardId: string) => void
  initial?: PickerNav
  onNav?: (n: PickerNav) => void
  active?: boolean
}) {
  const { t } = useI18n()
  const uid = useId()
  const [mode, setMode] = useState<'browse' | 'paste'>('browse')
  const [boards, setBoards] = useState<Board[] | null>(null)
  const [columns, setColumns] = useState<Column[] | null>(null)
  const [cards, setCards] = useState<Card[] | null>(null)
  const [board, setBoard] = useState('')
  const [column, setColumn] = useState('')
  const [picked, setPicked] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const init = useRef(initial)

  useEffect(() => {
    if (!active || mode !== 'browse' || boards) return
    api<{ boards: Board[] }>(`/api/connectors/${provider}/boards`)
      .then((r) => {
        setBoards(r.boards)
        const i = init.current
        if (i?.board && r.boards.some((b) => b.id === i.board)) void loadBoard(i.board, i.column)
      })
      .catch((e: Error) => setError(e.message))
  }, [active, mode, boards, provider])

  const loadColumn = async (boardId: string, id: string) => {
    setColumn(id)
    setCards(null)
    setPicked('')
    if (!id) return
    try {
      const r = await api<{ cards: Card[] }>(
        `/api/connectors/${provider}/boards/${encodeURIComponent(boardId)}/cards?column=${encodeURIComponent(id)}`,
      )
      setCards(r.cards)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const loadBoard = async (id: string, restoreColumn = '') => {
    setBoard(id)
    setColumn('')
    setColumns(null)
    setCards(null)
    setPicked('')
    if (!id) return
    try {
      const r = await api<{ columns: Column[] }>(`/api/connectors/${provider}/boards/${encodeURIComponent(id)}/columns`)
      setColumns(r.columns)
      if (restoreColumn && r.columns.some((c) => c.id === restoreColumn)) await loadColumn(id, restoreColumn)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const pickBoard = (id: string) => {
    onNav?.({ board: id, column: '' })
    return loadBoard(id)
  }

  const pickColumn = (id: string) => {
    onNav?.({ board, column: id })
    return loadColumn(board, id)
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
              <Select
                id={`${uid}-b`}
                value={board}
                onChange={pickBoard}
                placeholder={t.picker.choose}
                options={(boards ?? []).map((b) => ({ value: b.id, label: b.name, group: b.project }))}
              />
            </label>
            {columns && (
              <label className="field">
                <span>{t.picker.column}</span>
                <Select
                  value={column}
                  onChange={pickColumn}
                  placeholder={t.picker.choose}
                  options={columns.map((c) => ({ value: c.id, label: `${c.title}${c.cardsCount >= 0 ? ` (${c.cardsCount})` : ''}` }))}
                />
              </label>
            )}
            {cards && (
              <label className="field">
                <span>{selectedIds ? t.picker.cards : t.picker.card}</span>
                <Select
                  searchable
                  multiple={!!selectedIds}
                  selected={selectedIds}
                  value={picked}
                  triggerLabel={
                    selectedIds?.length
                      ? fmt(selectedIds.length === 1 ? t.picker.cardsSelectedOne : t.picker.cardsSelected, { n: String(selectedIds.length) })
                      : selectedIds
                        ? t.picker.chooseCard
                        : undefined
                  }
                  placeholder={t.picker.choose}
                  onChange={(id) => {
                    const c = cards.find((x) => x.id === id)
                    if (!c) return
                    if (selectedIds?.includes(id)) return onUnpick?.(id)
                    setPicked(id)
                    onPick({ provider, cardId: c.id, title: c.title, url: c.url })
                  }}
                  options={cards.map((c) => ({ value: c.id, label: `${c.completed ? '✓ ' : ''}${c.title}` }))}
                />
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
