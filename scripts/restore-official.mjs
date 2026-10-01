/**
 * Restore ZCode Desktop to its pristine official state.
 * Puts the backed-up app.asar back byte-for-byte.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ZCODE_DIR = process.env.ZCODE_DIR || 'D:/Program Files/ZCode'
const RESOURCES = path.join(ZCODE_DIR, 'resources')
const ASAR = path.join(RESOURCES, 'app.asar')
const BACKUP = path.join(RESOURCES, 'app.asar.zcode-skins-backup')
const EXE = path.join(ZCODE_DIR, 'ZCode.exe')

const restart = process.argv.includes('--restart')

if (!fs.existsSync(BACKUP)) {
  console.log('[restore] No backup found — ZCode is already in its official state.')
  process.exit(0)
}

const running = () => {
  try {
    const out = execSync('powershell.exe -NoProfile -Command "Get-Process -Name ZCode -ErrorAction SilentlyContinue | Measure-Object | Select-Object -ExpandProperty Count"', { encoding: 'utf8' })
    return Number(out.trim()) > 0
  } catch { return false }
}

if (running()) {
  if (!restart) {
    console.error('[restore] ZCode is running. Close it first, or pass --restart.')
    process.exit(2)
  }
  console.log('[restore] Stopping ZCode...')
  execSync('powershell.exe -NoProfile -Command "Stop-Process -Name ZCode -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' })
  execSync('powershell.exe -NoProfile -Command "Start-Sleep -Seconds 2"', { stdio: 'ignore' })
}

console.log('[restore] Restoring official app.asar...')
fs.copyFileSync(BACKUP, ASAR)
console.log('[restore] ✨ ZCode Desktop restored to its official state.')

if (restart) {
  console.log('[restore] Launching ZCode...')
  execSync(`powershell.exe -NoProfile -Command "Start-Process '${EXE}' -WorkingDirectory '${ZCODE_DIR}'"`, { stdio: 'ignore' })
}
