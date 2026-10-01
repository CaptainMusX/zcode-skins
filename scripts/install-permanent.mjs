/**
 * Permanently install zcode-skins into ZCode Desktop.
 *
 * Patches ZCode's app.asar so the plugin loads on every launch — no launcher,
 * no debug port, no manual step. The original archive is backed up first and
 * `restore:official` puts it back byte-for-byte.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

const ZCODE_DIR = process.env.ZCODE_DIR || 'D:/Program Files/ZCode'
const RESOURCES = path.join(ZCODE_DIR, 'resources')
const ASAR = path.join(RESOURCES, 'app.asar')
const BACKUP = path.join(RESOURCES, 'app.asar.zcode-skins-backup')
const BUNDLE = path.join(PROJECT_ROOT, 'dist', 'zcode-skins.bundle.js')
const PATCHED = path.join(PROJECT_ROOT, 'dist', 'app.patched.asar')
const EXE = path.join(ZCODE_DIR, 'ZCode.exe')

const restart = process.argv.includes('--restart')

const zcodeRunning = () => {
  try {
    const out = execSync('powershell.exe -NoProfile -Command "Get-Process -Name ZCode -ErrorAction SilentlyContinue | Measure-Object | Select-Object -ExpandProperty Count"', { encoding: 'utf8' })
    return Number(out.trim()) > 0
  } catch { return false }
}

const stopZCode = () => {
  execSync('powershell.exe -NoProfile -Command "Stop-Process -Name ZCode -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' })
}

if (!fs.existsSync(ASAR)) {
  console.error(`[install] ZCode not found: ${ASAR}`)
  process.exit(1)
}

if (zcodeRunning()) {
  if (!restart) {
    console.error('[install] ZCode is running. Close it first, or pass --restart.')
    process.exit(2)
  }
  console.log('[install] Stopping ZCode...')
  stopZCode()
  execSync('powershell.exe -NoProfile -Command "Start-Sleep -Seconds 2"', { stdio: 'ignore' })
}

// Always patch from the pristine original so repeat runs are idempotent.
const source = fs.existsSync(BACKUP) ? BACKUP : ASAR
if (!fs.existsSync(BACKUP)) {
  console.log('[install] Backing up original app.asar...')
  fs.copyFileSync(ASAR, BACKUP)
} else {
  console.log('[install] Using existing pristine backup as patch source')
}

if (!fs.existsSync(BUNDLE)) {
  console.log('[install] Building bundle...')
  execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'inherit' })
}

console.log('[install] Patching app.asar...')
if (fs.existsSync(PATCHED)) fs.rmSync(PATCHED)
execFileSync(process.execPath, [
  path.join(__dirname, 'patch-asar.mjs'),
  source, BUNDLE, PATCHED
], { stdio: 'inherit' })

console.log('[install] Applying patched archive...')
fs.copyFileSync(PATCHED, ASAR)

console.log('[install] ✨ zcode-skins is now permanently installed.')
console.log('[install] It will load automatically every time ZCode starts.')
console.log(`[install] Original backup: ${BACKUP}`)

if (restart) {
  console.log('[install] Launching ZCode...')
  execSync(`powershell.exe -NoProfile -Command "Start-Process '${EXE}' -WorkingDirectory '${ZCODE_DIR}'"`, { stdio: 'ignore' })
}
