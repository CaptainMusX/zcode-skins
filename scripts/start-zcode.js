/**
 * Start ZCode Desktop with zcode-skins injected via Chrome DevTools Protocol (CDP).
 * Zero-touch, safe and works seamlessly without modifying any app files.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const pluginPath = path.join(rootDir, 'plugin.js')

if (!fs.existsSync(pluginPath)) {
  console.error('[start-zcode] plugin.js not found. Please run "npm run build" first.')
  process.exit(1)
}

const pluginSource = fs.readFileSync(pluginPath, 'utf8')

// Find ZCode executable
const candidatePaths = [
  'D:/Program Files/ZCode/ZCode.exe',
  'C:/Program Files/ZCode/ZCode.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Programs/ZCode/ZCode.exe')
]

let zcodeExe = candidatePaths.find(p => fs.existsSync(p))
if (!zcodeExe) {
  console.error('[start-zcode] Could not find ZCode.exe. Checked:', candidatePaths)
  process.exit(1)
}

console.log(`[start-zcode] Found ZCode at: ${zcodeExe}`)

const DEBUG_PORT = 9388
console.log(`[start-zcode] Launching ZCode with remote debugging port: ${DEBUG_PORT}...`)

const proc = spawn(zcodeExe, [`--remote-debugging-port=${DEBUG_PORT}`], {
  detached: true,
  stdio: 'ignore'
})
proc.unref()

// Helper to poll CDP targets
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = ''
      res.on('data', chunk => (data += chunk))
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(e)
        }
      })
    }).on('error', reject)
  })
}

async function connectAndInject() {
  console.log('[start-zcode] Waiting for ZCode DevTools endpoint...')
  let targets = null
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000))
    try {
      targets = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json`)
      if (Array.isArray(targets) && targets.length > 0) break
    } catch {}
  }

  if (!targets || targets.length === 0) {
    console.error('[start-zcode] Failed to connect to ZCode debugging port. Is ZCode already running?')
    process.exit(1)
  }

  console.log(`[start-zcode] Found ${targets.length} target(s). Locating main window...`)
  const mainTarget = targets.find(t => t.type === 'page' && !t.url.includes('devtools://')) || targets[0]

  if (!mainTarget || !mainTarget.webSocketDebuggerUrl) {
    console.error('[start-zcode] No WebSocket debugger URL available for target:', mainTarget)
    process.exit(1)
  }

  console.log(`[start-zcode] Connecting to target WebSocket: ${mainTarget.title || mainTarget.url}`)
  
  // Use built-in WebSocket if Node >= 22
  const WebSocketImpl = globalThis.WebSocket || (await import('ws')).default
  const ws = new WebSocketImpl(mainTarget.webSocketDebuggerUrl)

  ws.onopen = () => {
    console.log('[start-zcode] Connected to CDP! Enabling Page domain...')
    let id = 1
    
    // Enable Page
    ws.send(JSON.stringify({ id: id++, method: 'Page.enable' }))

    // Inject on future document reloads/navigations
    ws.send(JSON.stringify({
      id: id++,
      method: 'Page.addScriptToEvaluateOnNewDocument',
      params: { source: pluginSource }
    }))

    // Inject immediately into currently loaded document
    ws.send(JSON.stringify({
      id: id++,
      method: 'Runtime.evaluate',
      params: {
        expression: pluginSource,
        userGesture: true,
        awaitPromise: true
      }
    }))

    console.log('[start-zcode] ✨ Successfully injected zcode-skins into ZCode Desktop!')
    console.log('[start-zcode] You can now enjoy themes, custom wallpapers, and glassmorphism in ZCode.')
    
    setTimeout(() => {
      ws.close()
      process.exit(0)
    }, 2000)
  }

  ws.onerror = err => {
    console.error('[start-zcode] WebSocket error:', err)
  }
}

connectAndInject()
