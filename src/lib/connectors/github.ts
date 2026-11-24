import 'server-only'
import { env } from '../env'
import type { Connection } from '../repo/connections'
import { renderMarkdown } from '../report/render'
import { createClient, oauthToken, ref } from './http'
import type { Board, Card, CardDetail, Connector, Step } from './types'

// GitHub Issues: repository → Open/Closed → issue. Step = task list "- [ ]" di deskripsi issue.
// API GitHub tidak menyediakan upload gambar ke komentar, jadi gambar ditulis sebagai rujukan [Gambar N].

const ID = () => process.env.GITHUB_CLIENT_ID ?? ''
const SECRET = () => process.env.GITHUB_CLIENT_SECRET ?? ''
const API = () => (process.env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/$/, '')
const WEB = () => (process.env.GITHUB_AUTH_BASE || 'https://github.com').replace(/\/$/, '')

const client = createClient({
  label: 'GitHub',
  rate: { limit: 60, windowMs: 10_000 },
  userAgent: 'daily-report',
  authHeaders: (conn) => ({ Authorization: `Bearer ${conn.accessToken}`, 'X-GitHub-Api-Version': '2022-11-28' }),
})

type GRepo = { full_name: string; name: string; owner: { login: string }; html_url: string; has_issues: boolean; archived: boolean }
type GIssue = { number: number; title: string; html_url: string; state: string; body: string | null; pull_request?: unknown }
type GComment = { id: number; body: string; created_at: string; user: { login: string }; html_url: string }

const TASK = /^(\s*[-*]\s+\[)([ xX])(\]\s+)(.*)$/

function tasks(body: string | null) {
  return (body ?? '').split('\n').flatMap((line, lineNo) => {
    const m = TASK.exec(line)
    return m ? [{ lineNo, title: m[4].trim(), done: m[2].toLowerCase() === 'x' }] : []
  })
}

const MAX_COMMENT = 60000

/** ID board = owner~repo (tanpa '/', aman di path URL). */
const repoId = (fullName: string) => ref.make(...(fullName.split('/') as [string, string]))
const repoPath = (id: string) => ref.parse(id, 2, 'repository GitHub').join('/')

export const github: Connector = {
  id: 'github',
  label: 'GitHub',
  supportsLogin: true,
  imagesAsFiles: false,
  setup: {
    url: 'https://github.com/settings/applications/new',
    env: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
    steps: ['Register a new OAuth App', 'Isi Authorization callback URL dengan Redirect URI di bawah', 'Generate client secret, salin keduanya ke environment'],
  },

  isConfigured: () => Boolean(ID() && SECRET()),
  redirectUri: () => `${env.authUrl}/api/connectors/github/callback`,

  authorizeUrl(state) {
    const qs = new URLSearchParams({
      client_id: ID(),
      redirect_uri: this.redirectUri(),
      scope: 'repo read:user user:email',
      state,
      allow_signup: 'false',
    })
    return `${WEB()}/login/oauth/authorize?${qs}`
  },

  async handleCallback(code) {
    const t = await oauthToken(
      `${WEB()}/login/oauth/access_token`,
      { client_id: ID(), client_secret: SECRET(), code, redirect_uri: this.redirectUri() },
      { label: 'GitHub', as: 'json' },
    )
    const accessToken = String(t.access_token)
    const temp = { id: 'tmp', accessToken } as Connection
    const me = await client.json<{ id: number; login: string; name: string | null }>(temp, `${API()}/user`)
    const emails = await client
      .json<{ email: string; primary: boolean; verified: boolean }[]>(temp, `${API()}/user/emails`)
      .catch(() => [])
    const primary = emails.find((e) => e.primary && e.verified)
    return {
      connection: {
        accountId: String(me.id),
        accountName: me.name || me.login,
        accessToken,
        refreshToken: null,
        expiresAt: null,
        meta: { email: primary?.email, accounts: [{ id: String(me.id), name: me.login }] },
      },
      identity: {
        email: primary?.email ?? `${me.login}@users.noreply.github.com`,
        name: me.name || me.login,
        verified: Boolean(primary),
      },
    }
  },

  async listBoards(conn) {
    const repos: GRepo[] = []
    for (let page = 1; page <= 3; page++) {
      const batch = await client.json<GRepo[]>(conn, `${API()}/user/repos?per_page=100&sort=updated&page=${page}`)
      repos.push(...batch)
      if (batch.length < 100) break
    }
    return repos
      .filter((r) => r.has_issues && !r.archived)
      .map<Board>((r) => ({ id: repoId(r.full_name), name: r.name, project: r.owner.login, account: conn.accountName, url: r.html_url }))
  },

  async listColumns(_conn, boardId) {
    return [
      { id: ref.make(boardId, 'open'), title: 'Open', cardsCount: -1 },
      { id: ref.make(boardId, 'closed'), title: 'Closed', cardsCount: -1 },
    ]
  },

  async listCards(conn, boardId, filter) {
    const state = filter?.columnId ? ref.parse(filter.columnId, 2, 'kolom GitHub')[1] : 'open'
    const repo = repoPath(boardId)
    const issues = await client.json<GIssue[]>(conn, `${API()}/repos/${repo}/issues?state=${state}&per_page=100&sort=updated`)
    return issues
      .filter((i) => !i.pull_request)
      .map<Card>((i) => ({ id: ref.make(...(repo.split('/') as [string, string]), i.number), title: `#${i.number} ${i.title}`, url: i.html_url, column: i.state, completed: i.state === 'closed' }))
  },

  async getCard(conn, cardId) {
    const [owner, name, num] = ref.parse(cardId, 3, 'issue GitHub')
    const repo = `${owner}/${name}`
    const issue = await client.json<GIssue>(conn, `${API()}/repos/${repo}/issues/${num}`)
    const comments = await client.json<GComment[]>(conn, `${API()}/repos/${repo}/issues/${num}/comments?per_page=100`)
    const steps: Step[] = tasks(issue.body).map((t) => ({ id: ref.make(owner, name, num, t.lineNo), title: t.title, completed: t.done }))
    return {
      id: cardId,
      title: `#${issue.number} ${issue.title}`,
      url: issue.html_url,
      column: issue.state,
      completed: issue.state === 'closed',
      project: repo,
      description: issue.body ?? '',
      steps,
      comments: comments.map((c) => ({ id: String(c.id), author: c.user.login, createdAt: c.created_at, text: c.body })),
    } satisfies CardDetail
  },

  parseCardUrl(raw) {
    const m = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/(?:issues|pull)\/(\d+)/.exec(raw.trim())
    return m ? ref.make(...(m[1].split('/') as [string, string]), m[2]) : null
  },

  renderReport(body, images, labels) {
    const md = renderMarkdown(body, images, labels)
    return md.length > MAX_COMMENT ? `${md.slice(0, MAX_COMMENT)}\n\n…` : md
  },

  async postReport(conn, cardId, text) {
    const [owner, name, num] = ref.parse(cardId, 3, 'issue GitHub')
    const c = await client.json<GComment>(conn, `${API()}/repos/${owner}/${name}/issues/${num}/comments`, {
      method: 'POST',
      json: { body: text },
    })
    return { commentId: ref.make(owner, name, c.id), url: c.html_url }
  },

  async updateReport(conn, posted, text) {
    const [owner, name, id] = ref.parse(posted.commentId, 3, 'komentar GitHub')
    const c = await client.json<GComment>(conn, `${API()}/repos/${owner}/${name}/issues/comments/${id}`, { method: 'PATCH', json: { body: text } })
    return { commentId: posted.commentId, url: c.html_url }
  },

  async setChecklist(conn, cardId, stepIds) {
    const [owner, name, num] = ref.parse(cardId, 3, 'issue GitHub')
    const repo = `${owner}/${name}`
    const lines = new Set(stepIds.map((s) => Number(ref.parse(s, 4, 'task GitHub')[3])))
    const issue = await client.json<GIssue>(conn, `${API()}/repos/${repo}/issues/${num}`)
    const body = (issue.body ?? '')
      .split('\n')
      .map((line, i) => (lines.has(i) ? line.replace(TASK, (_m, a: string, _x: string, b: string, t: string) => `${a}x${b}${t}`) : line))
      .join('\n')
    await client.json(conn, `${API()}/repos/${repo}/issues/${num}`, { method: 'PATCH', json: { body } })
  },
}
