/**
 * Permanent native ASAR injector for ZCode Desktop.
 * Bundles dist/zcode-skins.bundle.js directly into ZCode's app.asar.
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync, spawn } from 'node:child_process'

const ZCODE_DIR = 'D:/Program Files/ZCode'
const RESOURCES_DIR = path.join(ZCODE_DIR, 'resources')
const ASAR_PATH = path.join(RESOURCES_DIR, 'app.asar')
const ORIGINAL_ASAR = path.join(RESOURCES_DIR, 'app.asar.original')
const PROJECT_ROOT = path.resolve(import.meta.dirname, '..')
const BUNDLE_PATH = path.join(PROJECT_ROOT, 'dist', 'zcode-skins.bundle.js')

if (!fs.existsSync(ASAR_PATH)) {
  console.error(`[install] ZCode not found at: ${ASAR_PATH}`)
  process.exit(1)
}

if (!fs.existsSync(BUNDLE_PATH)) {
  console.log('[install] Building latest zcode-skins bundle...')
  execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'inherit' })
}

if (!fs.existsSync(ORIGINAL_ASAR)) {
  console.log(`[install] Backing up original app.asar to: ${ORIGINAL_ASAR}`)
  fs.copyFileSync(ASAR_PATH, ORIGINAL_ASAR)
}

const TEMP_DIR = path.join(PROJECT_ROOT, '.tmp_asar')
try {
  if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true, force: true })
  console.log('[install] Extracting official base...')
  execSync(`npx asar extract "${ORIGINAL_ASAR}" "${TEMP_DIR}"`, { stdio: 'ignore' })

  console.log('[install] Injecting zcode-skins bundle...')
  const targetJs = path.join(TEMP_DIR, 'out', 'renderer', 'zcode-skins.bundle.js')
  fs.copyFileSync(BUNDLE_PATH, targetJs)

  const htmlPath = path.join(TEMP_DIR, 'out', 'renderer', 'index.html')
  let html = fs.readFileSync(htmlPath, 'utf8')
  const tag = '<script src="./zcode-skins.bundle.js"></script>'
  if (!html.includes(tag)) {
    html = html.replace('</body>', `  ${tag}\n</body>`)
    fs.writeFileSync(htmlPath, html, 'utf8')
  }

  const outAsar = path.join(PROJECT_ROOT, 'dist', 'app.asar')
  console.log('[install] Repacking with official asar tool...')
  execSync(`npx asar pack "${TEMP_DIR}" "${outAsar}"`, { stdio: 'ignore' })

  console.log('[install] Stopping running ZCode instance...')
  execSync('powershell.exe -NoProfile -Command "Stop-Process -Name ZCode -Force -ErrorAction SilentlyContinue"')
  
  console.log('[install] Applying new app.asar...')
  fs.copyFileSync(outAsar, ASAR_PATH)

  console.log('[install] Launching ZCode Desktop...')
  execSync(`powershell.exe -NoProfile -Command "Start-Process '${path.join(ZCODE_DIR, 'ZCode.exe')}' -WorkingDirectory '${ZCODE_DIR}'"`)

  console.log('[install] ✨ ZCode Desktop successfully updated with permanent zcode-skins!')
} finally {
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true })
  }
}
