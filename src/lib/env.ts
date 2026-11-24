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

const onVercel = Boolean(process.env.VERCEL)

export const env = {
  get onVercel() {
    return onVercel
  },
  /** Di Vercel default-nya cloud, di komputer sendiri default-nya lokal. */
  get appMode() {
    return oneOf('APP_MODE', ['local', 'cloud'] as const, onVercel ? 'cloud' : 'local')
  },
  get isCloud() {
    return this.appMode === 'cloud'
  },
  get appUrl() {
    const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL
    return str('APP_URL', vercelProd ? `https://${vercelProd}` : 'http://localhost:3000').replace(/\/$/, '')
  },
  /**
   * Domain khusus untuk halaman login dan callback OAuth (mis. https://daily-report.vercel.app).
   * Setelah login, sesi diserahkan ke APP_URL lewat token sekali pakai. Kosong = sama dengan APP_URL.
   */
  get authUrl() {
    return str('AUTH_URL', this.appUrl).replace(/\/$/, '')
  },
  get splitAuth() {
    return this.authUrl !== this.appUrl
  },
  /** Daftar email atau domain (@contoh.com) yang boleh membuat akun. Kosong = hanya akun pertama. */
  get signupAllowed(): string[] {
    return str('SIGNUP_ALLOWED_EMAILS')
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
  },
  /** Mode satu pengguna hanya diizinkan di mode lokal. */
  /** Mode satu pengguna (tanpa login) hanya untuk komputer sendiri; tidak pernah aktif di Vercel. */
  get singleUser() {
    return !onVercel && this.appMode === 'local' && str('SINGLE_USER', 'true') === 'true'
  },
  get databaseUrl() {
    return str('DATABASE_URL')
  },
  /** TiDB Cloud wajib TLS; bila host-nya tidbcloud.com, TLS aktif walau DATABASE_SSL tidak diisi. */
  get databaseSsl() {
    return str('DATABASE_SSL', /tidbcloud\.com/.test(this.databaseUrl) ? 'true' : 'false') === 'true'
  },
  get storageDriver() {
    return oneOf('STORAGE_DRIVER', ['local', 's3', 'vercel-blob'] as const, onVercel ? 'vercel-blob' : 'local')
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
    return oneOf('BROWSER_DRIVER', ['local-worker', 'remote-worker', 'none'] as const, onVercel ? 'none' : 'local-worker')
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
      return str('BASECAMP_REDIRECT_URI', `${env.authUrl}/api/connectors/basecamp/callback`)
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
  if (env.isCloud && env.appUrl.startsWith('http://'))
    issues.push({ key: 'APP_URL', message: 'must_be_https', level: 'warn' })
  return issues
}
