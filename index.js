#!/usr/bin/env node

import { existsSync, mkdirSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'

const __dir = dirname(fileURLToPath(import.meta.url))

const skills = ['daily-report', 'daily-report-review', 'daily-report-summary']

function targetBase() {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return join(process.env.APPDATA, 'Antigravity', 'skills')
  }
  return join(homedir(), '.antigravity', 'skills')
}

const base = targetBase()

for (const skill of skills) {
  const src = join(__dir, 'skills', skill, 'SKILL.md')
  const dest = join(base, skill)

  if (!existsSync(src)) {
    console.warn(`⚠️  Skipping ${skill} — SKILL.md not found in package.`)
    continue
  }

  mkdirSync(dest, { recursive: true })
  copyFileSync(src, join(dest, 'SKILL.md'))
  console.log(`✅  Installed: ${skill}`)
}

console.log('')
console.log('🚀  Ready! Open Antigravity and type:')
console.log('      /daily-report          → full daily report')
console.log('      /daily-report-review   → code review of today\'s changes')
console.log('      /daily-report-summary  → compact standup/Slack summary')
