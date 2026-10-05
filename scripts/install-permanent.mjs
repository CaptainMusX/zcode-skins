/** Verified, recoverable ZCode installation; never patches an obsolete host backup. */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { archiveInfo, digest, verifyPatchedArchive } from './zcode-archive.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = path.resolve(process.env.ZCODE_DIR || 'D:/Program Files/ZCode')
const asar = path.join(directory, 'resources/app.asar')
const backup = asar + '.zcode-skins-backup'
const bundle = process.env.ZCODE_SKINS_BUNDLE || path.join(root, 'dist/zcode-skins.bundle.js')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const rollback = asar + `.zcode-skins-previous-${stamp}`
const staged = asar + `.zcode-skins-stage-${stamp}`
const restart = process.argv.includes('--restart')
const exe = path.join(directory, 'ZCode.exe')
const ps = text => execFileSync('powershell.exe', ['-NoProfile', '-Command', text], { encoding: 'utf8', windowsHide: true })
const literal = value => "'" + value.replaceAll("'", "''") + "'"
const targetProcesses = () => JSON.parse(ps(`$taskPids = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'ZCode.exe' -and $_.ExecutablePath -eq ${literal(exe)} } | Select-Object -ExpandProperty ProcessId); ConvertTo-Json -InputObject $taskPids -Compress`).trim() || '[]')
const launch = () => {
  const port = process.argv.find(arg => arg.startsWith('--debug-port='))?.split('=')[1]
  if (port && !/^\d{2,5}$/.test(port)) throw new Error('Invalid debug port')
  const child = spawn(exe, port ? [`--remote-debugging-port=${port}`] : [], { cwd: directory, detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

const current = archiveInfo(asar)
let source = asar
if (current.patched) {
  if (!fs.existsSync(backup)) throw new Error('A pristine official backup is required for updating a patched host')
  const original = archiveInfo(backup)
  if (original.patched || original.version !== current.version || original.fingerprint !== current.fingerprint) throw new Error('Official backup does not match the installed ZCode build; no files changed')
  source = backup
}
if (!process.argv.includes('--skip-build') && fs.existsSync(path.join(root, 'src'))) {
  execFileSync(process.execPath, [path.join(root, 'scripts/build.js')], { cwd: root, stdio: 'inherit', windowsHide: true })
}
if (!fs.existsSync(bundle)) throw new Error('Build the ZCode bundle before installation')
const running = targetProcesses()
if (running.length && !restart) throw new Error('ZCode is running; close it or use --restart')
// Save the actual current installation, independently from the pristine backup.
fs.copyFileSync(asar, rollback)
if (digest(fs.readFileSync(rollback)) !== digest(fs.readFileSync(asar))) throw new Error('Current installation backup verification failed')
if (source === asar) {
  if (fs.existsSync(backup)) fs.copyFileSync(backup, backup + `.previous-${stamp}`)
  fs.copyFileSync(asar, backup)
  if (digest(fs.readFileSync(backup)) !== digest(fs.readFileSync(asar))) throw new Error('Official backup verification failed')
  source = backup
}
console.log(`[install] Host ${current.version}; rollback: ${rollback}`)
let replacing = false
try {
  execFileSync(process.execPath, [path.join(root, 'scripts/patch-asar.mjs'), source, bundle, staged], { stdio: 'inherit', windowsHide: true })
  verifyPatchedArchive(staged, bundle)
  const stagedInfo = archiveInfo(staged)
  if (stagedInfo.fingerprint !== current.fingerprint) throw new Error('Staged patch changes unrelated archive entries')
  if (running.length) {
    // Ask the main window to close normally before stopping remaining helpers.
    ps(`Get-Process -Id ${running.join(',')} -ErrorAction SilentlyContinue | ForEach-Object { if ($_.MainWindowHandle -ne 0) { [void]$_.CloseMainWindow() } }`)
    for (let attempt = 0; attempt < 15 && targetProcesses().length; attempt++) await pause(1000)
    const remaining = targetProcesses()
    if (remaining.length) { ps(`Stop-Process -Id ${remaining.join(',')} -ErrorAction Stop`); await pause(1500) }
  }
  replacing = true
  fs.copyFileSync(staged, asar)
  const hash = verifyPatchedArchive(asar, bundle)
  console.log(`[install] PASS bundle SHA256=${hash}`)
  if (restart) launch()
} catch (error) {
  if (replacing) fs.copyFileSync(rollback, asar)
  if (restart && running.length && !targetProcesses().length) launch()
  throw error
} finally {
  if (fs.existsSync(staged)) fs.unlinkSync(staged)
}
