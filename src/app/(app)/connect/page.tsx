import { Coord } from '@/components/ui'
import { envAiEnabled, MODEL_PRESETS } from '@/lib/ai'
import { isAdmin } from '@/lib/auth'
import { listConnectors } from '@/lib/connectors'
import { env } from '@/lib/env'
import { getDict } from '@/lib/i18n/server'
import { getIntegration } from '@/lib/integrations'
import { getAiSetting, toPublicAi } from '@/lib/repo/ai-settings'
import { getConnection, isTokenAuth } from '@/lib/repo/connections'
import { listDestinations, toPublic } from '@/lib/repo/destinations'
import { requireUser } from '@/lib/session'
import { AiPanel, ConnectorCard, FlashToast, WebhooksManager, type ConnectorView, type OneClickView } from './client'

export async function generateMetadata() {
  return { title: (await getDict()).t.titles.connect }
}

export default async function ConnectPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser()
  const admin = await isAdmin(user)
  const { t } = await getDict()
  const sp = await searchParams

  const [connectors, destinations, ai] = await Promise.all([
    Promise.all(
      listConnectors().map(async (c): Promise<ConnectorView> => {
        const conn = await getConnection(user.id, c.id)
        return {
          id: c.id,
          label: c.label,
          configured: c.isConfigured(),
          token: c.tokenAuth ? { help: c.tokenAuth.help, fields: c.tokenAuth.fields } : null,
          // Hanya 4 karakter terakhir yang sampai ke browser.
          tokenHint: conn && isTokenAuth(conn) ? `••••${conn.accessToken.slice(-4)}` : null,
          connected: Boolean(conn),
          accountName: conn?.accountName ?? null,
          accounts: (conn?.meta.accounts ?? []).map((a) => a.name),
          imagesAsFiles: c.imagesAsFiles,
          supportsLogin: Boolean(c.supportsLogin),
          canChecklist: Boolean(c.setChecklist),
          admin,
          // Panduan pendaftaran hanya dikirim ke admin.
          setup: admin ? c.setup : null,
          redirectUri: admin ? c.redirectUri() : null,
        }
      }),
    ),
    listDestinations(user.id),
    getAiSetting(user.id),
  ])

  const oneClick = (id: 'discord' | 'slack'): OneClickView => {
    const i = getIntegration(id)!
    return { id, label: i.label, configured: i.isConfigured(), setup: admin ? i.setup : null, redirectUri: admin ? i.redirectUri() : null }
  }
  // Non-admin hanya melihat konektor yang bisa dipakai: OAuth sudah diaktifkan atau ada token pribadi.
  const visible = admin ? connectors : connectors.filter((c) => c.configured || c.token)
  const chat = [oneClick('discord'), oneClick('slack')].filter((o) => admin || o.configured)

  const done = sp.connected ? (t.integrations.done[sp.connected] ?? t.connect.connected) : null
  const error = sp.error ? (t.integrations.errors[sp.error] ?? sp.error) : null

  return (
    <div className="grid">
      <div className="blob low" aria-hidden />
      <section className="cell span-12 hero compact">
        <Coord c="A1" />
        <p className="label">{t.connect.label}</p>
        <h1 className="display">{t.connect.title}</h1>
        <p className="muted">{t.connect.subtitle}</p>
      </section>

      <FlashToast done={done} error={error ? `${t.connect.error}: ${error}` : null} />

      {visible.length > 0 && (
        <section className="cell span-12 tight" aria-labelledby="h-kanban">
          <Coord c="B0" />
          <p className="label">{t.integrations.kanbanLabel}</p>
          <h2 className="title" id="h-kanban" style={{ maxWidth: 'none' }}>
            {t.integrations.kanbanTitle}
          </h2>
          <p className="muted">{t.integrations.kanbanText}</p>
        </section>
      )}
      {visible.map((c, i) => (
        <section key={c.id} className="cell span-4" aria-label={c.label}>
          <Coord c={`B${i + 1}`} />
          <ConnectorCard c={c} />
        </section>
      ))}

      <section className="cell span-6" aria-labelledby="h-chat">
        <Coord c="C1" />
        <p className="label">{t.integrations.chatLabel}</p>
        <h2 className="title" id="h-chat">
          {t.integrations.chatTitle}
        </h2>
        <p className="muted">{t.integrations.chatText}</p>
        <WebhooksManager initial={destinations.map(toPublic)} cloud={env.isCloud} oneClick={chat} />
      </section>

      <section className="cell span-6" aria-labelledby="h-ai">
        <Coord c="C2" />
        <p className="label">{t.integrations.aiLabel}</p>
        <h2 className="title" id="h-ai">
          {t.integrations.aiTitle}
        </h2>
        <p className="muted">{t.integrations.aiText}</p>
        <AiPanel initial={ai ? toPublicAi(ai) : null} builtIn={envAiEnabled()} presets={MODEL_PRESETS} cloud={env.isCloud} />
      </section>
    </div>
  )
}
