// Antarmuka connector (PRD 8.4, FR-15). Basecamp adalah implementasi pertama;
// Jira/Trello/dll. cukup menambah implementasi baru tanpa mengubah aplikasi.

import type { Connection, ConnectionInput } from '../repo/connections'

export type Board = { id: string; name: string; project: string; account: string; url: string | null }
/** cardsCount -1 = tidak diketahui (tidak semua tool menyediakan jumlah kartu per kolom). */
export type Column = { id: string; title: string; cardsCount: number }
export type Card = { id: string; title: string; url: string | null; column: string; completed: boolean }
export type Step = { id: string; title: string; completed: boolean }
export type Comment = { id: string; author: string; createdAt: string; text: string }
export type CardDetail = Card & {
  project: string
  description: string
  steps: Step[]
  comments: Comment[]
}

/** verified = penyedia menjamin pemilik akun menguasai email ini (dipakai untuk login & pemulihan akun). */
export type Identity = { email: string; name: string; verified?: boolean }

export type ImageRef = { sgid: string; caption: string }
export type PostedRef = { commentId: string; url: string | null }

export type RenderableImage = { id: string; number: number; caption: string; ref?: ImageRef }

export type ConnectorSetup = {
  /** Halaman tempat pemilik instalasi mendaftarkan aplikasi OAuth. */
  url: string
  /** Variabel environment yang harus diisi. */
  env: string[]
  /** Langkah singkat untuk pemilik instalasi. */
  steps: string[]
}

export interface Connector {
  id: 'basecamp' | 'jira' | 'trello' | 'github' | 'linear' | 'clickup' | (string & {})
  label: string
  /** Bisa dipakai sebagai "Login with …" (hanya penyedia yang menjamin email terverifikasi). */
  supportsLogin?: boolean
  /** Apakah tool mendukung lampiran gambar asli di komentar/kartu. */
  imagesAsFiles: boolean
  setup: ConnectorSetup
  isConfigured(): boolean
  /** Redirect URI OAuth yang harus didaftarkan di tool (ditampilkan di halaman Koneksi). */
  redirectUri(): string
  /** PKCE dipakai bila penyedia mendukungnya. */
  usesPkce?: boolean
  /** "fragment": token dikembalikan di #hash URL (Trello), dibaca halaman /oauth/:provider. */
  callbackMode?: 'query' | 'fragment'
  authorizeUrl(state: string, pkce?: { challenge: string }): string
  handleCallback(code: string, ctx?: { verifier?: string }): Promise<{ connection: ConnectionInput; identity: Identity }>
  listBoards(conn: Connection): Promise<Board[]>
  listColumns(conn: Connection, boardId: string): Promise<Column[]>
  listCards(conn: Connection, boardId: string, filter?: { columnId?: string }): Promise<Card[]>
  getCard(conn: Connection, cardId: string): Promise<CardDetail>
  /** Mengubah URL kartu di tool (mis. tautan Basecamp) menjadi ID kartu connector (FR-4). */
  parseCardUrl(url: string, conn: Connection): string | null
  /** Format isi laporan sesuai tool tujuan (HTML Basecamp, ADF Jira, dll.). */
  renderReport(
    body: import('../report/types').ReportBody,
    images: RenderableImage[],
    labels: import('../report/render').ImageLabels,
  ): string
  /** Mengunggah gambar sebagai lampiran di tool tujuan, mengembalikan referensi lampiran (sgid). */
  uploadImage?(conn: Connection, cardId: string, file: { name: string; mime: string; data: Buffer }): Promise<string>
  postReport(conn: Connection, cardId: string, html: string): Promise<PostedRef>
  updateReport?(conn: Connection, ref: PostedRef, html: string): Promise<PostedRef>
  setChecklist?(conn: Connection, cardId: string, stepIds: string[]): Promise<void>
}
