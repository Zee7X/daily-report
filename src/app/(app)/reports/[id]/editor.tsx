'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PrintIcon } from '@/components/icons'
import { TargetChooser, type ProviderOption, type TargetValue } from '@/components/target-chooser'
import { Coord, formatDate, StatusTag } from '@/components/ui'
import { api, ApiError } from '@/lib/client'
import type { RenderableImage } from '@/lib/connectors/types'
import { fmt } from '@/lib/i18n/dict'
import { useI18n } from '@/lib/i18n/client'
import type { PublicDestination } from '@/lib/repo/destinations'
import type { Job } from '@/lib/repo/jobs'
import type { ReportSource, ReportTarget } from '@/lib/repo/reports'
import { escapeHtml, LABELS, numberImages, renderChat, renderHtml, renderMarkdown, type ChatStyle } from '@/lib/report/render'
import type { TargetInfo } from '@/lib/report/targets'
import type { ReportBody, ReportImage } from '@/lib/report/types'
import { ImagesPanel } from './images'
import { PostDialog } from './post-dialog'
import { SectionsEditor } from './sections'

export type EditorData = {
  report: { id: string; title: string; body: ReportBody; status: 'draft' | 'posted'; createdAt: string; updatedAt: string }
  templateName: string | null
  sources: ReportSource[]
  target: ReportTarget | null
  targetInfo: TargetInfo | null
  images: ReportImage[]
  jobs: Job[]
  providers: ProviderOption[]
  destinations: PublicDestination[]
  browser: boolean
  cloud: boolean
}

type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

const POLL_MS = 1500

export function Editor({ initial }: { initial: EditorData }) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const id = initial.report.id
  const labels = LABELS[locale]

  const [title, setTitle] = useState(initial.report.title)
  const [body, setBody] = useState<ReportBody>(initial.report.body)
  const [status, setStatus] = useState(initial.report.status)
  const [images, setImages] = useState(initial.images)
  const [target, setTarget] = useState(initial.target)
  const [targetInfo, setTargetInfo] = useState(initial.targetInfo)
  const [pendingTarget, setPendingTarget] = useState<TargetValue>(null)
  const [jobs, setJobs] = useState(initial.jobs)
  const [save, setSave] = useState<SaveState>('saved')
  const [preview, setPreview] = useState(false)
  const [postOpen, setPostOpen] = useState(false)
  const [posting, setPosting] = useState(false)
  const [changingTarget, setChangingTarget] = useState(false)
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)

  const notify = useCallback((msg: string, bad = false) => {
    setToast({ msg, bad })
    window.setTimeout(() => setToast(null), 4000)
  }, [])

  // ── autosave ───────────────────────────────────────────────────────
  const pending = useRef<{ title: string; body: ReportBody } | null>(null)
  const timer = useRef<number | null>(null)
  const flush = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    const p = pending.current
    if (!p) return true
    pending.current = null
    setSave('saving')
    try {
      await api(`/api/reports/${id}`, { method: 'PATCH', json: { title: p.title.trim() || 'Untitled', body: p.body } })
      setSave(pending.current ? 'dirty' : 'saved')
      return true
    } catch (e) {
      pending.current = pending.current ?? p
      setSave('error')
      notify((e as Error).message, true)
      return false
    }
  }, [id, notify])

  const schedule = useCallback(
    (next: { title: string; body: ReportBody }) => {
      pending.current = next
      setSave('dirty')
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(flush, 800)
    },
    [flush],
  )

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const changeBody = (b: ReportBody) => {
    setBody(b)
    schedule({ title, body: b })
  }
  const changeTitle = (v: string) => {
    setTitle(v)
    schedule({ title: v, body })
  }

  // ── jobs polling ───────────────────────────────────────────────────
  const reload = useCallback(async () => {
    const v = await api<{
      images: ReportImage[]
      target: ReportTarget | null
      targetInfo: TargetInfo | null
      report: { status: 'draft' | 'posted' }
    }>(`/api/reports/${id}`)
    setImages(v.images)
    setTarget(v.target)
    setTargetInfo(v.targetInfo)
    setStatus(v.report.status)
  }, [id])

  const active = jobs.some((j) => j.status === 'queued' || j.status === 'running')
  const [pollTick, setPollTick] = useState(0)
  const seen = useRef(new Map(initial.jobs.map((j) => [j.id, j.status])))

  useEffect(() => {
    if (!active && pollTick === 0) return
    const h = window.setTimeout(async () => {
      try {
        const r = await api<{ jobs: Job[] }>(`/api/reports/${id}/jobs`)
        let needReload = false
        for (const j of r.jobs) {
          const prev = seen.current.get(j.id)
          if (prev !== j.status && (j.status === 'done' || j.status === 'failed')) {
            needReload = true
            if (j.type === 'post') {
              setPosting(false)
              if (j.status === 'done') {
                setPostOpen(false)
                const res = j.result as { note?: string | null; destination?: string } | null
                const done = res?.destination ? t.post.sent : t.post.done
                notify(res?.note ? `${done} ${res.note}` : done)
              } else notify(`${t.post.failed}: ${j.error ?? ''}`, true)
            } else if (j.status === 'failed') notify(`Screenshot: ${j.error ?? t.common.error}`, true)
          }
          seen.current.set(j.id, j.status)
        }
        setJobs(r.jobs)
        if (needReload) await reload()
        setPollTick(r.jobs.some((j) => j.status === 'queued' || j.status === 'running') ? (x) => x + 1 : 0)
      } catch {
        setPollTick((x) => x + 1)
      }
    }, POLL_MS)
    return () => window.clearTimeout(h)
  }, [active, pollTick, id, reload, notify, t])

  const kickPoll = () => setPollTick((x) => x + 1)

  // ── derived ────────────────────────────────────────────────────────
  const numbers = useMemo(() => numberImages(images), [images])
  const renderables: (RenderableImage & { url: string })[] = useMemo(
    () =>
      images
        .filter((i) => i.selected)
        .map((i) => ({ id: i.id, number: numbers.get(i.id)!, caption: i.caption, url: i.url }))
        .sort((a, b) => a.number - b.number),
    [images, numbers],
  )

  const previewHtml = useMemo(
    () =>
      preview
        ? renderHtml(body, renderables, labels, (img, caption) => {
            const url = (img as RenderableImage & { url: string }).url
            return `<figure><img src="${escapeHtml(url)}" alt="${escapeHtml(caption)}"><figcaption>${escapeHtml(caption)}</figcaption></figure>`
          })
        : '',
    [preview, body, renderables, labels],
  )

  // ── actions ────────────────────────────────────────────────────────
  const startPost = async (opts: { mode: 'new' | 'update'; completeStepIds: string[] }) => {
    if (!(await flush())) return
    setPosting(true)
    try {
      await api(`/api/reports/${id}/post`, { method: 'POST', json: opts })
      kickPoll()
      const r = await api<{ jobs: Job[] }>(`/api/reports/${id}/jobs`)
      setJobs(r.jobs)
    } catch (e) {
      setPosting(false)
      if (e instanceof ApiError && e.code === 'already_posted') {
        await reload()
        notify(t.errors.already_posted, true)
      } else notify((e as Error).message, true)
    }
  }

  const downloadPdf = async () => {
    if (!(await flush())) return
    notify(t.common.loading)
    const res = await fetch(`/api/reports/${id}/pdf`)
    if (res.ok) {
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'laporan'}.pdf`
      a.click()
      URL.revokeObjectURL(a.href)
      setToast(null)
      return
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
    if (data.error === 'browser_unreachable' || data.error === 'browser_disabled') {
      notify(t.editor.pdfFallback)
      window.open(`/print/${id}`, '_blank', 'noopener')
    } else notify(data.message ?? t.common.error, true)
  }

  const toDataUrl = async (url: string) => {
    const blob = await (await fetch(url)).blob()
    return new Promise<string>((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.readAsDataURL(blob)
    })
  }

  const copyHtml = async () => {
    try {
      const withData = await Promise.all(renderables.map(async (r) => ({ ...r, data: await toDataUrl(r.url) })))
      const html = renderHtml(body, withData, labels, (img, caption) => {
        const src = (img as RenderableImage & { data: string }).data
        return `<figure><img src="${src}" alt="${escapeHtml(caption)}"><figcaption>${escapeHtml(caption)}</figcaption></figure>`
      })
      const md = renderMarkdown(body, renderables, labels)
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([md], { type: 'text/plain' }),
          }),
        ])
      } else await navigator.clipboard.writeText(html)
      notify(`HTML · ${t.common.copied}`)
    } catch (e) {
      notify((e as Error).message, true)
    }
  }

  const copyMd = async () => {
    try {
      await navigator.clipboard.writeText(renderMarkdown(body, renderables, labels))
      notify(`Markdown · ${t.common.copied}`)
    } catch (e) {
      notify((e as Error).message, true)
    }
  }

  // Format salin untuk aplikasi chat. Teams menerima HTML sederhana (tebal, bullet) + teks biasa sebagai cadangan.
  const copyChat = async (style: ChatStyle) => {
    const text = renderChat(body, renderables, labels, style)
    const name = { whatsapp: 'WhatsApp', slack: 'Slack', teams: 'Teams' }[style]
    try {
      if (style === 'teams' && typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        const html = renderHtml(body, renderables, labels, (_img, caption) => `<p><em>[${escapeHtml(caption)}]</em></p>`, {
          headingTag: 'h3',
        })
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          }),
        ])
      } else await navigator.clipboard.writeText(text)
      notify(`${name} · ${t.common.copied}`)
    } catch (e) {
      notify((e as Error).message, true)
    }
  }

  const saveTarget = async () => {
    try {
      const r = pendingTarget
        ? await api<{ target: ReportTarget; targetInfo: TargetInfo }>(`/api/reports/${id}/target`, {
            method: 'PUT',
            json: { provider: pendingTarget.provider, cardId: pendingTarget.cardId },
          })
        : await api<{ target: null; targetInfo: null }>(`/api/reports/${id}/target`, { method: 'DELETE' })
      setTarget(r.target)
      setTargetInfo(r.targetInfo)
      setChangingTarget(false)
    } catch (e) {
      notify((e as Error).message, true)
    }
  }

  const deleteReport = async () => {
    if (!confirm(t.common.confirmDelete)) return
    pending.current = null
    await api(`/api/reports/${id}`, { method: 'DELETE' })
    router.push('/reports')
  }

  const saveLabel = { saved: t.common.saved, dirty: t.common.unsaved, saving: t.common.saving, error: t.common.error }[save]

  return (
    <div className="grid">
      <div className="blob low" aria-hidden />

      {/* header */}
      <section className="cell span-8 hero compact">
        <Coord c="A1" />
        <div className="row">
          <p className="label">
            {t.editor.label}
            {initial.templateName ? ` · ${initial.templateName}` : ''}
          </p>
          <StatusTag status={status} t={t} />
          <span className={`tag ${save === 'error' ? 'bad' : save === 'saved' ? 'dim' : 'warn'}`} role="status" aria-live="polite">
            {saveLabel}
          </span>
        </div>
        <label className="sr-only" htmlFor="report-title">
          {t.editor.titleLabel}
        </label>
        <input
          id="report-title"
          className="input bare big"
          value={title}
          onChange={(e) => changeTitle(e.target.value)}
          maxLength={255}
        />
        <p className="small mono">{formatDate(initial.report.createdAt, locale, true)}</p>
      </section>

      <section className="cell span-4 tight" aria-label={t.editor.actions}>
        <Coord c="A2" />
        <p className="label">{t.editor.actions}</p>
        {target && targetInfo ? (
          <button
            type="button"
            className="btn primary"
            disabled={!targetInfo.ready || posting}
            onClick={() => setPostOpen(true)}
            title={!targetInfo.ready ? t.editor.targetNotReady : undefined}
          >
            {posting
              ? t.post.posting
              : `${fmt(targetInfo.kind === 'webhook' ? t.editor.sendTo : t.editor.postTo, { tool: targetInfo.label })} ↗`}
          </button>
        ) : (
          <p className="small">{t.editor.noTargetHint}</p>
        )}
        <div className="row">
          <button type="button" className="icon-btn" onClick={downloadPdf} aria-label={t.editor.pdf} title={t.editor.pdf}>
            PDF
          </button>
          <button type="button" className="icon-btn" onClick={copyHtml} aria-label={t.editor.copyHtml} title={t.editor.copyHtml}>
            &lt;/&gt;
          </button>
          <button type="button" className="icon-btn" onClick={copyMd} aria-label={t.editor.copyMd} title={t.editor.copyMd}>
            MD
          </button>
          <button type="button" className="icon-btn" onClick={() => copyChat('whatsapp')} aria-label={t.editor.copyWa} title={t.editor.copyWa}>
            WA
          </button>
          <button type="button" className="icon-btn" onClick={() => copyChat('slack')} aria-label={t.editor.copySlack} title={t.editor.copySlack}>
            SL
          </button>
          <button type="button" className="icon-btn" onClick={() => copyChat('teams')} aria-label={t.editor.copyTeams} title={t.editor.copyTeams}>
            TM
          </button>
          <a className="icon-btn" href={`/print/${id}`} target="_blank" rel="noreferrer" aria-label={t.editor.print} title={t.editor.print}>
            <PrintIcon />
          </a>
          <button type="button" className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
            {preview ? t.editor.hidePreview : t.editor.preview}
          </button>
        </div>
        {target?.postedUrl && (
          <a href={target.postedUrl} target="_blank" rel="noreferrer" className="small">
            {t.editor.openComment} ↗ {target.postedAt ? `· ${formatDate(target.postedAt, locale, true)}` : ''}
          </a>
        )}
      </section>

      {/* body */}
      <section className="cell span-8" aria-label={t.editor.sections}>
        <Coord c="B1" />
        <p className="label">{t.editor.sections}</p>
        {preview ? (
          <div className="preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        ) : (
          <SectionsEditor body={body} images={images} numbers={numbers} onChange={changeBody} />
        )}
      </section>

      <section className="cell span-4" aria-label={t.images.label}>
        <Coord c="B2" />
        <p className="label">
          {t.images.label} · {renderables.length}/{images.length}
        </p>
        <ImagesPanel
          reportId={id}
          images={images}
          numbers={numbers}
          browser={initial.browser}
          cloud={initial.cloud}
          onImages={setImages}
          onDeleted={(imgId) =>
            changeBody({
              ...body,
              sections: body.sections.map((s) => ({
                ...s,
                items: s.items.map((i) => ({ ...i, imageIds: i.imageIds.filter((x) => x !== imgId) })),
              })),
            })
          }
          onJobs={async () => {
            const r = await api<{ jobs: Job[] }>(`/api/reports/${id}/jobs`)
            setJobs(r.jobs)
            kickPoll()
          }}
          notify={notify}
        />
      </section>

      {/* meta */}
      <section className="cell span-4 tight">
        <Coord c="C1" />
        <p className="label">{t.editor.target}</p>
        {target ? (
          <div className="row between" style={{ flexWrap: 'nowrap' }}>
            <strong className="truncate">{target.cardTitle}</strong>
            {target.cardUrl && (
              <a className="icon-btn" href={target.cardUrl} target="_blank" rel="noreferrer" aria-label={t.common.open}>
                ↗
              </a>
            )}
          </div>
        ) : (
          <p className="small">{t.newReport.targetNone} — {t.editor.noTargetHint}</p>
        )}
        {changingTarget ? (
          <>
            <TargetChooser
              providers={initial.providers}
              destinations={initial.destinations}
              initialMode={target ? (target.provider === 'webhook' ? 'webhook' : 'card') : 'none'}
              onChange={setPendingTarget}
            />
            <div className="row">
              <button type="button" className="btn sm primary" onClick={saveTarget}>
                {t.common.save}
              </button>
              <button type="button" className="btn sm ghost" onClick={() => setChangingTarget(false)}>
                {t.common.cancel}
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="btn sm" onClick={() => setChangingTarget(true)}>
            {t.editor.changeTarget}
          </button>
        )}
      </section>

      <section className="cell span-4 tight">
        <Coord c="C2" />
        <p className="label">{t.editor.sources}</p>
        {initial.sources.length ? (
          <ul className="list">
            {initial.sources.map((s) => (
              <li key={s.id}>
                <span className="grow truncate">{s.title}</span>
                {s.url && (
                  <a className="icon-btn" href={s.url} target="_blank" rel="noreferrer" aria-label={t.common.open}>
                    ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="small">{t.common.none}</p>
        )}
      </section>

      <section className="cell span-4 tight">
        <Coord c="C3" />
        <p className="label">{t.editor.jobs}</p>
        {jobs.length ? (
          <ul className="list">
            {jobs.slice(0, 6).map((j) => (
              <li key={j.id} title={j.error ?? undefined}>
                <span className="mono small">{j.type}</span>
                <span className="grow truncate small">
                  {String((j.payload as { url?: string }).url ?? (j.result as { url?: string } | null)?.url ?? '')}
                  {j.error ? ` — ${j.error}` : ''}
                </span>
                <StatusTag status={j.status} t={t} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="small">{t.editor.noJobs}</p>
        )}
        <div className="row push">
          <Link href="/reports" className="small">
            ← {t.nav.history}
          </Link>
          <button type="button" className="btn sm danger" style={{ marginLeft: 'auto' }} onClick={deleteReport}>
            {t.editor.deleteReport}
          </button>
        </div>
      </section>

      {target && targetInfo && (
        <PostDialog
          open={postOpen}
          target={target}
          info={targetInfo}
          imageCount={renderables.length}
          busy={posting}
          onClose={() => setPostOpen(false)}
          onConfirm={startPost}
        />
      )}

      {toast && (
        <div className={`toast ${toast.bad ? 'bad' : ''}`} role="status" aria-live="polite">
          {toast.msg}
        </div>
      )}
    </div>
  )
}
