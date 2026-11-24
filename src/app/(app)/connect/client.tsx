'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api } from '@/lib/client'
import type { Board } from '@/lib/connectors/types'
import { fmt } from '@/lib/i18n/dict'
import { useI18n } from '@/lib/i18n/client'
import type { DestinationKind, PublicDestination } from '@/lib/repo/destinations'

export function DisconnectButton({ provider, label }: { provider: string; label: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button
      className="btn danger"
      disabled={busy}
      onClick={async () => {
        if (!confirm(fmt(t.connect.disconnectConfirm, { tool: label }))) return
        setBusy(true)
        await api(`/api/connectors/${provider}`, { method: 'DELETE' }).catch(() => undefined)
        router.refresh()
      }}
    >
      {t.connect.disconnect}
    </button>
  )
}

export function BoardsList({ provider }: { provider: string }) {
  const { t } = useI18n()
  const [boards, setBoards] = useState<Board[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api<{ boards: Board[] }>(`/api/connectors/${provider}/boards`)
      .then((r) => setBoards(r.boards))
      .catch((e: Error) => setError(e.message))
  }, [provider])

  if (error) return <p className="notice bad">{error}</p>
  if (!boards)
    return (
      <div className="stack" aria-busy="true" aria-label={t.picker.loadingBoards}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton pulse" style={{ height: 28 }} />
        ))}
      </div>
    )
  if (!boards.length) return <p className="empty">{t.common.none}</p>
  return (
    <ul className="list">
      {boards.map((b) => (
        <li key={b.id}>
          <span className="grow truncate">
            <strong>{b.project}</strong> <span className="small">/ {b.name}</span>
          </span>
          <span className="small mono">{b.account}</span>
          {b.url && (
            <a className="icon-btn" href={b.url} target="_blank" rel="noreferrer" aria-label={`${t.common.open} ${b.project}`}>
              ↗
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}

const KINDS: { id: DestinationKind; label: string; placeholder: string }[] = [
  { id: 'discord', label: 'Discord', placeholder: 'https://discord.com/api/webhooks/…' },
  { id: 'slack', label: 'Slack', placeholder: 'https://hooks.slack.com/services/…' },
  { id: 'teams', label: 'Microsoft Teams', placeholder: 'https://…logic.azure.com/workflows/…' },
  { id: 'generic', label: 'JSON (n8n / Zapier / Make)', placeholder: 'https://n8n.example.com/webhook/…' },
]

export function WebhooksManager({ initial, cloud }: { initial: PublicDestination[]; cloud: boolean }) {
  const { t } = useI18n()
  const [items, setItems] = useState(initial)
  const [kind, setKind] = useState<DestinationKind>('discord')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const current = KINDS.find((k) => k.id === kind)!

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const r = await api<{ destination: PublicDestination }>('/api/destinations', {
        method: 'POST',
        json: { kind, name, url, secret: kind === 'generic' ? secret || null : null },
      })
      setItems((prev) => [...prev, r.destination])
      setName('')
      setUrl('')
      setSecret('')
    } catch (err) {
      setMsg({ text: (err as Error).message, bad: true })
    } finally {
      setBusy(false)
    }
  }

  const test = async (id: string) => {
    setMsg(null)
    try {
      await api(`/api/destinations/${id}/test`, { method: 'POST' })
      setMsg({ text: t.connect.webhookTestOk })
    } catch (err) {
      setMsg({ text: (err as Error).message, bad: true })
    }
  }

  const remove = async (id: string) => {
    if (!confirm(t.connect.webhookDeleteConfirm)) return
    await api(`/api/destinations/${id}`, { method: 'DELETE' })
    setItems((prev) => prev.filter((x) => x.id !== id))
  }

  return (
    <div className="split">
      <div className="stack">
        {items.length ? (
          <ul className="list">
            {items.map((d) => (
              <li key={d.id}>
                <span className="tag ink">{d.kind}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <strong className="truncate" style={{ display: 'block' }}>
                    {d.name}
                  </strong>
                  <span className="small mono truncate" style={{ display: 'block' }}>
                    {d.urlHint}
                    {d.hasSecret ? ' · HMAC' : ''}
                  </span>
                </span>
                <button type="button" className="btn sm" onClick={() => test(d.id)}>
                  {t.connect.webhookTest}
                </button>
                <button type="button" className="icon-btn" aria-label={t.common.delete} onClick={() => remove(d.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty skeleton">{t.connect.webhookEmpty}</div>
        )}
        {msg && (
          <p className={`notice ${msg.bad ? 'bad' : 'ok'}`} role="status">
            {msg.text}
          </p>
        )}
      </div>
      <form className="stack" onSubmit={add} aria-label={t.connect.webhookAdd}>
        <div className="seg" role="group" aria-label={t.connect.webhookKind} style={{ flexWrap: 'wrap' }}>
          {KINDS.map((k) => (
            <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
              {k.id === 'generic' ? 'JSON' : k.label.replace('Microsoft ', '')}
            </button>
          ))}
        </div>
        <p className="small">{t.connect.webhookHelp[kind]}</p>
        <label className="field">
          <span>{t.connect.webhookName}</span>
          <input className="input" required maxLength={255} value={name} placeholder={t.connect.webhookNamePlaceholder} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>{t.connect.webhookUrl}</span>
          <input
            className="input mono"
            required
            type="url"
            value={url}
            placeholder={current.placeholder}
            onChange={(e) => setUrl(e.target.value)}
            autoComplete="off"
          />
        </label>
        {kind === 'generic' && (
          <label className="field">
            <span>{t.connect.webhookSecret}</span>
            <input className="input mono" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" />
          </label>
        )}
        {cloud && kind === 'generic' && <p className="small">{t.images.cloudOnly}</p>}
        <div className="row">
          <button className="btn primary" type="submit" disabled={busy || !name.trim() || !url.trim()}>
            + {t.connect.webhookAdd}
          </button>
        </div>
      </form>
    </div>
  )
}
