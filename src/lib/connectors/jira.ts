import 'server-only'
import { env } from '../env'
import type { Connection } from '../repo/connections'
import { figureCaption, layout, type ImageLabels } from '../report/render'
import type { ReportBody } from '../report/types'
import { createClient, expiresIn, oauthToken, ref } from './http'
import type { Board, Card, CardDetail, Column, Connector, RenderableImage } from './types'

// Jira Cloud (OAuth 2.0 3LO): project → status → issue. Step = sub-task (ditandai selesai lewat transisi "Done").
// Komentar memakai ADF. Gambar diunggah sebagai lampiran issue dan dirujuk di komentar.

const ID = () => process.env.JIRA_CLIENT_ID ?? ''
const SECRET = () => process.env.JIRA_CLIENT_SECRET ?? ''
const AUTH = () => (process.env.JIRA_AUTH_BASE || 'https://auth.atlassian.com').replace(/\/$/, '')
const API = () => (process.env.JIRA_API_BASE || 'https://api.atlassian.com').replace(/\/$/, '')
const SCOPES = 'read:jira-work write:jira-work read:jira-user read:me offline_access'

const redirectUri = () => `${env.authUrl}/api/connectors/jira/callback`

async function refresh(conn: Connection) {
  const t = await oauthToken(
    `${AUTH()}/oauth/token`,
    { grant_type: 'refresh_token', client_id: ID(), client_secret: SECRET(), refresh_token: conn.refreshToken ?? '' },
    { label: 'Jira', as: 'json' },
  )
  // Atlassian memakai refresh token berotasi: token lama tidak berlaku setelah dipakai.
  return { accessToken: String(t.access_token), refreshToken: t.refresh_token ? String(t.refresh_token) : conn.refreshToken, expiresAt: expiresIn(t.expires_in) }
}

const client = createClient({ label: 'Jira', rate: { limit: 40, windowMs: 10_000 }, refresh })
const site = (cloud: string) => `${API()}/ex/jira/${encodeURIComponent(cloud)}/rest/api/3`

// ── ADF ─────────────────────────────────────────────────────────────────

type Node = Record<string, unknown>

function inline(text: string): Node[] {
  const out: Node[] = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) })
    out.push({ type: 'text', text: m[1], marks: [{ type: 'strong' }] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  return out.filter((n) => (n.text as string).length)
}

function paragraph(text: string): Node {
  const lines = text.trim().split('\n')
  const content: Node[] = []
  lines.forEach((l, i) => {
    if (i) content.push({ type: 'hardBreak' })
    content.push(...inline(l))
  })
  return { type: 'paragraph', content }
}

export function renderAdf(body: ReportBody, images: RenderableImage[], labels: ImageLabels) {
  const content: Node[] = []
  let list: Node[] = []
  const flush = () => {
    if (list.length) content.push({ type: 'bulletList', content: list })
    list = []
  }
  for (const b of layout(body, images, labels)) {
    if (b.kind === 'item') {
      const refs = b.figures.length ? ` (${labels.figure} ${b.figures.map((f) => f.number).join(', ')})` : ''
      list.push({ type: 'listItem', content: [paragraph(b.text + refs)] })
      continue
    }
    flush()
    if (b.kind === 'heading') content.push({ type: 'heading', attrs: { level: 3 }, content: inline(b.text) })
    else if (b.kind === 'intro' || b.kind === 'closing') content.push(paragraph(b.text))
    else if (b.kind === 'images')
      for (const img of b.images)
        content.push({
          type: 'paragraph',
          content: [{ type: 'text', text: `[${figureCaption(img, labels)}${img.ref ? ` — lampiran ${img.ref.sgid}` : ''}]`, marks: [{ type: 'em' }] }],
        })
  }
  flush()
  return JSON.stringify({ version: 1, type: 'doc', content })
}

function adfToText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as { type?: string; text?: string; content?: unknown[] }
  if (n.type === 'text') return n.text ?? ''
  if (n.type === 'hardBreak') return '\n'
  const inner = (n.content ?? []).map(adfToText).join('')
  return ['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote'].includes(n.type ?? '') ? `${inner}\n` : inner
}

// ── connector ───────────────────────────────────────────────────────────

type JIssue = { id: string; key: string; fields: Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any

const siteUrl = (conn: Connection, cloud: string) => conn.meta.accounts?.find((a) => a.id === cloud)?.url ?? ''

export const jira: Connector = {
  id: 'jira',
  label: 'Jira',
  supportsLogin: false,
  imagesAsFiles: true,
  setup: {
    url: 'https://developer.atlassian.com/console/myapps/',
    env: ['JIRA_CLIENT_ID', 'JIRA_CLIENT_SECRET'],
    steps: [
      'Create → OAuth 2.0 integration',
      'Permissions → Jira API: read:jira-work, write:jira-work, read:jira-user; User identity API: read:me',
      'Authorization → Callback URL = Redirect URI di bawah; Settings → salin Client ID & Secret',
    ],
  },

  isConfigured: () => Boolean(ID() && SECRET()),
  redirectUri,

  authorizeUrl(state) {
    const qs = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: ID(),
      scope: SCOPES,
      redirect_uri: redirectUri(),
      state,
      response_type: 'code',
      prompt: 'consent',
    })
    return `${AUTH()}/authorize?${qs}`
  },

  async handleCallback(code) {
    const t = await oauthToken(
      `${AUTH()}/oauth/token`,
      { grant_type: 'authorization_code', client_id: ID(), client_secret: SECRET(), code, redirect_uri: redirectUri() },
      { label: 'Jira', as: 'json' },
    )
    const accessToken = String(t.access_token)
    const temp = { id: 'tmp', accessToken } as Connection
    const sites = await client.json<{ id: string; name: string; url: string }[]>(temp, `${API()}/oauth/token/accessible-resources`)
    if (!sites.length) throw new Error('Akun Atlassian ini tidak punya akses ke situs Jira mana pun')
    const me = await client.json<{ account_id: string; email: string; name: string; email_verified?: boolean }>(temp, `${API()}/me`)
    return {
      connection: {
        accountId: me.account_id,
        accountName: me.name,
        accessToken,
        refreshToken: t.refresh_token ? String(t.refresh_token) : null,
        expiresAt: expiresIn(t.expires_in),
        meta: { email: me.email, accounts: sites.map((s) => ({ id: s.id, name: s.name, url: s.url })) },
      },
      identity: { email: me.email, name: me.name, verified: Boolean(me.email_verified) },
    }
  },

  async listBoards(conn) {
    const boards: Board[] = []
    for (const s of conn.meta.accounts ?? []) {
      const res = await client.json<{ values: { key: string; name: string }[] }>(conn, `${site(s.id)}/project/search?maxResults=100&orderBy=name`)
      for (const p of res.values) {
        boards.push({ id: ref.make(s.id, p.key), name: p.key, project: p.name, account: s.name, url: s.url ? `${s.url}/browse/${p.key}` : null })
      }
    }
    return boards
  },

  async listColumns(conn, boardId) {
    const [cloud, key] = ref.parse(boardId, 2, 'project Jira')
    const types = await client.json<{ statuses: { id: string; name: string }[] }[]>(conn, `${site(cloud)}/project/${encodeURIComponent(key)}/statuses`)
    const seen = new Map<string, string>()
    for (const t of types) for (const s of t.statuses) if (!seen.has(s.id)) seen.set(s.id, s.name)
    return [...seen].map<Column>(([id, name]) => ({ id: ref.make(cloud, key, id), title: name, cardsCount: -1 }))
  },

  async listCards(conn, boardId, filter) {
    const [cloud, key] = ref.parse(boardId, 2, 'project Jira')
    const status = filter?.columnId ? ref.parse(filter.columnId, 3, 'kolom Jira')[2] : null
    const jql = `project = "${key.replace(/"/g, '')}"${status ? ` AND status = ${Number(status)}` : ''} ORDER BY updated DESC`
    const res = await client.json<{ issues: JIssue[] }>(conn, `${site(cloud)}/search/jql`, {
      method: 'POST',
      json: { jql, fields: ['summary', 'status'], maxResults: 100 },
    })
    const base = siteUrl(conn, cloud)
    return res.issues.map<Card>((i) => ({
      id: ref.make(cloud, i.key),
      title: `${i.key} ${i.fields.summary}`,
      url: base ? `${base}/browse/${i.key}` : null,
      column: i.fields.status?.name ?? '',
      completed: i.fields.status?.statusCategory?.key === 'done',
    }))
  },

  async getCard(conn, cardId) {
    const [cloud, key] = ref.parse(cardId, 2, 'issue Jira')
    const i = await client.json<JIssue>(
      conn,
      `${site(cloud)}/issue/${encodeURIComponent(key)}?fields=summary,description,status,project,subtasks,comment`,
    )
    const base = siteUrl(conn, cloud)
    return {
      id: cardId,
      title: `${i.key} ${i.fields.summary}`,
      url: base ? `${base}/browse/${i.key}` : null,
      column: i.fields.status?.name ?? '',
      completed: i.fields.status?.statusCategory?.key === 'done',
      project: i.fields.project?.name ?? '',
      description: adfToText(i.fields.description).trim(),
      steps: (i.fields.subtasks ?? []).map((st: JIssue) => ({
        id: ref.make(cloud, st.key),
        title: `${st.key} ${st.fields.summary}`,
        completed: st.fields.status?.statusCategory?.key === 'done',
      })),
      comments: (i.fields.comment?.comments ?? []).map((c: { id: string; author?: { displayName: string }; created: string; body: unknown }) => ({
        id: c.id,
        author: c.author?.displayName ?? '',
        createdAt: c.created,
        text: adfToText(c.body).trim(),
      })),
    } satisfies CardDetail
  },

  parseCardUrl(raw, conn) {
    let u: URL
    try {
      u = new URL(raw.trim())
    } catch {
      return null
    }
    const key = /\/browse\/([A-Z][A-Z0-9_]+-\d+)/.exec(u.pathname)?.[1] ?? u.searchParams.get('selectedIssue')
    const s = conn.meta.accounts?.find((a) => a.url && new URL(a.url).host === u.host)
    return key && s ? ref.make(s.id, key) : null
  },

  renderReport: renderAdf,

  async uploadImage(conn, cardId, file) {
    const [cloud, key] = ref.parse(cardId, 2, 'issue Jira')
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(file.data)], { type: file.mime }), file.name)
    const res = await client.json<{ filename: string }[]>(conn, `${site(cloud)}/issue/${encodeURIComponent(key)}/attachments`, {
      method: 'POST',
      body: form,
      headers: { 'X-Atlassian-Token': 'no-check' },
    })
    return res[0]?.filename ?? file.name
  },

  async postReport(conn, cardId, adf) {
    const [cloud, key] = ref.parse(cardId, 2, 'issue Jira')
    const c = await client.json<{ id: string }>(conn, `${site(cloud)}/issue/${encodeURIComponent(key)}/comment`, {
      method: 'POST',
      json: { body: JSON.parse(adf) },
    })
    const base = siteUrl(conn, cloud)
    return { commentId: ref.make(cloud, key, c.id), url: base ? `${base}/browse/${key}?focusedCommentId=${c.id}` : null }
  },

  async updateReport(conn, posted, adf) {
    const [cloud, key, id] = ref.parse(posted.commentId, 3, 'komentar Jira')
    await client.json(conn, `${site(cloud)}/issue/${encodeURIComponent(key)}/comment/${encodeURIComponent(id)}`, {
      method: 'PUT',
      json: { body: JSON.parse(adf) },
    })
    return posted
  },

  async setChecklist(conn, _cardId, stepIds) {
    for (const s of stepIds) {
      const [cloud, key] = ref.parse(s, 2, 'sub-task Jira')
      const t = await client.json<{ transitions: { id: string; to: { statusCategory: { key: string } } }[] }>(
        conn,
        `${site(cloud)}/issue/${encodeURIComponent(key)}/transitions`,
      )
      const tr = t.transitions.find((x) => x.to?.statusCategory?.key === 'done')
      if (!tr) throw new Error(`Tidak ada transisi ke Done untuk ${key}`)
      await client.json(conn, `${site(cloud)}/issue/${encodeURIComponent(key)}/transitions`, {
        method: 'POST',
        json: { transition: { id: tr.id } },
        okStatus: [204],
      })
    }
  },
}
