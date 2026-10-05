/**
 * Detached installer: runs OUTSIDE the ZCode process tree so stopping ZCode
 * cannot kill the install itself.
 *
 * Why this exists: `npm run install:zcode --restart` stops ZCode first, and on
 * Windows the ZCode renderer that spawned the agent shell dies with it — the
 * install is interrupted mid-patch every time. This script is launched via
 * `Start-Process -WindowStyle Hidden` from cmd/powershell, so it survives the
 * ZCode shutdown: it stops ZCode, patches app.asar from the pristine backup,
 * writes it over the installed archive, then relaunches ZCode with the CDP
 * debug port on 9222 so the next agent turn can verify via CDP.
 *
 * Usage: node scripts/install-detached.mjs
 * Log:   install-detached.log (workspace root, meanwhile also echoed)
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LOG = path.join(ROOT, 'install-detached.log')

const ZCODE_DIR = process.env.ZCODE_DIR || 'D:/Program Files/ZCode'
const RESOURCES = path.join(ZCODE_DIR, 'resources')
const ASAR = path.join(RESOURCES, 'app.asar')
const BACKUP = path.join(RESOURCES, 'app.asar.zcode-skins-backup')
const BUNDLE = path.join(ROOT, 'dist', 'zcode-skins.bundle.js')
const PATCHED = path.join(ROOT, 'dist', 'app.patched.asar')
const EXE = path.join(ZCODE_DIR, 'ZCode.exe')
const CDP_PORT = process.env.ZCODE_CDP_PORT || '9222'

const log = message => {
  const line = `[${new Date().toISOString()}] ${message}`
  fs.appendFileSync(LOG, line + '\n')
  console.log(line)
}

const run = (cmd, args, options = {}) => {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options })
    return { ok: true, out: out || '' }
  } catch (error) {
    return { ok: false, out: (error.stdout || '') + (error.stderr || '') + (error.message || '') }
  }
}

const ps = script => run('powershell.exe', ['-NoProfile', '-Command', script])

try {
  if (fs.existsSync(LOG)) fs.rmSync(LOG)
  log('detached install started')
  log(`zone: ZCODE_DIR=${ZCODE_DIR}`)

  // Grace period so the agent turn can finish and the user can read the
  // notice before their window closes.
  log('waiting 20s before touching ZCode')
  await new Promise(resolve => setTimeout(resolve, 20000))

  if (!fs.existsSync(ASAR)) throw new Error(`ZCode not found: ${ASAR}`)
  if (!fs.existsSync(BUNDLE)) throw new Error(`bundle missing (run npm run build): ${BUNDLE}`)

  // 1. Stop ZCode and wait until every process is really gone.
  log('stopping ZCode')
  ps('Stop-Process -Name ZCode -Force -ErrorAction SilentlyContinue')
  for (let i = 0; i < 30; i++) {
    const { out } = ps('(Get-Process -Name ZCode -ErrorAction SilentlyContinue | Measure-Object).Count')
    if (Number(out.trim()) === 0) break
    if (i === 29) throw new Error('ZCode did not exit within 30s')
    ps('Start-Sleep -Milliseconds 1000')
  }
  log('ZCode stopped')

  // 2. Always patch from the pristine original so repeat runs are idempotent.
  const source = fs.existsSync(BACKUP) ? BACKUP : ASAR
  if (!fs.existsSync(BACKUP)) {
    log('creating pristine backup')
    fs.copyFileSync(ASAR, BACKUP)
  }
  log(`patching from ${source === BACKUP ? 'pristine backup' : 'live asar'}`)
  if (fs.existsSync(PATCHED)) fs.rmSync(PATCHED)
  const patch = run(process.execPath, [path.join(__dirname, 'patch-asar.mjs'), source, BUNDLE, PATCHED])
  log(patch.ok ? patch.out.trim() : `patch failed: ${patch.out.slice(0, 800)}`)
  if (!patch.ok) throw new Error('patch-asar failed')

  // 3. Verify the patch actually carries the new bundle before overwriting.
  const patchedSize = fs.statSync(PATCHED).size
  const verify = (() => {
    const fd = fs.openSync(PATCHED, 'r')
    try {
      const tail = Buffer.alloc(Math.min(3_000_000, patchedSize))
      fs.readSync(fd, tail, 0, tail.length, patchedSize - tail.length)
      return tail.toString('latin1')
    } finally { fs.closeSync(fd) }
  })()
  // These markers exist verbatim in the built bundle: the control-material
  // floor lives in the source as Math.max(keep, 88) and the runtime sheet id
  // is a literal string; template interpolations like "88%, transparent"
  // never appear in the shipped file.
  const markers = ['control-tint', 'control-frost', 'zcode-skins-runtime-css']
  const missing = markers.filter(marker => !verify.includes(marker))
  log(`patched archive: ${patchedSize.toLocaleString()} bytes; markers missing: ${missing.length ? missing.join(', ') : 'none'}`)
  if (missing.length) throw new Error(`patched archive is stale: missing ${missing.join(', ')}`)

  // 4. Apply atomically-ish (copy then swap) and relaunch with the CDP port.
  log('applying patched archive')
  const staged = ASAR + '.new'
  let applied = false
  for (let attempt = 1; attempt <= 5 && !applied; attempt++) {
    try {
      fs.copyFileSync(PATCHED, staged)
      fs.rmSync(ASAR)
      fs.renameSync(staged, ASAR)
      applied = true
      log(`archive applied on attempt ${attempt}`)
    } catch (error) {
      log(`apply attempt ${attempt} failed: ${error.message}`)
      try { if (fs.existsSync(staged)) fs.rmSync(staged) } catch {}
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
  if (!applied) throw new Error('could not replace app.asar after 5 attempts')

  log(`launching ZCode with --remote-debugging-port=${CDP_PORT}`)
  ps(`Start-Process -FilePath '${EXE}' -WorkingDirectory '${ZCODE_DIR}' -ArgumentList @('--remote-debugging-port=${CDP_PORT}')`)
  log('done')
} catch (error) {
  log(`FAILED: ${error.message}`)
  process.exitCode = 1
} 
