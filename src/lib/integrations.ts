import 'server-only'
import { DEFAULT_MODEL } from './ai'
import { oauthToken } from './connectors/http'
import { env } from './env'
import { saveAiSetting } from './repo/ai-settings'
import { createDestination } from './repo/destinations'
import { assertWebhookUrl } from './webhooks'

// Integrasi satu klik selain kanban:
//   discord    → OAuth "webhook.incoming": pengguna memilih channel, Discord membuat webhook-nya
//   slack      → OAuth "incoming-webhook": pengguna memilih channel, Slack membuat webhook-nya
//   openrouter → OAuth PKCE: pengguna masuk ke OpenRouter, aplikasi menerima API key milik pengguna
// Alurnya sama dengan connector: state di server, nonce di browser, hasil dipakai di langkah complete.

export type Integration = {
  id: 'discord' | 'slack' | 'openrouter'
  label: string
  kind: 'webhook' | 'ai'
  usesPkce: boolean
  /** Tidak perlu daftar aplikasi (OpenRouter) → selalu aktif. */
  isConfigured(): boolean
  setup: { url: string; env: string[]; steps: string[] } | null
  redirectUri(): string
  authorizeUrl(state: string, pkce?: { challenge: string }): string
  exchange(code: string, verifier?: string): Promise<Record<string, unknown>>
  apply(userId: string, result: Record<string, unknown>): Promise<string>
}

const cb = (id: string) => `${env.authUrl}/api/integrations/${id}/callback`
const DISCORD = () => (process.env.DISCORD_API_BASE || 'https://discord.com').replace(/\/$/, '')
const SLACK = () => (process.env.SLACK_API_BASE || 'https://slack.com').replace(/\/$/, '')
const OPENROUTER = () => (process.env.OPENROUTER_BASE || 'https://openrouter.ai').replace(/\/$/, '')

const discord: Integration = {
  id: 'discord',
  label: 'Discord',
  kind: 'webhook',
  usesPkce: false,
  isConfigured: () => Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
  setup: {
    url: 'https://discord.com/developers/applications',
    env: ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'],
    steps: ['New Application', 'OAuth2 → Redirects: add the Redirect URI below', 'Copy the Client ID & Client Secret into the environment'],
  },
  redirectUri: () => cb('discord'),
  authorizeUrl(state) {
    const qs = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID ?? '',
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      scope: 'webhook.incoming',
      state,
    })
    return `${DISCORD()}/oauth2/authorize?${qs}`
  },
  async exchange(code) {
    return oauthToken(
      `${DISCORD()}/api/oauth2/token`,
      {
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri(),
        client_id: process.env.DISCORD_CLIENT_ID ?? '',
        client_secret: process.env.DISCORD_CLIENT_SECRET ?? '',
      },
      { label: 'Discord' },
    )
  },
  async apply(userId, r) {
    const w = r.webhook as { url?: string; name?: string } | undefined
    if (!w?.url) throw new Error('Discord did not return a webhook')
    await assertWebhookUrl('discord', w.url)
    await createDestination(userId, { kind: 'discord', name: w.name || 'Discord', url: w.url, secret: null })
    return '/connect?connected=discord'
  },
}

const slack: Integration = {
  id: 'slack',
  label: 'Slack',
  kind: 'webhook',
  usesPkce: false,
  isConfigured: () => Boolean(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET),
  setup: {
    url: 'https://api.slack.com/apps?new_app=1',
    env: ['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET'],
    steps: [
      'Create New App → From scratch',
      'OAuth & Permissions: add the Redirect URL below and the incoming-webhook scope',
      'Manage Distribution → Activate Public Distribution (so other workspaces can install it); copy the Client ID & Secret',
    ],
  },
  redirectUri: () => cb('slack'),
  authorizeUrl(state) {
    const qs = new URLSearchParams({ client_id: process.env.SLACK_CLIENT_ID ?? '', scope: 'incoming-webhook', redirect_uri: this.redirectUri(), state })
    return `${SLACK()}/oauth/v2/authorize?${qs}`
  },
  async exchange(code) {
    const r = await oauthToken(
      `${SLACK()}/api/oauth.v2.access`,
      { client_id: process.env.SLACK_CLIENT_ID ?? '', client_secret: process.env.SLACK_CLIENT_SECRET ?? '', code, redirect_uri: this.redirectUri() },
      { label: 'Slack' },
    )
    if (r.ok === false) throw new Error(`Slack: ${String(r.error)}`)
    return r
  },
  async apply(userId, r) {
    const w = r.incoming_webhook as { url?: string; channel?: string } | undefined
    const team = (r.team as { name?: string } | undefined)?.name
    if (!w?.url) throw new Error('Slack did not return a webhook')
    await assertWebhookUrl('slack', w.url)
    await createDestination(userId, { kind: 'slack', name: [w.channel, team].filter(Boolean).join(' · ') || 'Slack', url: w.url, secret: null })
    return '/connect?connected=slack'
  },
}

const openrouter: Integration = {
  id: 'openrouter',
  label: 'OpenRouter',
  kind: 'ai',
  usesPkce: true,
  isConfigured: () => true,
  setup: null,
  redirectUri: () => cb('openrouter'),
  authorizeUrl(state, pkce) {
    const qs = new URLSearchParams({
      callback_url: this.redirectUri(),
      code_challenge: pkce?.challenge ?? '',
      code_challenge_method: 'S256',
      state,
      key_label: 'Daily Report',
    })
    return `${OPENROUTER()}/auth?${qs}`
  },
  async exchange(code, verifier) {
    const res = await fetch(`${OPENROUTER()}/api/v1/auth/keys`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return (await res.json()) as Record<string, unknown>
  },
  async apply(userId, r) {
    if (typeof r.key !== 'string' || !r.key) throw new Error('OpenRouter did not return an API key')
    await saveAiSetting(userId, { provider: 'openrouter', apiKey: r.key, model: DEFAULT_MODEL.openrouter, label: 'OpenRouter' })
    return '/connect?connected=ai'
  },
}

const registry: Record<string, Integration> = { discord, slack, openrouter }

export function getIntegration(id: string): Integration | null {
  return registry[id] ?? null
}

export function listIntegrations(): Integration[] {
  return Object.values(registry)
}
