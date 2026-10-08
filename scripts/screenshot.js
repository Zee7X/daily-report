#!/usr/bin/env node

import { existsSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { spawnSync } from 'child_process'
import net from 'net'

function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    mode: 'auto', // 'auto', 'clipboard', 'browser'
    name: null,
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
    if (arg === '--clipboard' || arg === '-c') {
      options.mode = 'clipboard'
    } else if (arg === '--browser' || arg === '-b') {
      options.mode = 'browser'
    } else if (arg === '--name' || arg === '-n') {
      options.name = args[++i]
    } else if (arg === '--port' || arg === '-p') {
      options.port = parseInt(args[++i], 10)
      options.mode = 'browser'
    } else if (arg === '--url' || arg === '-u') {
      options.url = args[++i]
      options.mode = 'browser'
    } else if (arg === '--path') {
      options.path = args[++i]
    } else if (arg === '--output' || arg === '-o') {
      options.output = args[++i]
    } else if (arg === '--wait' || arg === '-w') {
      options.wait = parseInt(args[++i], 10)
    } else if (/^\d{2,5}$/.test(arg)) {
      options.port = parseInt(arg, 10)
      options.mode = 'browser'
    }
  }

  return options
}

function captureClipboard(destPath) {
  if (process.platform === 'win32') {
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($img) {
    $img.Save('${destPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
    $img.Dispose()
    exit 0
} else {
    exit 1
}
`
    const res = spawnSync('powershell', ['-NoProfile', '-Command', psScript])
    return res.status === 0 && existsSync(destPath)
  }
  return false
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
  const outputDir = resolve(process.cwd(), opts.output)
  mkdirSync(outputDir, { recursive: true })

  const baseFileName = opts.name || 'screenshot'
  const targetImage = join(outputDir, `${baseFileName}.png`)

  // Mode 1: Explicit Clipboard Capture
  if (opts.mode === 'clipboard') {
    console.log('Checking Windows clipboard for captured image...')
    const ok = captureClipboard(targetImage)
    if (ok) {
      console.log(`Saved Clipboard Screenshot: ${targetImage}`)
      process.exit(0)
    } else {
      console.error('No image found in clipboard. Press Win+Shift+S first.')
      process.exit(1)
    }
  }

  // Mode 2: Auto Mode (Checks clipboard first, then falls back to dev server port)
  if (opts.mode === 'auto') {
    const ok = captureClipboard(targetImage)
    if (ok) {
      console.log(`Saved Clipboard Screenshot: ${targetImage}`)
      process.exit(0)
    }
    // No image in clipboard, proceed to headless browser capture
  }

  // Mode 3: Headless Browser Capture (for public dev ports)
  const browserBin = resolveBrowserBinary()
  let targetUrl = opts.url

  if (!targetUrl) {
    if (opts.port) {
      targetUrl = `http://localhost:${opts.port}${opts.path.startsWith('/') ? opts.path : '/' + opts.path}`
    } else {
      const activePorts = await findActivePort()
      if (activePorts.length === 0) {
        console.error('No dev ports active and no clipboard image detected.')
        process.exit(1)
      }

      if (activePorts.length > 1) {
        console.log(`Detected active ports: ${activePorts.join(', ')}. Selected: ${activePorts[0]}`)
      }

      targetUrl = `http://localhost:${activePorts[0]}${opts.path.startsWith('/') ? opts.path : '/' + opts.path}`
    }
  }

  const lightPath = join(outputDir, 'light.png')
  const darkPath = join(outputDir, 'dark.png')

  console.log(`Target URL: ${targetUrl}`)

  // Light Mode
  spawnSync(browserBin, [
    '--headless',
    `--virtual-time-budget=${opts.wait}`,
    `--window-size=${opts.width},${opts.height}`,
    `--screenshot=${lightPath}`,
    targetUrl
  ])

  // Dark Mode
  spawnSync(browserBin, [
    '--headless',
    '--force-dark-mode',
    '--blink-settings=forceDarkModeEnabled=true',
    `--virtual-time-budget=${opts.wait}`,
    `--window-size=${opts.width},${opts.height}`,
    `--screenshot=${darkPath}`,
    targetUrl
  ])

  if (existsSync(lightPath) && existsSync(darkPath)) {
    console.log(`Captured Light Mode: ${lightPath}`)
    console.log(`Captured Dark Mode:  ${darkPath}`)
  } else {
    console.error('Failed to capture browser screenshots.')
    process.exit(1)
  }
}

main().catch(err => {
  console.error(`Screenshot error: ${err.message}`)
  process.exit(1)
})
