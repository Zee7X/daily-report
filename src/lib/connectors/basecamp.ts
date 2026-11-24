import 'server-only'
import { env } from '../env'
import { updateTokens, type Connection, type ConnectionAccount, type ConnectionInput } from '../repo/connections'
import { renderBasecampHtml } from '../report/render'
import type { Board, Card, CardDetail, Column, Comment, Connector, PostedRef, Step } from './types'

// Basecamp (API 3.basecampapi.com, OAuth Launchpad).
// ID yang dipakai aplikasi bersifat opak: "<account>.<bucket>.<recording>".

const RATE_LIMIT = 40 // request per jendela (limit Basecamp sekitar 50 / 10 detik)
const RATE_WINDOW_MS = 10_000
const MAX_RETRIES = 3
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000 // refresh bila token kedaluwarsa < 24 jam lagi

type Ref = { account: string; bucket: string; id: string }

function parseRef(ref: string): Ref {
  const [account, bucket, id] = ref.split('.')
  if (!/^\d+$/.test(account ?? '') || !/^\d+$/.test(bucket ?? '') || !/^\d+$/.test(id ?? '')) {
    throw new Error(`ID Basecamp tidak valid: ${ref}`)
  }
  return { account, bucket, id }
}

const makeRef = (account: string | number, bucket: string | number, id: string | number) => `${account}.${bucket}.${id}`

// ── rate limiter per akun ────────────────────────────────────────────────

const windows = new Map<string, number[]>()

async function throttle(key: string) {
  for (;;) {
    const now = Date.now()
    const hits = (windows.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
    if (hits.length < RATE_LIMIT) {
      hits.push(now)
      windows.set(key, hits)
      return
    }
    windows.set(key, hits)
    await sleep(RATE_WINDOW_MS - (now - hits[0]) + 5)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── OAuth ────────────────────────────────────────────────────────────────

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number }

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const qs = new URLSearchParams({
    client_id: env.basecamp.clientId,
    client_secret: env.basecamp.clientSecret,
    redirect_uri: env.basecamp.redirectUri,
    ...params,
  })
  const res = await fetch(`${env.basecamp.launchpadBase}/authorization/token?${qs}`, {
    method: 'POST',
    headers: { 'User-Agent': env.basecamp.userAgent },
  })
  if (!res.ok) throw new Error(`Launchpad token error ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as TokenResponse
}

type AuthorizationJson = {
  expires_at?: string
  identity: { id: number; first_name?: string; last_name?: string; email_address: string }
  accounts: { product: string; id: number; name: string; href: string }[]
}

async function authorizationInfo(accessToken: string): Promise<AuthorizationJson> {
  const res = await fetch(`${env.basecamp.launchpadBase}/authorization.json`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': env.basecamp.userAgent },
  })
  if (!res.ok) throw new Error(`Launchpad authorization.json error ${res.status}`)
  return (await res.json()) as AuthorizationJson
}

async function refresh(conn: Connection) {
  if (!conn.refreshToken) throw new Error('Token Basecamp kedaluwarsa. Hubungkan ulang akun Basecamp.')
  const t = await tokenRequest({ type: 'refresh', refresh_token: conn.refreshToken })
  conn.accessToken = t.access_token
  conn.refreshToken = t.refresh_token ?? conn.refreshToken
  conn.expiresAt = t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null
  await updateTokens(conn.id, conn)
}

async function ensureFresh(conn: Connection) {
  if (conn.expiresAt && conn.expiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS) await refresh(conn)
}

// ── HTTP client ──────────────────────────────────────────────────────────

type ReqInit = { method?: string; body?: unknown; raw?: { data: Buffer; contentType: string } }

async function request(conn: Connection, account: string, path: string, init: ReqInit = {}): Promise<Response> {
  await ensureFresh(conn)
  const url = path.startsWith('http') ? path : `${env.basecamp.apiBase}/${account}${path}`
  if (!url.startsWith(env.basecamp.apiBase + '/')) throw new Error('URL Basecamp tidak dikenal')
  let refreshed = false
  for (let attempt = 0; ; attempt++) {
    await throttle(`${conn.id}:${account}`)
    const headers: Record<string, string> = {
      Authorization: `Bearer ${conn.accessToken}`,
      'User-Agent': env.basecamp.userAgent,
      Accept: 'application/json',
    }
    let body: BodyInit | undefined
    if (init.raw) {
      headers['Content-Type'] = init.raw.contentType
      headers['Content-Length'] = String(init.raw.data.length)
      body = new Uint8Array(init.raw.data)
    } else if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json; charset=utf-8'
      body = JSON.stringify(init.body)
    }
    const res = await fetch(url, { method: init.method ?? 'GET', headers, body })
    if (res.status === 401 && !refreshed && conn.refreshToken) {
      refreshed = true
      await refresh(conn)
      continue
    }
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get('Retry-After'))
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt)
      continue
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Basecamp ${init.method ?? 'GET'} ${path} gagal (${res.status}): ${text.slice(0, 200)}`)
    }
    return res
  }
}

async function getJson<T>(conn: Connection, account: string, path: string): Promise<T> {
  return (await (await request(conn, account, path)).json()) as T
}

/** Mengikuti header Link rel="next" (paginasi Basecamp). */
async function getAll<T>(conn: Connection, account: string, path: string, max = 500): Promise<T[]> {
  const out: T[] = []
  let next: string | null = path
  while (next && out.length < max) {
    const res = await request(conn, account, next)
    out.push(...((await res.json()) as T[]))
    const link = res.headers.get('Link') ?? ''
    next = /<([^>]+)>;\s*rel="next"/.exec(link)?.[1] ?? null
  }
  return out
}

// ── helpers ──────────────────────────────────────────────────────────────

export function htmlToText(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<bc-attachment[^>]*content-type="application\/vnd\.basecamp\.mention"[^>]*>[\s\S]*?<figcaption>([\s\S]*?)<\/figcaption>[\s\S]*?<\/bc-attachment>/gi, '@$1')
    .replace(/<bc-attachment[\s\S]*?<\/bc-attachment>/gi, '[lampiran]')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|h[1-6]|blockquote|pre|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

type BcProject = {
  id: number
  name: string
  app_url?: string
  dock?: { id: number; name: string; title: string; enabled: boolean; app_url?: string }[]
}
type BcCardTable = { id: number; title: string; lists?: { id: number; title: string; cards_count?: number; type?: string }[] }
type BcCard = {
  id: number
  title: string
  app_url?: string
  completed?: boolean
  content?: string
  parent?: { title: string }
  bucket: { id: number; name: string }
  steps?: { id: number; title: string; completed: boolean }[]
}
type BcComment = { id: number; content: string; created_at: string; app_url?: string; creator?: { name: string } }

function accounts(conn: Connection): ConnectionAccount[] {
  return conn.meta.accounts?.length ? conn.meta.accounts : [{ id: conn.accountId, name: conn.accountName }]
}

function cardPath(r: Ref) {
  return `/buckets/${r.bucket}/card_tables/cards/${r.id}.json`
}

// ── connector ────────────────────────────────────────────────────────────

export const basecamp: Connector = {
  id: 'basecamp',
  label: 'Basecamp',

  isConfigured() {
    return Boolean(env.basecamp.clientId && env.basecamp.clientSecret)
  },

  authorizeUrl(state: string) {
    const qs = new URLSearchParams({
      type: 'web_server',
      client_id: env.basecamp.clientId,
      redirect_uri: env.basecamp.redirectUri,
      state,
    })
    return `${env.basecamp.launchpadBase}/authorization/new?${qs}`
  },

  async handleCallback(code: string) {
    const t = await tokenRequest({ type: 'web_server', code })
    const info = await authorizationInfo(t.access_token)
    const bc = info.accounts.filter((a) => a.product === 'bc3' || a.href?.startsWith(env.basecamp.apiBase))
    if (!bc.length) throw new Error('Akun ini tidak memiliki akses Basecamp (bc3).')
    const name = [info.identity.first_name, info.identity.last_name].filter(Boolean).join(' ')
    const connection: ConnectionInput = {
      accountId: String(info.identity.id),
      accountName: name || info.identity.email_address,
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? null,
      expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : info.expires_at ? new Date(info.expires_at) : null,
      meta: { accounts: bc.map((a) => ({ id: String(a.id), name: a.name })), email: info.identity.email_address },
    }
    return { connection, identity: { email: info.identity.email_address, name: name || info.identity.email_address } }
  },

  async listBoards(conn) {
    const boards: Board[] = []
    for (const acc of accounts(conn)) {
      const projects = await getAll<BcProject>(conn, acc.id, '/projects.json')
      for (const p of projects) {
        for (const tool of p.dock ?? []) {
          if (tool.name !== 'kanban_board' || !tool.enabled) continue
          boards.push({
            id: makeRef(acc.id, p.id, tool.id),
            name: tool.title,
            project: p.name,
            account: acc.name,
            url: tool.app_url ?? null,
          })
        }
      }
    }
    return boards
  },

  async listColumns(conn, boardId) {
    const r = parseRef(boardId)
    const table = await getJson<BcCardTable>(conn, r.account, `/buckets/${r.bucket}/card_tables/${r.id}.json`)
    return (table.lists ?? []).map<Column>((l) => ({
      id: makeRef(r.account, r.bucket, l.id),
      title: l.title,
      cardsCount: l.cards_count ?? 0,
    }))
  },

  async listCards(conn, boardId, filter) {
    const columns = filter?.columnId ? [filter.columnId] : (await this.listColumns(conn, boardId)).map((c) => c.id)
    const cards: Card[] = []
    for (const colId of columns) {
      const c = parseRef(colId)
      const list = await getAll<BcCard>(conn, c.account, `/buckets/${c.bucket}/card_tables/lists/${c.id}/cards.json`)
      for (const card of list) {
        cards.push({
          id: makeRef(c.account, card.bucket?.id ?? c.bucket, card.id),
          title: card.title,
          url: card.app_url ?? null,
          column: card.parent?.title ?? '',
          completed: Boolean(card.completed),
        })
      }
    }
    return cards
  },

  async getCard(conn, cardId) {
    const r = parseRef(cardId)
    const card = await getJson<BcCard>(conn, r.account, cardPath(r))
    const comments = await getAll<BcComment>(conn, r.account, `/buckets/${r.bucket}/recordings/${r.id}/comments.json`, 200)
    const detail: CardDetail = {
      id: cardId,
      title: card.title,
      url: card.app_url ?? null,
      column: card.parent?.title ?? '',
      completed: Boolean(card.completed),
      project: card.bucket?.name ?? '',
      description: htmlToText(card.content),
      steps: (card.steps ?? []).map<Step>((s) => ({ id: makeRef(r.account, r.bucket, s.id), title: s.title, completed: s.completed })),
      comments: comments.map<Comment>((c) => ({
        id: makeRef(r.account, r.bucket, c.id),
        author: c.creator?.name ?? '',
        createdAt: c.created_at,
        text: htmlToText(c.content),
      })),
    }
    return detail
  },

  parseCardUrl(url: string) {
    let u: URL
    try {
      u = new URL(url.trim())
    } catch {
      return null
    }
    if (!/(^|\.)basecamp\.com$|basecampapi\.com$/.test(u.hostname) && !url.startsWith(env.basecamp.apiBase)) return null
    const m = /^\/(\d+)\/buckets\/(\d+)\/card_tables\/cards\/(\d+)/.exec(u.pathname)
    return m ? makeRef(m[1], m[2], m[3]) : null
  },

  renderReport(body, images, labels) {
    return renderBasecampHtml(body, images, labels)
  },

  async uploadImage(conn, cardId, file) {
    // Lampiran dibuat di akun tempat kartu tujuan berada.
    const { account } = parseRef(cardId)
    const res = await request(conn, account, `/attachments.json?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      raw: { data: file.data, contentType: file.mime },
    })
    const json = (await res.json()) as { attachable_sgid: string }
    return json.attachable_sgid
  },

  async postReport(conn, cardId, html) {
    const r = parseRef(cardId)
    const res = await request(conn, r.account, `/buckets/${r.bucket}/recordings/${r.id}/comments.json`, {
      method: 'POST',
      body: { content: html },
    })
    const c = (await res.json()) as BcComment
    return { commentId: makeRef(r.account, r.bucket, c.id), url: c.app_url ?? null }
  },

  async updateReport(conn, ref: PostedRef, html) {
    const r = parseRef(ref.commentId)
    const res = await request(conn, r.account, `/buckets/${r.bucket}/comments/${r.id}.json`, {
      method: 'PUT',
      body: { content: html },
    })
    const c = (await res.json()) as BcComment
    return { commentId: ref.commentId, url: c.app_url ?? ref.url }
  },

  async setChecklist(conn, _cardId, stepIds) {
    for (const stepId of stepIds) {
      const s = parseRef(stepId)
      await request(conn, s.account, `/buckets/${s.bucket}/card_tables/steps/${s.id}/completions.json`, {
        method: 'PUT',
        body: { completion: 'on' },
      })
    }
  },
}
