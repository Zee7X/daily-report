import 'server-only'
import { env } from '../env'
import { isTokenAuth, type Connection } from '../repo/connections'
import { renderMarkdown } from '../report/render'
import { createClient, ref } from './http'
import { probe } from './token'
import type { Board, Card, CardDetail, Column, Connector } from './types'

// Trello: board → list → card. Step = item checklist. Gambar diunggah sebagai lampiran kartu.
// Otorisasi: https://trello.com/1/authorize (token dikembalikan di #fragment → halaman /oauth/trello).

const key = () => process.env.TRELLO_API_KEY ?? ''
const API = () => (process.env.TRELLO_API_BASE || 'https://api.trello.com').replace(/\/$/, '')
const AUTH = () => (process.env.TRELLO_AUTH_BASE || 'https://trello.com').replace(/\/$/, '')

// Koneksi token pribadi membawa kunci API-nya sendiri; koneksi OAuth memakai TRELLO_API_KEY server.
const authorization = (apiKey: string, token: string) => `OAuth oauth_consumer_key="${apiKey}", oauth_token="${token}"`

const client = createClient({
  label: 'Trello',
  rate: { limit: 80, windowMs: 10_000 }, // batas Trello: 100 request / 10 detik per token
  authHeaders: (conn) => ({ Authorization: authorization((isTokenAuth(conn) && conn.meta.apiKey) || key(), conn.accessToken) }),
})

const url = (path: string, q: Record<string, string> = {}) => `${API()}/1${path}${Object.keys(q).length ? `?${new URLSearchParams(q)}` : ''}`

type TBoard = { id: string; name: string; url: string; closed: boolean; organization?: { displayName?: string } }
type TList = { id: string; name: string }
type TCard = { id: string; name: string; url: string; closed: boolean; shortUrl?: string; desc?: string; list?: { name: string }; board?: { name: string } }
type TChecklist = { id: string; name: string; checkItems: { id: string; name: string; state: 'complete' | 'incomplete' }[] }
type TAction = { id: string; date: string; data: { text: string }; memberCreator?: { fullName: string } }

const MAX_COMMENT = 16000

export const trello: Connector = {
  id: 'trello',
  label: 'Trello',
  imagesAsFiles: true,
  callbackMode: 'fragment',
  setup: {
    url: 'https://trello.com/power-ups/admin',
    env: ['TRELLO_API_KEY'],
    steps: [
      'Create a new Power-Up, open the API Key tab, then Generate a new API key',
      'Add the login domain (AUTH_URL or APP_URL) to Allowed origins',
      'Copy the API key into TRELLO_API_KEY',
    ],
  },

  isConfigured: () => Boolean(key()),
  redirectUri: () => `${env.authUrl}/oauth/trello`,

  tokenAuth: {
    help: 'https://trello.com/power-ups/admin',
    fields: [
      { name: 'apiKey', label: 'API key', type: 'text' },
      { name: 'token', label: 'Token', type: 'password' },
    ],
    async verify({ apiKey, token }) {
      const me = await probe<{ id: string; fullName: string; username: string; email?: string | null }>(
        'Trello',
        url('/members/me', { fields: 'fullName,username,email' }),
        { headers: { Authorization: authorization(apiKey, token) } },
      )
      return {
        connection: {
          accountId: me.id,
          accountName: me.fullName || me.username,
          accessToken: token,
          refreshToken: null,
          expiresAt: null,
          meta: { auth: 'token', apiKey, email: me.email ?? undefined, accounts: [{ id: me.id, name: me.username }] },
        },
        identity: { email: me.email || `${me.username}@users.trello`, name: me.fullName || me.username, verified: false },
      }
    },
  },

  authorizeUrl(state) {
    const ret = new URL(this.redirectUri())
    ret.searchParams.set('state', state)
    const qs = new URLSearchParams({
      expiration: 'never',
      name: 'Daily Report',
      scope: 'read,write,account',
      response_type: 'token',
      key: key(),
      callback_method: 'fragment',
      return_url: ret.toString(),
    })
    return `${AUTH()}/1/authorize?${qs}`
  },

  async handleCallback(token) {
    const temp = { id: 'tmp', accessToken: token, meta: {} } as unknown as Connection
    const me = await client.json<{ id: string; fullName: string; username: string; email?: string | null }>(
      temp,
      url('/members/me', { fields: 'fullName,username,email' }),
    )
    return {
      connection: {
        accountId: me.id,
        accountName: me.fullName || me.username,
        accessToken: token,
        refreshToken: null,
        expiresAt: null,
        meta: { email: me.email ?? undefined, accounts: [{ id: me.id, name: me.username }] },
      },
      identity: { email: me.email || `${me.username}@users.trello`, name: me.fullName || me.username, verified: false },
    }
  },

  async listBoards(conn) {
    const boards = await client.json<TBoard[]>(
      conn,
      url('/members/me/boards', { filter: 'open', fields: 'name,url,closed', organization: 'true', organization_fields: 'displayName' }),
    )
    return boards.map<Board>((b) => ({
      id: b.id,
      name: b.name,
      project: b.organization?.displayName || 'Trello',
      account: conn.accountName,
      url: b.url,
    }))
  },

  async listColumns(conn, boardId) {
    const lists = await client.json<TList[]>(conn, url(`/boards/${encodeURIComponent(boardId)}/lists`, { filter: 'open', fields: 'name' }))
    return lists.map<Column>((l) => ({ id: l.id, title: l.name, cardsCount: -1 }))
  },

  async listCards(conn, boardId, filter) {
    const path = filter?.columnId ? `/lists/${encodeURIComponent(filter.columnId)}/cards` : `/boards/${encodeURIComponent(boardId)}/cards/open`
    const cards = await client.json<(TCard & { idList: string })[]>(conn, url(path, { fields: 'name,url,closed,idList' }))
    return cards.map<Card>((c) => ({ id: c.id, title: c.name, url: c.url, column: '', completed: c.closed }))
  },

  async getCard(conn, cardId) {
    const c = await client.json<TCard & { checklists: TChecklist[]; actions: TAction[] }>(
      conn,
      url(`/cards/${encodeURIComponent(cardId)}`, {
        fields: 'name,desc,url,closed',
        list: 'true',
        list_fields: 'name',
        board: 'true',
        board_fields: 'name',
        checklists: 'all',
        checklist_fields: 'name',
        actions: 'commentCard',
        actions_limit: '50',
      }),
    )
    return {
      id: c.id,
      title: c.name,
      url: c.url,
      column: c.list?.name ?? '',
      completed: c.closed,
      project: c.board?.name ?? '',
      description: c.desc ?? '',
      steps: (c.checklists ?? []).flatMap((cl) =>
        cl.checkItems.map((i) => ({ id: ref.make(c.id, i.id), title: i.name, completed: i.state === 'complete' })),
      ),
      comments: (c.actions ?? [])
        .slice()
        .reverse()
        .map((a) => ({ id: a.id, author: a.memberCreator?.fullName ?? '', createdAt: a.date, text: a.data?.text ?? '' })),
    } satisfies CardDetail
  },

  parseCardUrl(raw) {
    const m = /^https:\/\/trello\.com\/c\/([A-Za-z0-9]+)/.exec(raw.trim())
    return m ? m[1] : null
  },

  renderReport(body, images, labels) {
    const md = renderMarkdown(body, images, labels, (img) => img.ref?.sgid ?? null)
    return md.length > MAX_COMMENT ? `${md.slice(0, MAX_COMMENT)}\n\n…` : md
  },

  async uploadImage(conn, cardId, file) {
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(file.data)], { type: file.mime }), file.name)
    form.append('name', file.name)
    form.append('setCover', 'false')
    const a = await client.json<{ id: string; url: string }>(conn, url(`/cards/${encodeURIComponent(cardId)}/attachments`), {
      method: 'POST',
      body: form,
    })
    return a.url
  },

  async postReport(conn, cardId, text) {
    const action = await client.json<{ id: string }>(conn, url(`/cards/${encodeURIComponent(cardId)}/actions/comments`), {
      method: 'POST',
      json: { text },
    })
    const card = await client.json<{ url: string }>(conn, url(`/cards/${encodeURIComponent(cardId)}`, { fields: 'url' }))
    return { commentId: ref.make(cardId, action.id), url: `${card.url}#comment-${action.id}` }
  },

  async updateReport(conn, posted, text) {
    const [, actionId] = ref.parse(posted.commentId, 2, 'komentar Trello')
    await client.json(conn, url(`/actions/${encodeURIComponent(actionId)}/text`), { method: 'PUT', json: { value: text } })
    return posted
  },

  async setChecklist(conn, _cardId, stepIds) {
    for (const id of stepIds) {
      const [cardId, itemId] = ref.parse(id, 2, 'checklist Trello')
      await client.json(conn, url(`/cards/${encodeURIComponent(cardId)}/checkItem/${encodeURIComponent(itemId)}`), {
        method: 'PUT',
        json: { state: 'complete' },
      })
    }
  },
}
