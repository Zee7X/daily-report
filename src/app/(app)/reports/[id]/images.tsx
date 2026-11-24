'use client'

import { useRef, useState } from 'react'
import { useConfirm } from '@/components/confirm'
import { api } from '@/lib/client'
import { useI18n } from '@/lib/i18n/client'
import type { ReportImage } from '@/lib/report/types'

const MAX_BYTES = 10 * 1024 * 1024

type Props = {
  reportId: string
  images: ReportImage[]
  numbers: Map<string, number>
  browser: boolean
  cloud: boolean
  onImages: (images: ReportImage[]) => void
  onDeleted: (id: string) => void
  onJobs: () => void
  notify: (msg: string, bad?: boolean) => void
}

// US-4: upload, screenshot dari URL, caption, urutan dengan drag (atau tombol panah), penomoran otomatis.
export function ImagesPanel({ reportId, images, numbers, browser, cloud, onImages, onDeleted, onJobs, notify }: Props) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const fileRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [urls, setUrls] = useState('')
  const [width, setWidth] = useState(1440)
  const [height, setHeight] = useState(900)
  const [fullPage, setFullPage] = useState(false)
  const [shooting, setShooting] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files)
    for (const f of list) {
      if (!/^image\/(png|jpeg)$/.test(f.type)) return notify(`${f.name}: ${t.images.badType}`, true)
      if (f.size > MAX_BYTES) return notify(`${f.name}: ${t.images.tooBig}`, true)
    }
    if (!list.length) return
    const form = new FormData()
    list.forEach((f) => form.append('files', f))
    setUploading(true)
    try {
      const r = await api<{ images: ReportImage[] }>(`/api/reports/${reportId}/images`, { method: 'POST', body: form })
      onImages(r.images)
    } catch (e) {
      notify((e as Error).message, true)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const takeScreenshots = async () => {
    const list = urls
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean)
    if (!list.length) return
    setShooting(true)
    try {
      await api(`/api/reports/${reportId}/images`, { method: 'POST', json: { urls: list, width, height, fullPage } })
      setUrls('')
      onJobs()
    } catch (e) {
      notify((e as Error).message, true)
    } finally {
      setShooting(false)
    }
  }

  const reorder = async (order: string[]) => {
    const byId = new Map(images.map((i) => [i.id, i]))
    onImages(order.map((id, position) => ({ ...byId.get(id)!, position })))
    try {
      const r = await api<{ images: ReportImage[] }>(`/api/reports/${reportId}/images`, { method: 'PUT', json: { order } })
      onImages(r.images)
    } catch (e) {
      notify((e as Error).message, true)
    }
  }

  const ordered = [...images].sort((a, b) => a.position - b.position)
  const ids = ordered.map((i) => i.id)

  const patch = async (id: string, p: Partial<Pick<ReportImage, 'caption' | 'selected'>>) => {
    onImages(images.map((i) => (i.id === id ? { ...i, ...p } : i)))
    await api(`/api/reports/${reportId}/images/${id}`, { method: 'PATCH', json: p }).catch((e: Error) => notify(e.message, true))
  }

  const remove = async (id: string) => {
    const ok = await confirm({ title: t.confirm.deleteImage, body: t.common.confirmDelete, confirmLabel: t.common.delete, danger: true })
    if (!ok) return
    try {
      await api(`/api/reports/${reportId}/images/${id}`, { method: 'DELETE' })
      onImages(images.filter((i) => i.id !== id))
      onDeleted(id)
    } catch (e) {
      notify((e as Error).message, true)
    }
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div
        className={`dropzone ${over ? 'over' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={t.images.upload}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), fileRef.current?.click())}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault()
            setOver(true)
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return
          e.preventDefault()
          setOver(false)
          upload(e.dataTransfer.files)
        }}
      >
        <strong>{uploading ? t.common.loading : t.images.upload}</strong>
        <div className="small">{t.images.uploadHint}</div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          multiple
          hidden
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
      </div>

      {browser && (
        <details>
          <summary className="label" style={{ cursor: 'pointer' }}>
            {t.images.screenshot}
          </summary>
          <div className="stack" style={{ marginTop: 10 }}>
            <label className="field">
              <span>{t.images.urls}</span>
              <textarea
                className="textarea mono"
                rows={3}
                value={urls}
                placeholder={cloud ? t.images.urlsPlaceholderCloud : t.images.urlsPlaceholderLocal}
                onChange={(e) => setUrls(e.target.value)}
              />
            </label>
            <div className="row">
              <label className="field" style={{ width: 90 }}>
                <span>W</span>
                <input
                  className="input mono"
                  type="number"
                  min={320}
                  max={3840}
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                  aria-label={`${t.images.size} width`}
                />
              </label>
              <label className="field" style={{ width: 90 }}>
                <span>H</span>
                <input
                  className="input mono"
                  type="number"
                  min={240}
                  max={2160}
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  aria-label={`${t.images.size} height`}
                />
              </label>
              <label className="check" style={{ marginTop: 18 }}>
                <input type="checkbox" checked={fullPage} onChange={(e) => setFullPage(e.target.checked)} />
                {t.images.fullPage}
              </label>
            </div>
            <p className="small">{cloud ? t.images.cloudOnly : t.images.localOnly}</p>
            <button type="button" className="btn" disabled={shooting || !urls.trim()} onClick={takeScreenshots}>
              {t.images.take}
            </button>
          </div>
        </details>
      )}

      {ordered.length ? (
        <ul className="images" aria-label={t.images.dragHint}>
          {ordered.map((img, idx) => (
            <li
              key={img.id}
              className={`image ${img.selected ? '' : 'off'} ${dragId === img.id ? 'dragging' : ''} ${dropId === img.id && dragId !== img.id ? 'drop-before' : ''}`}
              draggable
              onDragStart={(e) => {
                setDragId(img.id)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/x-image-id', img.id)
              }}
              onDragEnd={() => {
                setDragId(null)
                setDropId(null)
              }}
              onDragOver={(e) => {
                if (!dragId) return
                e.preventDefault()
                setDropId(img.id)
              }}
              onDrop={(e) => {
                if (!dragId || dragId === img.id) return
                e.preventDefault()
                const without = ids.filter((x) => x !== dragId)
                without.splice(without.indexOf(img.id), 0, dragId)
                setDragId(null)
                setDropId(null)
                reorder(without)
              }}
            >
              <div className="thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.caption || `${t.images.figure} ${numbers.get(img.id) ?? ''}`} loading="lazy" />
                {img.selected && <span className="num">{numbers.get(img.id)}</span>}
              </div>
              <div className="stack" style={{ gap: 6, minWidth: 0 }}>
                <label className="sr-only" htmlFor={`cap-${img.id}`}>
                  {t.images.caption}
                </label>
                <input
                  id={`cap-${img.id}`}
                  className="input"
                  style={{ minHeight: 30, padding: '4px 8px', fontSize: 12 }}
                  defaultValue={img.caption}
                  placeholder={t.images.caption}
                  onBlur={(e) => e.target.value !== img.caption && patch(img.id, { caption: e.target.value })}
                />
                <div className="row" style={{ gap: 4 }}>
                  <label className="check small" style={{ marginRight: 'auto' }}>
                    <input type="checkbox" checked={img.selected} onChange={(e) => patch(img.id, { selected: e.target.checked })} />
                    {t.images.include}
                  </label>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t.common.moveUp}
                    disabled={idx === 0}
                    onClick={() => {
                      const o = [...ids]
                      ;[o[idx - 1], o[idx]] = [o[idx], o[idx - 1]]
                      reorder(o)
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t.common.moveDown}
                    disabled={idx === ordered.length - 1}
                    onClick={() => {
                      const o = [...ids]
                      ;[o[idx + 1], o[idx]] = [o[idx], o[idx + 1]]
                      reorder(o)
                    }}
                  >
                    ↓
                  </button>
                  <a className="icon-btn" href={img.url} target="_blank" rel="noreferrer" aria-label={t.common.open}>
                    ↗
                  </a>
                  <button type="button" className="icon-btn" aria-label={t.common.delete} onClick={() => remove(img.id)}>
                    ×
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty skeleton" style={{ minHeight: 90 }}>
          {t.images.empty}
        </div>
      )}
    </div>
  )
}
