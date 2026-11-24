import 'server-only'
import { aiEnabled } from './ai'
import { browserEnabled, browserHealth } from './browser'
import { query } from './db'
import { configIssues, env } from './env'
import { listConnectors } from './connectors'

export type Health = {
  database: boolean
  encryptionKey: boolean
  basecamp: boolean
  ai: 'on' | 'fallback'
  aiProvider: string
  worker: 'ok' | 'off' | 'unreachable'
  storage: string
  queue: string
  mode: 'local' | 'cloud'
  singleUser: boolean
}

export async function health(): Promise<Health> {
  const database = await query('SELECT 1 AS ok')
    .then(() => true)
    .catch(() => false)
  const worker = !browserEnabled() ? 'off' : (await browserHealth()) ? 'ok' : 'unreachable'
  return {
    database,
    encryptionKey: !configIssues().some((i) => i.key === 'ENCRYPTION_KEY'),
    basecamp: listConnectors().some((c) => c.id === 'basecamp' && c.isConfigured()),
    ai: aiEnabled() ? 'on' : 'fallback',
    aiProvider: env.aiProvider,
    worker,
    storage: env.storageDriver,
    queue: env.queueDriver,
    mode: env.appMode,
    singleUser: env.singleUser,
  }
}
