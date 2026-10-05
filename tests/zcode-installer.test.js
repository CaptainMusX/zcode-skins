import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { archiveInfo, openArchive, verifyPatchedArchive } from '../scripts/zcode-archive.mjs'

function archive(file, version = '3.14.4', extra = 'native unchanged') {
  const files = { 'package.json': Buffer.from(JSON.stringify({ version })), 'out/renderer/index.html': Buffer.from('<html><body>native</body></html>'), 'out/renderer/native.js': Buffer.from(extra) }
  const header = { files: {} }
  let offset = 0
  for (const [name, bytes] of Object.entries(files)) {
    const parts = name.split('/'); const leaf = parts.pop()
    let node = header
    for (const part of parts) node = node.files[part] ||= { files: {} }
    node.files[leaf] = { size: bytes.length, offset: String(offset) }; offset += bytes.length
  }
  let json = Buffer.from(JSON.stringify(header)); json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)])
  const head = Buffer.alloc(16); head.writeUInt32LE(4, 0); head.writeUInt32LE(json.length + 8, 4); head.writeUInt32LE(json.length + 4, 8); head.writeUInt32LE(json.length, 12)
  fs.writeFileSync(file, Buffer.concat([head, json, ...Object.values(files)]))
}

test('ZCode installation, repeat update and official restore preserve native payloads', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zcode-install-'))
  try {
    fs.mkdirSync(path.join(dir, 'resources'))
    const asar = path.join(dir, 'resources/app.asar'), bundle = path.join(dir, 'bundle.js')
    archive(asar); const original = fs.readFileSync(asar)
    fs.writeFileSync(bundle, 'console.log("skin 1.1.0")')
    const env = { ...process.env, ZCODE_DIR: dir, ZCODE_SKINS_BUNDLE: bundle }
    const run = script => spawnSync(process.execPath, [`scripts/${script}.mjs`, '--skip-build'], { env, encoding: 'utf8', timeout: 30000, windowsHide: true })
    for (let i = 0; i < 2; i++) {
      const result = run('install-permanent'); assert.equal(result.status, 0, result.stderr)
      verifyPatchedArchive(asar, bundle)
      const a = openArchive(asar); try { assert.equal(a.read('out/renderer/native.js').toString(), 'native unchanged') } finally { a.close() }
    }
    assert.deepEqual(fs.readFileSync(asar + '.zcode-skins-backup'), original)
    const restored = run('restore-official'); assert.equal(restored.status, 0, restored.stderr)
    assert.deepEqual(fs.readFileSync(asar), original)
    assert.equal(archiveInfo(asar).patched, false)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('a stale official backup is rejected before changing the installation', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zcode-stale-'))
  try {
    fs.mkdirSync(path.join(dir, 'resources'))
    const asar = path.join(dir, 'resources/app.asar'), bundle = path.join(dir, 'bundle.js')
    archive(asar); fs.writeFileSync(bundle, 'void 0')
    const staged = asar + '.patched'
    const patch = spawnSync(process.execPath, ['scripts/patch-asar.mjs', asar, bundle, staged], { encoding: 'utf8' })
    assert.equal(patch.status, 0, patch.stderr); fs.copyFileSync(staged, asar)
    archive(asar + '.zcode-skins-backup', '3.14.3')
    const before = fs.readFileSync(asar)
    const result = spawnSync(process.execPath, ['scripts/install-permanent.mjs', '--skip-build'], {
      env: { ...process.env, ZCODE_DIR: dir, ZCODE_SKINS_BUNDLE: bundle }, encoding: 'utf8', timeout: 15000, windowsHide: true })
    assert.notEqual(result.status, 0); assert.match(result.stderr, /does not match/)
    assert.deepEqual(fs.readFileSync(asar), before)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
