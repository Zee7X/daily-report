#!/usr/bin/env node

import { existsSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { spawnSync } from 'child_process'
import net from 'net'

function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    port: null,
    url: null,
    path: '/',
    output: 'reports/screenshots',
    wait: 3500,
    width: 1280,
    height: 800
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--port' || arg === '-p') {
      options.port = parseInt(args[++i], 10)
    } else if (arg === '--url' || arg === '-u') {
      options.url = args[++i]
    } else if (arg === '--path') {
      options.path = args[++i]
    } else if (arg === '--output' || arg === '-o') {
      options.output = args[++i]
    } else if (arg === '--wait' || arg === '-w') {
      options.wait = parseInt(args[++i], 10)
    } else if (/^\d{2,5}$/.test(arg)) {
      options.port = parseInt(arg, 10)
    }
  }

  return options
}

async function checkPort(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ port, host: '127.0.0.1', timeout: 250 })
    socket.on('connect', () => {
      socket.destroy()
      resolve(port)
    })
    socket.on('error', () => resolve(null))
    socket.on('timeout', () => {
      socket.destroy()
      resolve(null)
    })
  })
}

async function findActivePort() {
  const candidatePorts = [8001, 8000, 3000, 5173, 8080, 8888, 4321, 5000, 80]
  const results = await Promise.all(candidatePorts.map(checkPort))
  return results.filter(Boolean)
}

function resolveBrowserBinary() {
  const isWindows = process.platform === 'win32'

  if (isWindows) {
    const candidates = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ]
    for (const bin of candidates) {
      if (existsSync(bin)) return bin
    }
  } else if (process.platform === 'darwin') {
    const candidates = [
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ]
    for (const bin of candidates) {
      if (existsSync(bin)) return bin
    }
  } else {
    const candidates = ['google-chrome', 'chromium', 'microsoft-edge', 'chromium-browser']
    for (const bin of candidates) {
      const check = spawnSync('which', [bin])
      if (check.status === 0) return bin
    }
  }

  throw new Error('No compatible browser (Edge or Chrome) found.')
}

async function main() {
  const opts = parseArgs()
  const browserBin = resolveBrowserBinary()

  let targetUrl = opts.url

  if (!targetUrl) {
    if (opts.port) {
      targetUrl = `http://localhost:${opts.port}${opts.path.startsWith('/') ? opts.path : '/' + opts.path}`
    } else {
      const activePorts = await findActivePort()
      if (activePorts.length === 0) {
        console.error('Error: No active localhost dev servers detected. Pass --port <number> explicitly.')
        process.exit(1)
      }

      if (activePorts.length > 1) {
        console.log(`Detected multiple active ports: ${activePorts.join(', ')}. Selected: ${activePorts[0]}`)
      }

      targetUrl = `http://localhost:${activePorts[0]}${opts.path.startsWith('/') ? opts.path : '/' + opts.path}`
    }
  }

  const outputDir = resolve(process.cwd(), opts.output)
  mkdirSync(outputDir, { recursive: true })

  const lightPath = join(outputDir, 'light.png')
  const darkPath = join(outputDir, 'dark.png')

  console.log(`Target URL: ${targetUrl}`)

  // 1. Light Mode Capture
  const lightArgs = [
    '--headless',
    `--virtual-time-budget=${opts.wait}`,
    `--window-size=${opts.width},${opts.height}`,
    `--screenshot=${lightPath}`,
    targetUrl
  ]
  spawnSync(browserBin, lightArgs)

  // 2. Dark Mode Capture
  const darkArgs = [
    '--headless',
    '--force-dark-mode',
    '--blink-settings=forceDarkModeEnabled=true',
    `--virtual-time-budget=${opts.wait}`,
    `--window-size=${opts.width},${opts.height}`,
    `--screenshot=${darkPath}`,
    targetUrl
  ]
  spawnSync(browserBin, darkArgs)

  if (existsSync(lightPath) && existsSync(darkPath)) {
    console.log(`Captured Light Mode: ${lightPath}`)
    console.log(`Captured Dark Mode:  ${darkPath}`)
  } else {
    console.error('Failed to capture one or both screenshots.')
    process.exit(1)
  }
}

main().catch(err => {
  console.error(`Screenshot failed: ${err.message}`)
  process.exit(1)
})
