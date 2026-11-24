'use client'

import { useEffect, useRef, useState } from 'react'
import { ImageIcon } from '@/components/icons'
import { useI18n } from '@/lib/i18n/client'
import { newId, type ReportBody, type ReportImage, type ReportItem, type ReportSection } from '@/lib/report/types'

type Props = {
  body: ReportBody
  images: ReportImage[]
  numbers: Map<string, number>
  onChange: (body: ReportBody) => void
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr
  const copy = [...arr]
  const [x] = copy.splice(from, 1)
  copy.splice(to, 0, x)
  return copy
}

function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [props.value])
  return <textarea ref={ref} rows={1} {...props} />
}

// FR-7: centang poin, edit teks, ubah urutan. Semua bisa dioperasikan dengan keyboard.
export function SectionsEditor({ body, images, numbers, onChange }: Props) {
  const { t } = useI18n()
  const [attachOpen, setAttachOpen] = useState<string | null>(null)

  const setSections = (sections: ReportSection[]) => onChange({ ...body, sections })
  const patchSection = (si: number, patch: Partial<ReportSection>) =>
    setSections(body.sections.map((s, i) => (i === si ? { ...s, ...patch } : s)))
  const patchItem = (si: number, ii: number, patch: Partial<ReportItem>) =>
    patchSection(si, { items: body.sections[si].items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) })

  const addItem = (si: number) => {
    const item: ReportItem = { id: newId('i_'), text: '', selected: true, imageIds: [] }
    patchSection(si, { items: [...body.sections[si].items, item] })
    requestAnimationFrame(() => document.getElementById(`item-${item.id}`)?.focus())
  }

  const selectedImages = images.filter((i) => i.selected).sort((a, b) => (numbers.get(a.id) ?? 0) - (numbers.get(b.id) ?? 0))

  return (
    <div className="stack" style={{ gap: 0 }}>
      <label className="field" style={{ marginBottom: 12 }}>
        <span>{t.editor.intro}</span>
        <AutoTextarea
          className="textarea"
          value={body.intro}
          onChange={(e) => onChange({ ...body, intro: e.target.value })}
        />
      </label>

      {body.sections.map((s, si) => (
        <section key={s.id} className={`section-block ${s.selected ? '' : 'off'}`} aria-label={s.title}>
          <div className="section-head">
            <span className="section-index" aria-hidden>
              {String(si + 1).padStart(2, '0')}
            </span>
            <input
              type="checkbox"
              checked={s.selected}
              onChange={(e) => patchSection(si, { selected: e.target.checked })}
              aria-label={`${t.editor.include}: ${s.title}`}
            />
            <label className="sr-only" htmlFor={`sec-${s.id}`}>
              {t.editor.sectionTitle}
            </label>
            <input
              id={`sec-${s.id}`}
              className="input bare"
              value={s.title}
              onChange={(e) => patchSection(si, { title: e.target.value })}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label={t.common.moveUp}
              disabled={si === 0}
              onClick={() => setSections(move(body.sections, si, si - 1))}
            >
              ↑
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={t.common.moveDown}
              disabled={si === body.sections.length - 1}
              onClick={() => setSections(move(body.sections, si, si + 1))}
            >
              ↓
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={t.editor.deleteSection}
              onClick={() => {
                if (s.items.some((i) => i.text.trim()) && !confirm(t.common.confirmDelete)) return
                setSections(body.sections.filter((_, i) => i !== si))
              }}
            >
              ×
            </button>
          </div>

          <ul className="section-items">
            {s.items.map((it, ii) => (
              <li key={it.id} className={`item ${it.selected ? '' : 'off'}`}>
                <input
                  type="checkbox"
                  checked={it.selected}
                  onChange={(e) => patchItem(si, ii, { selected: e.target.checked })}
                  aria-label={t.editor.include}
                />
                <div>
                  <label className="sr-only" htmlFor={`item-${it.id}`}>
                    {t.editor.itemPlaceholder}
                  </label>
                  <AutoTextarea
                    id={`item-${it.id}`}
                    className="textarea bare"
                    value={it.text}
                    placeholder={t.editor.itemPlaceholder}
                    onChange={(e) => patchItem(si, ii, { text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        addItem(si)
                      }
                    }}
                  />
                  {it.imageIds.some((id) => numbers.has(id)) && (
                    <div className="chips">
                      {it.imageIds
                        .filter((id) => numbers.has(id))
                        .sort((a, b) => numbers.get(a)! - numbers.get(b)!)
                        .map((id) => (
                          <span key={id} className="chip" aria-pressed="true">
                            {t.images.figure} {numbers.get(id)}
                          </span>
                        ))}
                    </div>
                  )}
                </div>
                <div className="item-tools" style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t.editor.attachHint}
                    aria-expanded={attachOpen === it.id}
                    title={t.editor.attachHint}
                    disabled={!selectedImages.length}
                    onClick={() => setAttachOpen(attachOpen === it.id ? null : it.id)}
                  >
                    <ImageIcon />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t.common.moveUp}
                    disabled={ii === 0}
                    onClick={() => patchSection(si, { items: move(s.items, ii, ii - 1) })}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t.common.moveDown}
                    disabled={ii === s.items.length - 1}
                    onClick={() => patchSection(si, { items: move(s.items, ii, ii + 1) })}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t.editor.deleteItem}
                    onClick={() => patchSection(si, { items: s.items.filter((_, j) => j !== ii) })}
                  >
                    ×
                  </button>
                  {attachOpen === it.id && (
                    <div
                      className="attach-menu"
                      role="group"
                      aria-label={t.editor.attach}
                      onKeyDown={(e) => e.key === 'Escape' && setAttachOpen(null)}
                    >
                      <p className="label">{t.editor.attach}</p>
                      {selectedImages.map((img) => {
                        const on = it.imageIds.includes(img.id)
                        return (
                          <label key={img.id} className="check">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() =>
                                patchItem(si, ii, {
                                  imageIds: on ? it.imageIds.filter((x) => x !== img.id) : [...it.imageIds, img.id],
                                })
                              }
                            />
                            <span className="truncate" style={{ maxWidth: 200 }}>
                              {t.images.figure} {numbers.get(img.id)}
                              {img.caption ? ` · ${img.caption}` : ''}
                            </span>
                          </label>
                        )
                      })}
                      <button type="button" className="btn sm" onClick={() => setAttachOpen(null)}>
                        {t.common.close}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div style={{ padding: '6px 12px' }}>
            <button type="button" className="btn sm ghost" onClick={() => addItem(si)}>
              + {t.editor.addItem}
            </button>
          </div>
        </section>
      ))}

      <div className="row" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn sm"
          onClick={() =>
            setSections([
              ...body.sections,
              { id: newId('s_'), title: '', selected: true, items: [{ id: newId('i_'), text: '', selected: true, imageIds: [] }] },
            ])
          }
        >
          + {t.editor.addSection}
        </button>
      </div>

      <label className="field" style={{ marginTop: 16 }}>
        <span>{t.editor.closing}</span>
        <AutoTextarea
          className="textarea"
          value={body.closing}
          onChange={(e) => onChange({ ...body, closing: e.target.value })}
        />
      </label>
    </div>
  )
}
