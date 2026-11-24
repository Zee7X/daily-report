import 'server-only'
import { env } from '../env'
import type { Connection } from '../repo/connections'
import { renderMarkdown } from '../report/render'
import { createClient, oauthToken, ref } from './http'
import type { Board, Card, CardDetail, Column, Connector } from './types'

// ClickUp: list → status → task. Step = item checklist. Gambar diunggah sebagai lampiran task.

const ID = () => process.env.CLICKUP_CLIENT_ID ?? ''
const SECRET = () => process.env.CLICKUP_CLIENT_SECRET ?? ''
const API = () => (process.env.CLICKUP_API_BASE || 'https://api.clickup.com/api/v2').replace(/\/$/, '')
const WEB = () => (process.env.CLICKUP_AUTH_BASE || 'https://app.clickup.com').replace(/\/$/, '')

const redirectUri = () => `${env.authUrl}/api/connectors/clickup/callback`
// ClickUp: 100 request/menit per token
const client = createClient({ label: 'ClickUp', rate: { limit: 90, windowMs: 60_000 } })

type CList = { id: string; name: string }
type CTask = {
  id: string
  name: string
  url: string
  status: { status: string; type: string }
  text_content?: string
  description?: string
  list?: { name: string }
  folder?: { name: string }
  checklists?: { id: string; name: string; items: { id: string; name: string; resolved: boolean }[] }[]
}

const MAX_COMMENT = 30000

export const clickup: Connector = {
  id: 'clickup',
  label: 'ClickUp',
  imagesAsFiles: true,
  setup: {
    url: 'https://app.clickup.com/settings/apps',
    env: ['CLICKUP_CLIENT_ID', 'CLICKUP_CLIENT_SECRET'],
    steps: ['Apps → Create new app', 'Isi Redirect URL dengan domain dari Redirect URI di bawah', 'Salin Client ID & Secret ke environment'],
  },

  isConfigured: () => Boolean(ID() && SECRET()),
  redirectUri,

  authorizeUrl(state) {
    return `${WEB()}/api?${new URLSearchParams({ client_id: ID(), redirect_uri: redirectUri(), state })}`
  },

  async handleCallback(code) {
    const t = await oauthToken(`${API()}/oauth/token`, { client_id: ID(), client_secret: SECRET(), code }, { label: 'ClickUp', as: 'query' })
    const accessToken = String(t.access_token)
    const temp = { id: 'tmp', accessToken } as Connection
    const me = await client.json<{ user: { id: number; username: string; email: string } }>(temp, `${API()}/user`)
    const teams = await client.json<{ teams: { id: string; name: string }[] }>(temp, `${API()}/team`)
    return {
      connection: {
        accountId: String(me.user.id),
        accountName: me.user.username,
        accessToken,
        refreshToken: null,
        expiresAt: null,
        meta: { email: me.user.email, accounts: teams.teams.map((x) => ({ id: x.id, name: x.name })) },
      },
      identity: { email: me.user.email, name: me.user.username, verified: false },
    }
  },

  async listBoards(conn) {
    const boards: Board[] = []
    for (const team of conn.meta.accounts ?? []) {
      const spaces = await client.json<{ spaces: { id: string; name: string }[] }>(conn, `${API()}/team/${team.id}/space?archived=false`)
      for (const space of spaces.spaces) {
        const [folders, loose] = await Promise.all([
          client.json<{ folders: { name: string; lists: CList[] }[] }>(conn, `${API()}/space/${space.id}/folder?archived=false`),
          client.json<{ lists: CList[] }>(conn, `${API()}/space/${space.id}/list?archived=false`),
        ])
        for (const l of loose.lists) boards.push({ id: l.id, name: l.name, project: space.name, account: team.name, url: null })
        for (const f of folders.folders)
          for (const l of f.lists) boards.push({ id: l.id, name: l.name, project: `${space.name} / ${f.name}`, account: team.name, url: null })
      }
    }
    return boards
  },

  async listColumns(conn, boardId) {
    const list = await client.json<{ statuses: { status: string; orderindex: number }[] }>(conn, `${API()}/list/${encodeURIComponent(boardId)}`)
    return list.statuses
      .slice()
      .sort((a, b) => a.orderindex - b.orderindex)
      .map<Column>((s) => ({ id: ref.make(boardId, s.status), title: s.status, cardsCount: -1 }))
  },

  async listCards(conn, boardId, filter) {
    const qs = new URLSearchParams({ include_closed: 'true', subtasks: 'false', page: '0' })
    if (filter?.columnId) qs.append('statuses[]', ref.parse(filter.columnId, 2, 'status ClickUp')[1])
    const res = await client.json<{ tasks: CTask[] }>(conn, `${API()}/list/${encodeURIComponent(boardId)}/task?${qs}`)
    return res.tasks.map<Card>((t) => ({
      id: t.id,
      title: t.name,
      url: t.url,
      column: t.status.status,
      completed: t.status.type === 'closed' || t.status.type === 'done',
    }))
  },

  async getCard(conn, cardId) {
    const t = await client.json<CTask>(conn, `${API()}/task/${encodeURIComponent(cardId)}`)
    const c = await client.json<{ comments: { id: string; comment_text: string; date: string; user: { username: string } }[] }>(
      conn,
      `${API()}/task/${encodeURIComponent(cardId)}/comment`,
    )
    return {
      id: t.id,
      title: t.name,
      url: t.url,
      column: t.status.status,
      completed: t.status.type === 'closed' || t.status.type === 'done',
      project: [t.folder?.name, t.list?.name].filter(Boolean).join(' / '),
      description: t.text_content ?? t.description ?? '',
      steps: (t.checklists ?? []).flatMap((cl) =>
        cl.items.map((i) => ({ id: ref.make(t.id, cl.id, i.id), title: i.name, completed: i.resolved })),
      ),
      comments: c.comments
        .slice()
        .reverse()
        .map((x) => ({
          id: x.id,
          author: x.user?.username ?? '',
          createdAt: new Date(Number(x.date)).toISOString(),
          text: x.comment_text,
        })),
    } satisfies CardDetail
  },

  parseCardUrl(raw) {
    const m = /^https:\/\/app\.clickup\.com\/t\/(?:\d+\/)?([A-Za-z0-9]+)\/?$/.exec(raw.trim())
    return m ? m[1] : null
  },

  renderReport(body, images, labels) {
    const md = renderMarkdown(body, images, labels, (img) => img.ref?.sgid ?? null)
    return md.length > MAX_COMMENT ? `${md.slice(0, MAX_COMMENT)}\n\n…` : md
  },

  async uploadImage(conn, cardId, file) {
    const form = new FormData()
    form.append('attachment', new Blob([new Uint8Array(file.data)], { type: file.mime }), file.name)
    const a = await client.json<{ url: string }>(conn, `${API()}/task/${encodeURIComponent(cardId)}/attachment`, { method: 'POST', body: form })
    return a.url
  },

  async postReport(conn, cardId, text) {
    const c = await client.json<{ id: string | number }>(conn, `${API()}/task/${encodeURIComponent(cardId)}/comment`, {
      method: 'POST',
      json: { comment_text: text, notify_all: false },
    })
    const t = await client.json<{ url: string }>(conn, `${API()}/task/${encodeURIComponent(cardId)}`)
    return { commentId: String(c.id), url: t.url }
  },

  async updateReport(conn, posted, text) {
    await client.json(conn, `${API()}/comment/${encodeURIComponent(posted.commentId)}`, { method: 'PUT', json: { comment_text: text } })
    return posted
  },

  async setChecklist(conn, _cardId, stepIds) {
    for (const s of stepIds) {
      const [, checklistId, itemId] = ref.parse(s, 3, 'checklist ClickUp')
      await client.json(conn, `${API()}/checklist/${encodeURIComponent(checklistId)}/checklist_item/${encodeURIComponent(itemId)}`, {
        method: 'PUT',
        json: { resolved: true },
      })
    }
  },
}
