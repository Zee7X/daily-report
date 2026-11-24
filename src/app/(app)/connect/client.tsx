'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BrandIcon } from '@/components/brand-icons'
import { useConfirm } from '@/components/confirm'
import { Select } from '@/components/select'
import { useToast } from '@/components/toast'
import { api } from '@/lib/client'
import type { Board, ConnectorSetup, TokenField } from '@/lib/connectors/types'
import { fmt } from '@/lib/i18n/dict'
import { useI18n } from '@/lib/i18n/client'
import type { AiProvider, PublicAiSetting } from '@/lib/repo/ai-settings'
import type { DestinationKind, PublicDestination } from '@/lib/repo/destinations'

export type ConnectorView = {
  id: string
  label: string
  configured: boolean
  token: { help: string; fields: TokenField[] } | null
  tokenHint: string | null
  connected: boolean
  accountName: string | null
  accounts: string[]
  imagesAsFiles: boolean
  supportsLogin: boolean
  canChecklist: boolean
  admin: boolean
  /** null untuk non-admin: panduan pendaftaran tidak dikirim ke browser mereka. */
  setup: ConnectorSetup | null
  redirectUri: string | null
}

export type OneClickView = {
  id: 'discord' | 'slack'
  label: string
  configured: boolean
  setup: ConnectorSetup | null
  redirectUri: string | null
}

function SetupDetails({ id, setup, redirectUri }: { id: string; setup: ConnectorSetup; redirectUri: string }) {
  const { t } = useI18n()
  return (
    <details>
      <summary className="small" style={{ cursor: 'pointer' }}>
        {t.integrations.adminSetup} <span className="label">{t.integrations.adminOnly}</span>
      </summary>
      <div className="stack" style={{ marginTop: 8 }}>
        <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
          {(t.integrations.setupSteps[id] ?? setup.steps).map((s) => (
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

function TokenForm({ c }: { c: ConnectorView & { token: NonNullable<ConnectorView['token']> } }) {
  const { t } = useI18n()
  const router = useRouter()
  const [values, setValues] = useState<Record<string, string>>({})
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await api<{ account: string }>(`/api/connectors/${c.id}/token`, { method: 'POST', json: values })
      setValues({})
      toast(fmt(t.integrations.tokenSaved, { name: r.account }))
      router.refresh()
    } catch (err) {
      toast((err as Error).message, { bad: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <details open={!c.admin && !c.configured && !c.connected}>
      <summary className="small" style={{ cursor: 'pointer' }}>
        {c.connected && c.tokenHint ? t.integrations.tokenReplace : !c.admin && c.configured ? t.integrations.tokenOther : t.integrations.tokenUse}
      </summary>
      <form className="stack" style={{ marginTop: 8 }} onSubmit={save}>
        <p className="small">{t.integrations.tokenHelp[c.id]}</p>
        <a className="small" href={c.token.help} target="_blank" rel="noreferrer">
          {t.integrations.tokenGet} ↗
        </a>
        {c.token.fields.map((f) => (
          <label key={f.name} className="field">
            <span>{f.label}</span>
            <input
              className="input mono"
              type={f.type ?? 'text'}
              required
              autoComplete="off"
              spellCheck={false}
              placeholder={f.placeholder}
              value={values[f.name] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
            />
          </label>
        ))}
        <p className="small">{t.integrations.tokenSecret}</p>
        <div className="row">
          <button className="btn primary" type="submit" disabled={busy || c.token.fields.some((f) => !values[f.name]?.trim())}>
            {busy ? t.common.saving : t.integrations.tokenSave}
          </button>
        </div>
      </form>
    </details>
  )
}

export function ConnectorCard({ c }: { c: ConnectorView }) {
  const { t } = useI18n()
  const router = useRouter()
  const confirm = useConfirm()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const available = c.configured || Boolean(c.token)
  return (
    <>
      <div className="row between">
        <p className="subtitle row" style={{ flexWrap: 'nowrap' }}>
          <BrandIcon id={c.id} size={18} />
          {c.label}
        </p>
        <span className={`tag ${c.connected ? 'ok' : 'dim'}`}>{c.connected ? t.integrations.connected : available ? t.integrations.available : 'off'}</span>
      </div>
      {c.connected && c.accountName && <p className="small">{c.accountName}</p>}
      {c.connected && c.tokenHint && (
        <p className="small mono">
          {t.integrations.tokenConnected} · {c.tokenHint}
        </p>
      )}
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
      {!c.configured && (c.token ? !c.connected && <p className="small">{t.integrations.tokenOnly}</p> : c.setup && <p className="small">{c.id === 'basecamp' ? t.integrations.basecampAdmin : t.integrations.notEnabled}</p>)}
      {c.token && <TokenForm c={{ ...c, token: c.token }} />}
      {!c.configured && c.setup && c.redirectUri && <SetupDetails id={c.id} setup={c.setup} redirectUri={c.redirectUri} />}
      {(c.configured || c.connected) && (
        <div className="row push">
          {c.configured && (
            <a className={`btn ${c.connected ? '' : 'primary'}`} href={`/api/connectors/${c.id}/authorize`}>
              <BrandIcon id={c.id} />
              {c.connected ? t.integrations.connect : fmt(t.connect.connect, { tool: c.label })}
            </a>
          )}
          {c.connected && (
            <button
              className="btn danger"
              disabled={busy}
              onClick={async () => {
                const ok = await confirm({
                  title: fmt(t.confirm.disconnect, { tool: c.label }),
                  body: t.connect.disconnectConfirm,
                  confirmLabel: t.integrations.disconnect,
                  danger: true,
                })
                if (!ok) return
                setBusy(true)
                try {
                  await api(`/api/connectors/${c.id}`, { method: 'DELETE' })
                  toast(fmt(t.connect.disconnected, { tool: c.label }))
                  router.refresh()
                } catch (err) {
                  toast((err as Error).message, { bad: true })
                } finally {
                  setBusy(false)
                }
              }}
            >
              {t.integrations.disconnect}
            </button>
          )}
        </div>
      )}
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
  const confirm = useConfirm()
  const { toast } = useToast()
  const current = KINDS.find((k) => k.id === kind)!

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
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
      toast((err as Error).message, { bad: true })
    } finally {
      setBusy(false)
    }
  }

  const test = async (id: string) => {
    try {
      await api(`/api/destinations/${id}/test`, { method: 'POST' })
      toast(t.connect.webhookTestOk)
    } catch (err) {
      toast((err as Error).message, { bad: true })
    }
  }

  const remove = async (id: string) => {
    const ok = await confirm({ title: t.confirm.deleteWebhook, body: t.connect.webhookDeleteConfirm, confirmLabel: t.common.delete, danger: true })
    if (!ok) return
    try {
      await api(`/api/destinations/${id}`, { method: 'DELETE' })
      setItems((prev) => prev.filter((x) => x.id !== id))
    } catch (err) {
      toast((err as Error).message, { bad: true })
    }
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      {oneClick.length > 0 && (
      <div className="row">
        {oneClick.map((o) =>
          o.configured ? (
            <a key={o.id} className="btn primary" href={`/api/integrations/${o.id}/authorize`}>
              <BrandIcon id={o.id} />+ {o.label}
            </a>
          ) : (
            <span key={o.id} className="btn" aria-disabled="true" style={{ opacity: 0.45, pointerEvents: 'none' }}>
              <BrandIcon id={o.id} />+ {o.label}
            </span>
          ),
        )}
      </div>
      )}
      {oneClick
        .filter((o) => !o.configured && o.setup && o.redirectUri)
        .map((o) => (
          <div key={o.id}>
            <p className="small">
              {o.label}: {t.integrations.notEnabled}
            </p>
            <SetupDetails id={o.id} setup={o.setup!} redirectUri={o.redirectUri!} />
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

function ModelPicker({
  value,
  onChange,
  presets,
  models,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  presets: { id: string; label: string }[]
  models: string[] | null
  placeholder: string
}) {
  const options = models ? models.map((id) => ({ id, label: id })) : presets
  if (!options.length) {
    return <input className="input mono" required placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
  }
  const known = options.some((o) => o.id === value)
  return (
    <Select
      value={known ? value : ''}
      onChange={onChange}
      placeholder={value || '—'}
      options={options.map((p) => ({ value: p.id, label: p.label }))}
      required
    />
  )
}

export function AiPanel({
  initial,
  builtIn,
  presets,
  cloud,
}: {
  initial: PublicAiSetting | null
  builtIn: boolean
  presets: Record<AiProvider, { id: string; label: string }[]>
  cloud: boolean
}) {
  const { t } = useI18n()
  const [setting, setSetting] = useState(initial)
  const [provider, setProvider] = useState<AiProvider>('custom')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [models, setModels] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  const loadModels = async (body: { baseUrl?: string; apiKey?: string }) => {
    setBusy(true)
    try {
      const r = await api<{ models: string[] }>('/api/ai/models', { method: 'POST', json: body })
      setModels(r.models)
      if (!model && r.models[0]) setModel(r.models[0])
      toast(`${r.models.length} ${t.integrations.aiModelsFound}`)
    } catch (err) {
      toast((err as Error).message, { bad: true })
    } finally {
      setBusy(false)
    }
  }

  // Endpoint custom yang sudah tersimpan: muat daftar modelnya untuk pilihan ganti model.
  useEffect(() => {
    if (setting?.provider === 'custom') {
      api<{ models: string[] }>('/api/ai/models', { method: 'POST', json: {} })
        .then((r) => setModels(r.models))
        .catch(() => setModels(null))
    }
  }, [setting?.provider])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await api<{ setting: PublicAiSetting }>('/api/ai', {
        method: 'POST',
        json: { provider, apiKey, model: model || undefined, baseUrl: provider === 'custom' ? baseUrl : undefined },
      })
      setSetting(r.setting)
      setApiKey('')
      toast(t.integrations.aiSaved)
    } catch (err) {
      toast((err as Error).message, { bad: true })
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
      toast((err as Error).message, { bad: true })
    }
  }

  const disconnect = async () => {
    await api('/api/ai', { method: 'DELETE' })
    setSetting(null)
    setModels(null)
  }

  if (setting) {
    return (
      <div className="stack" style={{ gap: 12 }}>
        <div className="row between">
          <strong>{setting.label}</strong>
          <span className="tag ok">{t.integrations.connected}</span>
        </div>
        <p className="small mono">
          {setting.host ? `${setting.host} · ` : ''}
          {setting.keyHint}
        </p>
        <label className="field">
          <span>{t.integrations.aiModel}</span>
          <ModelPicker
            value={setting.model}
            onChange={changeModel}
            presets={presets[setting.provider] ?? []}
            models={setting.provider === 'custom' ? models : null}
            placeholder={t.integrations.aiModelCustom}
          />
        </label>
        <div className="row push">
          <button className="btn danger" onClick={disconnect}>
            {t.integrations.aiDisconnect}
          </button>
        </div>
      </div>
    )
  }

  const providers: { id: AiProvider; label: string }[] = [
    { id: 'custom', label: t.integrations.aiCustom },
    { id: 'anthropic', label: 'Anthropic' },
    { id: 'openai', label: 'OpenAI' },
    { id: 'openrouter', label: 'OpenRouter key' },
  ]

  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="small">{builtIn ? t.integrations.aiBuiltIn : t.integrations.aiNone}</p>
      <div className="row">
        <a className="btn primary" href="/api/integrations/openrouter/authorize">
          <BrandIcon id="openrouter" />
          {t.integrations.aiConnect} ↗
        </a>
      </div>
      <p className="small">{t.integrations.aiHint}</p>
      <details>
        <summary className="label" style={{ cursor: 'pointer' }}>
          {t.integrations.aiPaste}
        </summary>
        <form className="stack" style={{ marginTop: 10 }} onSubmit={save}>
          <div className="seg" role="group" aria-label={t.integrations.aiProvider} style={{ flexWrap: 'wrap' }}>
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={provider === p.id}
                onClick={() => {
                  setProvider(p.id)
                  setModel('')
                  setModels(null)
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {provider === 'custom' && (
            <>
              <p className="small">{t.integrations.aiCustomHelp}</p>
              <label className="field">
                <span>{t.integrations.aiBaseUrl}</span>
                <input
                  className="input mono"
                  type="url"
                  required
                  placeholder={cloud ? 'https://9router.example.com/v1' : 'http://localhost:20128/v1'}
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <p className="small">{cloud ? t.integrations.aiBaseUrlHintCloud : t.integrations.aiBaseUrlHintLocal}</p>
            </>
          )}
          <label className="field">
            <span>{provider === 'custom' ? t.integrations.aiKeyOptional : t.integrations.aiKey}</span>
            <input
              className="input mono"
              type="password"
              required={provider !== 'custom'}
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t.integrations.aiModel}</span>
            <ModelPicker
              value={model}
              onChange={setModel}
              presets={presets[provider]}
              models={provider === 'custom' ? models : null}
              placeholder={t.integrations.aiModelCustom}
            />
          </label>
          <div className="row">
            {provider === 'custom' && (
              <button type="button" className="btn" disabled={busy || !baseUrl} onClick={() => loadModels({ baseUrl, apiKey })}>
                {t.integrations.aiLoadModels}
              </button>
            )}
            <button className="btn primary" type="submit" disabled={busy || (provider !== 'custom' && !apiKey) || (provider === 'custom' && !baseUrl)}>
              {busy ? t.common.saving : t.integrations.aiSave}
            </button>
          </div>
        </form>
      </details>
    </div>
  )
}

// Shows the OAuth redirect result once, then strips it from the URL.
export function FlashToast({ done, error }: { done: string | null; error: string | null }) {
  const router = useRouter()
  const { toast } = useToast()
  useEffect(() => {
    if (done) toast(done)
    if (error) toast(error, { bad: true })
    if (done || error) router.replace('/connect')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
