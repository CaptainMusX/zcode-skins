/** Restore only a verified matching official archive, retaining the current skin. */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { archiveInfo, digest } from './zcode-archive.mjs'

const directory = path.resolve(process.env.ZCODE_DIR || 'D:/Program Files/ZCode')
const asar = path.join(directory, 'resources/app.asar')
const backup = asar + '.zcode-skins-backup'
const exe = path.join(directory, 'ZCode.exe')
const restart = process.argv.includes('--restart')
if (!fs.existsSync(backup)) throw new Error('No verified official backup found')
const current = archiveInfo(asar), original = archiveInfo(backup)
if (original.patched || current.version !== original.version || current.fingerprint !== original.fingerprint) throw new Error('Official backup does not match the current host; no files changed')
const ps = code => execFileSync('powershell.exe', ['-NoProfile', '-Command', code], { encoding: 'utf8', windowsHide: true })
const literal = value => "'" + value.replaceAll("'", "''") + "'"
const processes = () => JSON.parse(ps(`$taskPids = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'ZCode.exe' -and $_.ExecutablePath -eq ${literal(exe)} } | Select-Object -ExpandProperty ProcessId); ConvertTo-Json -InputObject $taskPids -Compress`).trim() || '[]')
const ids = processes()
if (ids.length && !restart) throw new Error('ZCode is running; close it or use --restart')
const recovery = asar + `.zcode-skins-before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`
fs.copyFileSync(asar, recovery)
if (digest(fs.readFileSync(recovery)) !== digest(fs.readFileSync(asar))) throw new Error('Recovery backup verification failed')
if (ids.length) {
  ps(`Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue | ForEach-Object { if ($_.MainWindowHandle -ne 0) { [void]$_.CloseMainWindow() } }`)
  for (let attempt = 0; attempt < 15 && processes().length; attempt++) await new Promise(r => setTimeout(r, 1000))
  const remaining = processes()
  if (remaining.length) { ps(`Stop-Process -Id ${remaining.join(',')} -ErrorAction Stop`); await new Promise(r => setTimeout(r, 1500)) }
}
try {
  fs.copyFileSync(backup, asar)
  if (digest(fs.readFileSync(asar)) !== digest(fs.readFileSync(backup))) throw new Error('Restore verification failed')
} catch (error) { fs.copyFileSync(recovery, asar); throw error }
console.log(`[restore] PASS official ${original.version}; previous installation: ${recovery}`)
if (restart) {
  const child = spawn(exe, [], { cwd: directory, detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
}
