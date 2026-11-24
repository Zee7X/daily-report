import 'server-only'
import { env } from '../env'
import type { Connection } from '../repo/connections'
import { renderMarkdown } from '../report/render'
import { createClient, expiresIn, oauthToken } from './http'
import type { Board, Card, CardDetail, Column, Connector } from './types'

// Linear: team → workflow state → issue. Step = sub-issue (ditandai selesai = pindah ke state "completed").
// Gambar diunggah lewat fileUpload lalu ditampilkan langsung di komentar (markdown).

const ID = () => process.env.LINEAR_CLIENT_ID ?? ''
const SECRET = () => process.env.LINEAR_CLIENT_SECRET ?? ''
const API = () => (process.env.LINEAR_API_BASE || 'https://api.linear.app').replace(/\/$/, '')
const WEB = () => (process.env.LINEAR_AUTH_BASE || 'https://linear.app').replace(/\/$/, '')

const redirectUri = () => `${env.authUrl}/api/connectors/linear/callback`

async function refresh(conn: Connection) {
  const t = await oauthToken(
    `${API()}/oauth/token`,
    { grant_type: 'refresh_token', refresh_token: conn.refreshToken ?? '', client_id: ID(), client_secret: SECRET() },
    { label: 'Linear' },
  )
  return { accessToken: String(t.access_token), refreshToken: t.refresh_token ? String(t.refresh_token) : conn.refreshToken, expiresAt: expiresIn(t.expires_in) }
}

const client = createClient({ label: 'Linear', rate: { limit: 30, windowMs: 10_000 }, refresh })

async function gql<T>(conn: Connection, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await client.json<{ data?: T; errors?: { message: string }[] }>(conn, `${API()}/graphql`, {
    method: 'POST',
    json: { query, variables },
  })
  if (res.errors?.length || !res.data) throw new Error(`Linear: ${res.errors?.map((e) => e.message).join('; ') ?? 'tanpa data'}`)
  return res.data
}

type LIssue = { id: string; identifier: string; title: string; url: string; state: { name: string; type: string } }
const done = (type: string) => type === 'completed' || type === 'canceled'

export const linear: Connector = {
  id: 'linear',
  label: 'Linear',
  imagesAsFiles: true,
  setup: {
    url: 'https://linear.app/settings/api/applications/new',
    env: ['LINEAR_CLIENT_ID', 'LINEAR_CLIENT_SECRET'],
    steps: ['Create new OAuth application', 'Isi Callback URL dengan Redirect URI di bawah', 'Salin Client ID & Client secret ke environment'],
  },

  isConfigured: () => Boolean(ID() && SECRET()),
  redirectUri,

  authorizeUrl(state) {
    const qs = new URLSearchParams({
      client_id: ID(),
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: 'read,write',
      state,
      prompt: 'consent',
    })
    return `${WEB()}/oauth/authorize?${qs}`
  },

  async handleCallback(code) {
    const t = await oauthToken(
      `${API()}/oauth/token`,
      { grant_type: 'authorization_code', code, redirect_uri: redirectUri(), client_id: ID(), client_secret: SECRET() },
      { label: 'Linear' },
    )
    const accessToken = String(t.access_token)
    const temp = { id: 'tmp', accessToken } as Connection
    const d = await gql<{ viewer: { id: string; name: string; email: string; organization: { id: string; name: string } } }>(
      temp,
      'query { viewer { id name email organization { id name } } }',
    )
    return {
      connection: {
        accountId: d.viewer.id,
        accountName: d.viewer.name,
        accessToken,
        refreshToken: t.refresh_token ? String(t.refresh_token) : null,
        expiresAt: expiresIn(t.expires_in),
        meta: { email: d.viewer.email, accounts: [{ id: d.viewer.organization.id, name: d.viewer.organization.name }] },
      },
      identity: { email: d.viewer.email, name: d.viewer.name, verified: false },
    }
  },

  async listBoards(conn) {
    const d = await gql<{ teams: { nodes: { id: string; name: string; key: string }[] } }>(conn, 'query { teams(first: 100) { nodes { id name key } } }')
    const org = conn.meta.accounts?.[0]?.name ?? 'Linear'
    return d.teams.nodes.map<Board>((t) => ({ id: t.id, name: `${t.name} (${t.key})`, project: org, account: conn.accountName, url: null }))
  },

  async listColumns(conn, boardId) {
    const d = await gql<{ team: { states: { nodes: { id: string; name: string; position: number }[] } } }>(
      conn,
      'query($id: String!) { team(id: $id) { states(first: 100) { nodes { id name position } } } }',
      { id: boardId },
    )
    return d.team.states.nodes
      .slice()
      .sort((a, b) => a.position - b.position)
      .map<Column>((s) => ({ id: s.id, title: s.name, cardsCount: -1 }))
  },

  async listCards(conn, boardId, filter) {
    const f: Record<string, unknown> = { team: { id: { eq: boardId } } }
    if (filter?.columnId) f.state = { id: { eq: filter.columnId } }
    const d = await gql<{ issues: { nodes: LIssue[] } }>(
      conn,
      'query($f: IssueFilter) { issues(first: 100, filter: $f, orderBy: updatedAt) { nodes { id identifier title url state { name type } } } }',
      { f },
    )
    return d.issues.nodes.map<Card>((i) => ({
      id: i.id,
      title: `${i.identifier} ${i.title}`,
      url: i.url,
      column: i.state.name,
      completed: done(i.state.type),
    }))
  },

  async getCard(conn, cardId) {
    const d = await gql<{
      issue: LIssue & {
        description: string | null
        team: { name: string }
        comments: { nodes: { id: string; body: string; createdAt: string; user: { name: string } | null }[] }
        children: { nodes: { id: string; title: string; state: { type: string } }[] }
      }
    }>(
      conn,
      `query($id: String!) { issue(id: $id) {
        id identifier title url description state { name type } team { name }
        comments(first: 50) { nodes { id body createdAt user { name } } }
        children(first: 50) { nodes { id title state { type } } }
      } }`,
      { id: cardId },
    )
    const i = d.issue
    return {
      id: i.id,
      title: `${i.identifier} ${i.title}`,
      url: i.url,
      column: i.state.name,
      completed: done(i.state.type),
      project: i.team.name,
      description: i.description ?? '',
      steps: i.children.nodes.map((c) => ({ id: c.id, title: c.title, completed: done(c.state.type) })),
      comments: i.comments.nodes.map((c) => ({ id: c.id, author: c.user?.name ?? '', createdAt: c.createdAt, text: c.body })),
    } satisfies CardDetail
  },

  parseCardUrl(raw) {
    // https://linear.app/<org>/issue/ABC-123/judul → issue(id: "ABC-123") menerima identifier
    const m = /^https:\/\/linear\.app\/[^/]+\/issue\/([A-Za-z0-9]+-\d+)/.exec(raw.trim())
    return m ? m[1] : null
  },

  renderReport(body, images, labels) {
    return renderMarkdown(body, images, labels, (img) => img.ref?.sgid ?? null)
  },

  async uploadImage(conn, _cardId, file) {
    const d = await gql<{ fileUpload: { success: boolean; uploadFile: { uploadUrl: string; assetUrl: string; headers: { key: string; value: string }[] } } }>(
      conn,
      'mutation($ct: String!, $fn: String!, $size: Int!) { fileUpload(contentType: $ct, filename: $fn, size: $size) { success uploadFile { uploadUrl assetUrl headers { key value } } } }',
      { ct: file.mime, fn: file.name, size: file.data.length },
    )
    const u = d.fileUpload.uploadFile
    const headers: Record<string, string> = { 'Content-Type': file.mime, 'Cache-Control': 'public, max-age=31536000' }
    for (const h of u.headers) headers[h.key] = h.value
    const res = await fetch(u.uploadUrl, { method: 'PUT', headers, body: new Uint8Array(file.data) })
    if (!res.ok) throw new Error(`Linear upload gagal (${res.status})`)
    return u.assetUrl
  },

  async postReport(conn, cardId, text) {
    const d = await gql<{ commentCreate: { comment: { id: string; url: string } } }>(
      conn,
      'mutation($issueId: String!, $body: String!) { commentCreate(input: { issueId: $issueId, body: $body }) { success comment { id url } } }',
      { issueId: cardId, body: text },
    )
    return { commentId: d.commentCreate.comment.id, url: d.commentCreate.comment.url }
  },

  async updateReport(conn, posted, text) {
    const d = await gql<{ commentUpdate: { comment: { id: string; url: string } } }>(
      conn,
      'mutation($id: String!, $body: String!) { commentUpdate(id: $id, input: { body: $body }) { success comment { id url } } }',
      { id: posted.commentId, body: text },
    )
    return { commentId: posted.commentId, url: d.commentUpdate.comment.url }
  },

  async setChecklist(conn, cardId, stepIds) {
    const d = await gql<{ issue: { team: { states: { nodes: { id: string; type: string; position: number }[] } } } }>(
      conn,
      'query($id: String!) { issue(id: $id) { team { states(first: 100) { nodes { id type position } } } } }',
      { id: cardId },
    )
    const doneState = d.issue.team.states.nodes.filter((s) => s.type === 'completed').sort((a, b) => a.position - b.position)[0]
    if (!doneState) throw new Error('Tim Linear ini tidak punya state "completed"')
    for (const id of stepIds) {
      await gql(conn, 'mutation($id: String!, $s: String!) { issueUpdate(id: $id, input: { stateId: $s }) { success } }', { id, s: doneState.id })
    }
  },
}
