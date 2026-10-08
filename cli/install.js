#!/usr/bin/env node

import { existsSync, mkdirSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const skillSrc = join(__dirname, '..', 'skills', 'daily-report', 'SKILL.md')

function resolveTargetDir() {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return join(process.env.APPDATA, 'Antigravity', 'skills', 'daily-report')
  }
  return join(homedir(), '.antigravity', 'skills', 'daily-report')
}

const targetDir = resolveTargetDir()
const targetFile = join(targetDir, 'SKILL.md')

if (!existsSync(skillSrc)) {
  console.error('❌  SKILL.md tidak ditemukan di paket. Coba install ulang.')
  process.exit(1)
}

mkdirSync(targetDir, { recursive: true })
copyFileSync(skillSrc, targetFile)

console.log(`✅  Skill daily-report berhasil diinstall ke:`)
console.log(`    ${targetFile}`)
console.log(``)
console.log(`🚀  Ketik /daily-report di Antigravity untuk mulai membuat laporan harian.`)
