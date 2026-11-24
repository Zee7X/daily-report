import 'server-only'
import { getConnector, listConnectors, requireConnection } from '../connectors'
import { HttpError } from '../http'
import { getConnection } from '../repo/connections'
import { getDestination, listDestinations, toPublic, type PublicDestination } from '../repo/destinations'
import type { ReportTarget } from '../repo/reports'
import type { User } from '../repo/users'
import { KIND_LABEL } from '../webhooks'

// Tujuan posting bisa berupa kartu di tool kanban (connector) atau webhook.
// Tanpa tujuan pun laporan tetap bisa dipakai lewat salin/PDF ("Salin saja").

export const WEBHOOK = 'webhook'

export type TargetRef = { provider: string; cardId: string }

export async function resolveTarget(user: User, ref: TargetRef) {
  if (ref.provider === WEBHOOK) {
    const dest = await getDestination(user.id, ref.cardId)
    if (!dest) throw new HttpError(404, 'destination_not_found')
    return { provider: WEBHOOK, cardId: dest.id, cardUrl: null, cardTitle: `${KIND_LABEL[dest.kind]} · ${dest.name}` }
  }
  const { connector, conn } = await requireConnection(user.id, ref.provider)
  const card = await connector.getCard(conn, ref.cardId)
  return { provider: ref.provider, cardId: card.id, cardUrl: card.url, cardTitle: card.title }
}

export type TargetInfo = {
  kind: 'card' | 'webhook'
  label: string
  canUpdate: boolean
  canChecklist: boolean
  attachesImages: boolean
  ready: boolean
}

/** Kemampuan tujuan untuk UI: tombol, opsi update, centang subtask, dan apakah gambar ikut. */
export async function describeTarget(user: User, target: ReportTarget | null): Promise<TargetInfo | null> {
  if (!target) return null
  if (target.provider === WEBHOOK) {
    const dest = await getDestination(user.id, target.cardId)
    const label = dest ? KIND_LABEL[dest.kind] : 'Webhook'
    return {
      kind: 'webhook',
      label,
      canUpdate: false,
      canChecklist: false,
      attachesImages: dest?.kind === 'discord' || dest?.kind === 'generic',
      ready: Boolean(dest),
    }
  }
  const connector = getConnector(target.provider)
  const conn = await getConnection(user.id, target.provider)
  return {
    kind: 'card',
    label: connector.label,
    canUpdate: Boolean(connector.updateReport),
    canChecklist: Boolean(connector.setChecklist),
    attachesImages: Boolean(connector.uploadImage),
    ready: Boolean(conn),
  }
}

export type ProviderOption = { id: string; label: string; connected: boolean; configured: boolean; tokenAuth: boolean }

/** Daftar connector beserta status, dan webhook milik pengguna, untuk pemilih sumber/tujuan. */
export async function targetOptions(user: User): Promise<{ providers: ProviderOption[]; destinations: PublicDestination[] }> {
  const providers = await Promise.all(
    listConnectors().map(async (c) => ({
      id: c.id,
      label: c.label,
      configured: c.isConfigured(),
      tokenAuth: Boolean(c.tokenAuth),
      connected: Boolean(await getConnection(user.id, c.id)),
    })),
  )
  const destinations = (await listDestinations(user.id)).map(toPublic)
  return { providers, destinations }
}
