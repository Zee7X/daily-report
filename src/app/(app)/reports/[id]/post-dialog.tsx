'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/client'
import type { CardDetail } from '@/lib/connectors/types'
import { useI18n } from '@/lib/i18n/client'
import type { ReportTarget } from '@/lib/repo/reports'

type Props = {
  open: boolean
  target: ReportTarget
  imageCount: number
  onClose: () => void
  onConfirm: (opts: { mode: 'new' | 'update'; completeStepIds: string[] }) => void
  busy: boolean
}

// US-5: konfirmasi posting, pilihan update/posting baru (FR-11), dan centang subtask (FR-12).
export function PostDialog({ open, target, imageCount, onClose, onConfirm, busy }: Props) {
  const { t } = useI18n()
  const ref = useRef<HTMLDialogElement>(null)
  const [card, setCard] = useState<CardDetail | null>(null)
  const [cardError, setCardError] = useState<string | null>(null)
  const [mode, setMode] = useState<'new' | 'update'>(target.postedCommentId ? 'update' : 'new')
  const [steps, setSteps] = useState<string[]>([])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  useEffect(() => {
    if (!open) return
    setMode(target.postedCommentId ? 'update' : 'new')
    setSteps([])
    setCard(null)
    setCardError(null)
    api<{ card: CardDetail }>(`/api/connectors/${target.provider}/cards/${encodeURIComponent(target.cardId)}`)
      .then((r) => setCard(r.card))
      .catch((e: Error) => setCardError(e.message))
  }, [open, target.cardId, target.provider, target.postedCommentId])

  const openSteps = card?.steps.filter((s) => !s.completed) ?? []

  return (
    <dialog ref={ref} className="sheet" aria-labelledby="post-title" onClose={onClose} onCancel={onClose}>
      <div className="sheet-head">
        <h2 className="subtitle" id="post-title">
          {t.post.title}
        </h2>
        <button type="button" className="icon-btn" aria-label={t.common.close} onClick={onClose}>
          ×
        </button>
      </div>
      <div className="sheet-body">
        <div className="field">
          <span>{t.post.target}</span>
          <div className="row between">
            <strong>{target.cardTitle}</strong>
            {target.cardUrl && (
              <a href={target.cardUrl} target="_blank" rel="noreferrer" className="icon-btn" aria-label={t.common.open}>
                ↗
              </a>
            )}
          </div>
          <span className="small" style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'inherit' }}>
            {imageCount} {t.post.images}
          </span>
        </div>

        {target.postedCommentId && (
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small" style={{ marginBottom: 8 }}>
              {t.post.alreadyPosted}
            </legend>
            <label className="option">
              <input type="radio" name="mode" checked={mode === 'update'} onChange={() => setMode('update')} />
              <span>
                <strong>{t.post.update}</strong>
                {target.postedUrl && (
                  <>
                    {' '}
                    <a href={target.postedUrl} target="_blank" rel="noreferrer" className="small">
                      ↗
                    </a>
                  </>
                )}
              </span>
            </label>
            <label className="option">
              <input type="radio" name="mode" checked={mode === 'new'} onChange={() => setMode('new')} />
              <strong>{t.post.new}</strong>
            </label>
          </fieldset>
        )}

        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 8 }}>
            {t.post.steps}
          </legend>
          {cardError ? (
            <p className="notice bad">{cardError}</p>
          ) : !card ? (
            <div className="skeleton pulse" style={{ height: 60 }} />
          ) : openSteps.length ? (
            openSteps.map((s) => (
              <label key={s.id} className="check">
                <input
                  type="checkbox"
                  checked={steps.includes(s.id)}
                  onChange={(e) => setSteps((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)))}
                />
                {s.title}
              </label>
            ))
          ) : (
            <p className="small">{t.post.noSteps}</p>
          )}
        </fieldset>
      </div>
      <div className="sheet-foot">
        <button type="button" className="btn" onClick={onClose}>
          {t.common.cancel}
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => onConfirm({ mode, completeStepIds: steps })}
        >
          {busy ? t.post.posting : t.post.confirm}
        </button>
      </div>
    </dialog>
  )
}
