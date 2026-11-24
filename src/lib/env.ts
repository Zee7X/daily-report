import 'server-only'

// Semua perbedaan mode cloud vs lokal dibaca dari sini (PRD 8.2, FR-16).

function str(name: string, fallback = ''): string {
  const v = process.env[name]
  return v === undefined || v === '' ? fallback : v
}

function oneOf<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const v = str(name, fallback) as T
  if (!allowed.includes(v)) {
    throw new Error(`${name} harus salah satu dari: ${allowed.join(', ')} (sekarang: "${v}")`)
  }
  return v
}

export const env = {
  get appMode() {
    return oneOf('APP_MODE', ['local', 'cloud'] as const, 'local')
  },
  get isCloud() {
    return this.appMode === 'cloud'
  },
  get appUrl() {
    return str('APP_URL', 'http://localhost:3000').replace(/\/$/, '')
  },
  /** Mode satu pengguna hanya diizinkan di mode lokal. */
  get singleUser() {
    return this.appMode === 'local' && str('SINGLE_USER', 'true') === 'true'
  },
  get databaseUrl() {
    return str('DATABASE_URL')
  },
  get databaseSsl() {
    return str('DATABASE_SSL', 'false') === 'true'
  },
  get storageDriver() {
    return oneOf('STORAGE_DRIVER', ['local', 's3'] as const, 'local')
  },
  get storagePath() {
    return str('STORAGE_PATH', './storage')
  },
  s3: {
    get endpoint() {
      return str('S3_ENDPOINT')
    },
    get bucket() {
      return str('S3_BUCKET')
    },
    get region() {
      return str('S3_REGION', 'auto')
    },
    get accessKeyId() {
      return str('S3_ACCESS_KEY_ID')
    },
    get secretAccessKey() {
      return str('S3_SECRET_ACCESS_KEY')
    },
  },
  get queueDriver() {
    return oneOf('QUEUE_DRIVER', ['local', 'qstash'] as const, 'local')
  },
  qstash: {
    get token() {
      return str('QSTASH_TOKEN')
    },
    get currentSigningKey() {
      return str('QSTASH_CURRENT_SIGNING_KEY')
    },
    get nextSigningKey() {
      return str('QSTASH_NEXT_SIGNING_KEY')
    },
  },
  get jobsSecret() {
    return str('JOBS_SECRET')
  },
  get browserDriver() {
    return oneOf('BROWSER_DRIVER', ['local-worker', 'remote-worker', 'none'] as const, 'local-worker')
  },
  get browserWorkerUrl() {
    return str('BROWSER_WORKER_URL', 'http://127.0.0.1:3100').replace(/\/$/, '')
  },
  get browserWorkerToken() {
    return str('BROWSER_WORKER_TOKEN')
  },
  basecamp: {
    get clientId() {
      return str('BASECAMP_CLIENT_ID')
    },
    get clientSecret() {
      return str('BASECAMP_CLIENT_SECRET')
    },
    get redirectUri() {
      return str('BASECAMP_REDIRECT_URI', `${env.appUrl}/api/connectors/basecamp/callback`)
    },
    get userAgent() {
      return str('BASECAMP_USER_AGENT', 'Daily Report (report-tool)')
    },
    /** Hanya untuk pengujian terhadap server tiruan. */
    get launchpadBase() {
      return str('BASECAMP_LAUNCHPAD_BASE', 'https://launchpad.37signals.com').replace(/\/$/, '')
    },
    get apiBase() {
      return str('BASECAMP_API_BASE', 'https://3.basecampapi.com').replace(/\/$/, '')
    },
  },
  get aiProvider() {
    return oneOf('AI_PROVIDER', ['anthropic', 'openai', 'none'] as const, 'none')
  },
  get aiApiKey() {
    return str('AI_API_KEY')
  },
  get aiModel() {
    return str('AI_MODEL')
  },
  get encryptionKey() {
    return str('ENCRYPTION_KEY')
  },
}

export type ConfigIssue = { key: string; message: string; level: 'error' | 'warn' }

/** Pemeriksaan konfigurasi untuk ditampilkan di dashboard. */
export function configIssues(): ConfigIssue[] {
  const issues: ConfigIssue[] = []
  if (!env.databaseUrl) issues.push({ key: 'DATABASE_URL', message: 'missing', level: 'error' })
  const key = env.encryptionKey
  if (!key) issues.push({ key: 'ENCRYPTION_KEY', message: 'missing', level: 'error' })
  else if (Buffer.from(key, 'base64').length !== 32)
    issues.push({ key: 'ENCRYPTION_KEY', message: 'must_be_32_bytes', level: 'error' })
  if (!env.basecamp.clientId || !env.basecamp.clientSecret)
    issues.push({ key: 'BASECAMP_CLIENT_ID', message: 'missing', level: 'warn' })
  if (env.aiProvider !== 'none' && !env.aiApiKey) issues.push({ key: 'AI_API_KEY', message: 'missing', level: 'warn' })
  if (env.aiProvider === 'openai' && !env.aiModel) issues.push({ key: 'AI_MODEL', message: 'missing', level: 'warn' })
  if (env.isCloud && env.storageDriver === 'local')
    issues.push({ key: 'STORAGE_DRIVER', message: 'local_in_cloud', level: 'warn' })
  if (env.isCloud && env.queueDriver === 'local')
    issues.push({ key: 'QUEUE_DRIVER', message: 'local_in_cloud', level: 'warn' })
  return issues
}
