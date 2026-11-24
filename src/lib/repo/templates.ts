import 'server-only'
import { randomUUID } from 'node:crypto'
import { exec, json, one, query } from '../db'
import type { TemplateRules, TemplateSection } from '../report/types'

export type Template = {
  id: string
  name: string
  kind: string
  sections: TemplateSection[]
  rules: TemplateRules
  updatedAt: Date
}

type Row = { id: string; name: string; kind: string; sections: unknown; rules: unknown; updated_at: Date }

const map = (r: Row): Template => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  sections: json(r.sections, []),
  rules: { tone: '', rules: [], intro: '', closing: '', ...json<Partial<TemplateRules>>(r.rules, {}) },
  updatedAt: r.updated_at,
})

const DEFAULTS: Omit<Template, 'id' | 'updatedAt'>[] = [
  {
    name: 'Progres modul',
    kind: 'module_progress',
    sections: [
      { title: 'Selesai dikerjakan', hint: 'Fitur/perbaikan yang sudah jalan, satu poin per perubahan.' },
      { title: 'Sedang dikerjakan', hint: 'Yang masih berjalan beserta perkiraan sisa pekerjaan.' },
      { title: 'Kendala dan catatan', hint: 'Blocker, keputusan yang dibutuhkan, atau hal yang perlu diketahui.' },
      { title: 'Siap diuji QA', hint: 'Halaman/menu yang bisa langsung dicek QA.' },
    ],
    rules: {
      tone: 'Bahasa Indonesia yang rapi dan singkat. Kalimat aktif, tanpa basa-basi.',
      rules: [
        'Satu poin berisi satu perubahan yang bisa diverifikasi.',
        'Sebut nama halaman atau menu persis seperti di aplikasi.',
        'Rujuk gambar dengan format (Gambar N).',
        'Jangan menuliskan password, token, atau kredensial apa pun.',
      ],
      intro: 'Halo, berikut progres modul hari ini:',
      closing: 'Terima kasih.',
    },
  },
  {
    name: 'Tracking staging',
    kind: 'staging_tracking',
    sections: [
      { title: 'Sudah di staging', hint: 'Fitur yang sudah ter-deploy ke staging.' },
      { title: 'Belum di-deploy', hint: 'Fitur yang selesai di lokal tapi belum naik.' },
      { title: 'Perlu dicek QA', hint: 'Skenario uji yang disarankan.' },
      { title: 'Catatan deploy', hint: 'Migrasi, konfigurasi, atau urutan deploy.' },
    ],
    rules: {
      tone: 'Ringkas dan faktual, cocok dibaca QA dan PM.',
      rules: ['Kelompokkan per modul.', 'Rujuk gambar dengan format (Gambar N).', 'Jangan menuliskan kredensial.'],
      intro: 'Update tracking staging:',
      closing: '',
    },
  },
]

export async function listTemplates(userId: string): Promise<Template[]> {
  let rows = await query<Row>('SELECT * FROM templates WHERE user_id = ? ORDER BY created_at, name', [userId])
  if (rows.length === 0) {
    for (const t of DEFAULTS) await createTemplate(userId, t)
    rows = await query<Row>('SELECT * FROM templates WHERE user_id = ? ORDER BY created_at, name', [userId])
  }
  return rows.map(map)
}

export async function getTemplate(userId: string, id: string): Promise<Template | null> {
  const r = await one<Row>('SELECT * FROM templates WHERE id = ? AND user_id = ?', [id, userId])
  return r ? map(r) : null
}

export type TemplateInput = Omit<Template, 'id' | 'updatedAt'>

export async function createTemplate(userId: string, t: TemplateInput): Promise<string> {
  const id = randomUUID()
  await exec('INSERT INTO templates (id, user_id, name, kind, sections, rules) VALUES (?, ?, ?, ?, ?, ?)', [
    id,
    userId,
    t.name,
    t.kind,
    JSON.stringify(t.sections),
    JSON.stringify(t.rules),
  ])
  return id
}

export async function updateTemplate(userId: string, id: string, t: TemplateInput): Promise<boolean> {
  const res = await exec(
    'UPDATE templates SET name = ?, kind = ?, sections = ?, rules = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND user_id = ?',
    [t.name, t.kind, JSON.stringify(t.sections), JSON.stringify(t.rules), id, userId],
  )
  return res.affectedRows > 0
}

export async function deleteTemplate(userId: string, id: string): Promise<boolean> {
  const res = await exec('DELETE FROM templates WHERE id = ? AND user_id = ?', [id, userId])
  return res.affectedRows > 0
}
