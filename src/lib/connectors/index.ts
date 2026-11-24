import 'server-only'
import { HttpError } from '../http'
import { getConnection } from '../repo/connections'
import { basecamp } from './basecamp'
import { clickup } from './clickup'
import { github } from './github'
import { jira } from './jira'
import { linear } from './linear'
import { trello } from './trello'
import type { Connector } from './types'

// Registry connector. Urutan ini dipakai di halaman Koneksi.
const registry: Record<string, Connector> = {
  basecamp,
  trello,
  jira,
  github,
  linear,
  clickup,
}

export function listConnectors(): Connector[] {
  return Object.values(registry)
}

export function getConnector(provider: string): Connector {
  const c = registry[provider]
  if (!c) throw new HttpError(404, 'unknown_provider', `Connector "${provider}" tidak dikenal`)
  return c
}

export async function requireConnection(userId: string, provider: string) {
  const connector = getConnector(provider)
  const conn = await getConnection(userId, provider)
  if (!conn) throw new HttpError(409, 'not_connected', `Akun ${connector.label} belum dihubungkan`)
  return { connector, conn }
}
