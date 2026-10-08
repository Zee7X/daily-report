#!/usr/bin/env node

import { existsSync, mkdirSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'

const __dir = dirname(fileURLToPath(import.meta.url))
const skills = ['daily-report', 'daily-report-review', 'daily-report-summary']

function getTargetDirs() {
  const home = homedir()
  const dirs = []

  dirs.push(join(home, '.gemini', 'config', 'skills'))

  if (process.platform === 'win32' && process.env.APPDATA) {
    dirs.push(join(process.env.APPDATA, 'Antigravity', 'skills'))
  }

  dirs.push(join(home, '.antigravity', 'skills'))

  return dirs
}

const targetDirs = getTargetDirs()

for (const base of targetDirs) {
  try {
    mkdirSync(base, { recursive: true })
    for (const skill of skills) {
      const src = join(__dir, 'skills', skill, 'SKILL.md')
      const dest = join(base, skill)

      if (!existsSync(src)) continue

      mkdirSync(dest, { recursive: true })
      copyFileSync(src, join(dest, 'SKILL.md'))

      // Copy screenshot utility into daily-report
      if (skill === 'daily-report') {
        const scriptSrc = join(__dir, 'scripts', 'screenshot.js')
        const scriptDestDir = join(dest, 'scripts')
        if (existsSync(scriptSrc)) {
          mkdirSync(scriptDestDir, { recursive: true })
          copyFileSync(scriptSrc, join(scriptDestDir, 'screenshot.js'))
        }
      }

      console.log(`Installed: ${skill} -> ${dest}`)
    }
  } catch (err) {
    // Ignore inaccessible directories
  }
}

console.log('')
console.log('Installation completed.')
console.log('Restart or reload Antigravity, then use:')
console.log('  /daily-report [port]')
console.log('  /daily-report-review')
console.log('  /daily-report-summary')
