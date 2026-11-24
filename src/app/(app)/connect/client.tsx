'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api } from '@/lib/client'
import type { Board, ConnectorSetup } from '@/lib/connectors/types'
import { fmt } from '@/lib/i18n/dict'
import { useI18n } from '@/lib/i18n/client'
import type { AiProvider, PublicAiSetting } from '@/lib/repo/ai-settings'
import type { DestinationKind, PublicDestination } from '@/lib/repo/destinations'

export type ConnectorView = {
  id: string
  label: string
  configured: boolean
  connected: boolean
  accountName: string | null
  accounts: string[]
  imagesAsFiles: boolean
  supportsLogin: boolean
  canChecklist: boolean
  setup: ConnectorSetup
  redirectUri: string
}

export type OneClickView = {
  id: 'discord' | 'slack'
  label: string
  configured: boolean
  setup: ConnectorSetup | null
  redirectUri: string
}

function SetupDetails({ setup, redirectUri }: { setup: ConnectorSetup; redirectUri: string }) {
  const { t } = useI18n()
  return (
    <details>
      <summary className="small" style={{ cursor: 'pointer' }}>
        {t.integrations.adminSetup}
      </summary>
      <div className="stack" style={{ marginTop: 8 }}>
        <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
          {setup.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <label className="field">
          <span>{t.integrations.redirectUri}</span>
          <input className="input mono" style={{ fontSize: 11 }} readOnly value={redirectUri} onFocus={(e) => e.target.select()} />
        </label>
        <p className="small mono">
          {t.integrations.envVars}: {setup.env.join(', ')}
        </p>
        <a className="small" href={setup.url} target="_blank" rel="noreferrer">
          {t.integrations.openSetup} ↗
        </a>
      </div>
    </details>
  )
}

export function ConnectorCard({ c }: { c: ConnectorView }) {
  const { t } = useI18n()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <>
      <div className="row between">
        <p className="subtitle">{c.label}</p>
        <span className={`tag ${c.connected ? 'ok' : 'dim'}`}>{c.connected ? t.integrations.connected : 'off'}</span>
      </div>
      {c.connected && c.accountName && <p className="small">{c.accountName}</p>}
      <p className="small">
        {[c.imagesAsFiles ? t.integrations.imagesFiles : t.integrations.imagesText, c.supportsLogin ? t.integrations.loginOk : null]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {c.connected && c.accounts.length > 0 && <p className="small truncate">{c.accounts.join(', ')}</p>}
      {c.connected && (
        <details>
          <summary className="small" style={{ cursor: 'pointer' }}>
            {t.integrations.boards}
          </summary>
          <div style={{ marginTop: 8 }}>
            <BoardsList provider={c.id} />
          </div>
        </details>
      )}
      <div className="row push">
        {c.configured ? (
          <a className={`btn ${c.connected ? '' : 'primary'}`} href={`/api/connectors/${c.id}/authorize`}>
            {c.connected ? t.integrations.connect : fmt(t.connect.connect, { tool: c.label })}
          </a>
        ) : (
          <span className="small">{t.integrations.notEnabled}</span>
        )}
        {c.connected && (
          <button
            className="btn danger"
            disabled={busy}
            onClick={async () => {
              if (!confirm(fmt(t.connect.disconnectConfirm, { tool: c.label }))) return
              setBusy(true)
              await api(`/api/connectors/${c.id}`, { method: 'DELETE' }).catch(() => undefined)
              router.refresh()
            }}
          >
            {t.integrations.disconnect}
          </button>
        )}
      </div>
      {!c.configured && <SetupDetails setup={c.setup} redirectUri={c.redirectUri} />}
    </>
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
          <div key={i} className="skeleton pulse" style={{ height: 22 }} />
        ))}
      </div>
    )
  if (!boards.length) return <p className="empty">{t.common.none}</p>
  return (
    <ul className="list">
      {boards.slice(0, 30).map((b) => (
        <li key={b.id}>
          <span className="grow truncate small">
            <strong>{b.project}</strong> / {b.name}
          </span>
          {b.url && (
            <a className="icon-btn" href={b.url} target="_blank" rel="noreferrer" aria-label={`${t.common.open} ${b.name}`}>
              ↗
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}

const KINDS: { id: DestinationKind; label: string; placeholder: string }[] = [
  { id: 'teams', label: 'Teams', placeholder: 'https://…logic.azure.com/workflows/…' },
  { id: 'generic', label: 'JSON', placeholder: 'https://n8n.example.com/webhook/…' },
  { id: 'discord', label: 'Discord', placeholder: 'https://discord.com/api/webhooks/…' },
  { id: 'slack', label: 'Slack', placeholder: 'https://hooks.slack.com/services/…' },
]

export function WebhooksManager({ initial, cloud, oneClick }: { initial: PublicDestination[]; cloud: boolean; oneClick: OneClickView[] }) {
  const { t } = useI18n()
  const [items, setItems] = useState(initial)
  const [kind, setKind] = useState<DestinationKind>('teams')
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
    <div className="stack" style={{ gap: 14 }}>
      <div className="row">
        {oneClick.map((o) =>
          o.configured ? (
            <a key={o.id} className="btn primary" href={`/api/integrations/${o.id}/authorize`}>
              + {o.label}
            </a>
          ) : (
            <span key={o.id} className="btn" aria-disabled="true" style={{ opacity: 0.45, pointerEvents: 'none' }}>
              + {o.label}
            </span>
          ),
        )}
      </div>
      {oneClick
        .filter((o) => !o.configured && o.setup)
        .map((o) => (
          <div key={o.id}>
            <p className="small">
              {o.label}: {t.integrations.notEnabled}
            </p>
            <SetupDetails setup={o.setup!} redirectUri={o.redirectUri} />
          </div>
        ))}

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

      <details>
        <summary className="label" style={{ cursor: 'pointer' }}>
          {t.integrations.manual}
        </summary>
        <form className="stack" style={{ marginTop: 10 }} onSubmit={add} aria-label={t.connect.webhookAdd}>
          <div className="seg" role="group" aria-label={t.connect.webhookKind} style={{ flexWrap: 'wrap' }}>
            {KINDS.map((k) => (
              <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
                {k.label}
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
            <input className="input mono" required type="url" value={url} placeholder={current.placeholder} onChange={(e) => setUrl(e.target.value)} autoComplete="off" />
          </label>
          {kind === 'generic' && (
            <label className="field">
              <span>{t.connect.webhookSecret}</span>
              <input className="input mono" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" />
            </label>
          )}
          {cloud && kind === 'generic' && <p className="small">{t.images.cloudOnly}</p>}
          <div className="row">
            <button className="btn" type="submit" disabled={busy || !name.trim() || !url.trim()}>
              + {t.connect.webhookAdd}
            </button>
          </div>
        </form>
      </details>
    </div>
  )
}

export function AiPanel({
  initial,
  builtIn,
  presets,
}: {
  initial: PublicAiSetting | null
  builtIn: boolean
  presets: Record<AiProvider, { id: string; label: string }[]>
}) {
  const { t } = useI18n()
  const [setting, setSetting] = useState(initial)
  const [provider, setProvider] = useState<AiProvider>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const r = await api<{ setting: PublicAiSetting }>('/api/ai', { method: 'POST', json: { provider, apiKey, model: model || undefined } })
      setSetting(r.setting)
      setApiKey('')
      setMsg({ text: t.integrations.aiSaved })
    } catch (err) {
      setMsg({ text: (err as Error).message, bad: true })
    } finally {
      setBusy(false)
    }
  }

  const changeModel = async (m: string) => {
    if (!m || !setting) return
    try {
      const r = await api<{ setting: PublicAiSetting }>('/api/ai', { method: 'PATCH', json: { model: m } })
      setSetting(r.setting)
    } catch (err) {
      setMsg({ text: (err as Error).message, bad: true })
    }
  }

  const disconnect = async () => {
    await api('/api/ai', { method: 'DELETE' })
    setSetting(null)
  }

  if (setting) {
    const list = presets[setting.provider] ?? []
    const known = list.some((p) => p.id === setting.model)
    return (
      <div className="stack" style={{ gap: 12 }}>
        <div className="row between">
          <strong>{setting.label}</strong>
          <span className="tag ok">{t.integrations.connected}</span>
        </div>
        <p className="small mono">{setting.keyHint}</p>
        <label className="field">
          <span>{t.integrations.aiModel}</span>
          {list.length ? (
            <select className="select" value={known ? setting.model : '__custom'} onChange={(e) => e.target.value !== '__custom' && changeModel(e.target.value)}>
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              {!known && <option value="__custom">{setting.model}</option>}
            </select>
          ) : (
            <input className="input mono" defaultValue={setting.model} onBlur={(e) => e.target.value !== setting.model && changeModel(e.target.value)} />
          )}
        </label>
        {msg && <p className={`notice ${msg.bad ? 'bad' : 'ok'}`}>{msg.text}</p>}
        <div className="row push">
          <button className="btn danger" onClick={disconnect}>
            {t.integrations.aiDisconnect}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="small">{builtIn ? t.integrations.aiBuiltIn : t.integrations.aiNone}</p>
      <div className="row">
        <a className="btn primary" href="/api/integrations/openrouter/authorize">
          {t.integrations.aiConnect} ↗
        </a>
      </div>
      <p className="small">{t.integrations.aiHint}</p>
      <details>
        <summary className="label" style={{ cursor: 'pointer' }}>
          {t.integrations.aiPaste}
        </summary>
        <form className="stack" style={{ marginTop: 10 }} onSubmit={save}>
          <div className="seg" role="group" aria-label={t.integrations.aiProvider}>
            {(['anthropic', 'openai', 'openrouter'] as AiProvider[]).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={provider === p}
                onClick={() => {
                  setProvider(p)
                  setModel('')
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <label className="field">
            <span>{t.integrations.aiKey}</span>
            <input className="input mono" type="password" required autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </label>
          <label className="field">
            <span>{t.integrations.aiModel}</span>
            {presets[provider].length ? (
              <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
                {presets[provider].map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            ) : (
              <input className="input mono" required placeholder={t.integrations.aiModelCustom} value={model} onChange={(e) => setModel(e.target.value)} />
            )}
          </label>
          {msg && <p className={`notice ${msg.bad ? 'bad' : 'ok'}`}>{msg.text}</p>}
          <div className="row">
            <button className="btn" type="submit" disabled={busy || !apiKey}>
              {busy ? t.common.saving : t.integrations.aiSave}
            </button>
          </div>
        </form>
      </details>
    </div>
  )
}
