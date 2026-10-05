import fs from 'node:fs'
import crypto from 'node:crypto'

export const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex')

export function openArchive(file) {
  const fd = fs.openSync(file, 'r')
  try {
    const size = fs.fstatSync(fd).size
    const head = Buffer.alloc(16)
    if (fs.readSync(fd, head, 0, 16, 0) !== 16 || head.readUInt32LE(0) !== 4) throw new Error('Invalid ASAR header')
    const start = 8 + head.readUInt32LE(4)
    const length = head.readUInt32LE(12)
    if (length > 64 * 1024 * 1024 || length < 2 || 16 + length > start || start > size) throw new Error('Invalid ASAR bounds')
    const json = Buffer.alloc(length)
    fs.readSync(fd, json, 0, length, 16)
    const header = JSON.parse(json.toString())
    const entries = new Map()
    const walk = (node, prefix = '') => {
      for (const [name, child] of Object.entries(node.files || {})) {
        const path = prefix + name
        if (child.files) walk(child, path + '/')
        else {
          entries.set(path, child)
          if (!child.unpacked && child.offset !== undefined &&
              (!Number.isSafeInteger(Number(child.offset)) || Number(child.offset) < 0 || !Number.isSafeInteger(child.size) || child.size < 0 || start + Number(child.offset) + child.size > size)) throw new Error(`Invalid ASAR entry: ${path}`)
        }
      }
    }
    walk(header)
    const read = path => {
      const node = entries.get(path)
      if (!node || node.unpacked || node.offset === undefined) throw new Error(`Missing packed file: ${path}`)
      const bytes = Buffer.alloc(node.size)
      if (fs.readSync(fd, bytes, 0, bytes.length, start + Number(node.offset)) !== bytes.length) throw new Error(`Truncated file: ${path}`)
      return bytes
    }
    const version = JSON.parse(read('package.json')).version
    if (typeof version !== 'string') throw new Error('Missing host version')
    const html = read('out/renderer/index.html').toString()
    const fingerprint = digest(JSON.stringify([...entries].filter(([path]) => !['out/renderer/index.html', 'out/renderer/zcode-skins.bundle.js'].includes(path)).sort(([a], [b]) => a.localeCompare(b))))
    return { read, entries, version, fingerprint, patched: html.includes('zcode-skins.bundle.js'), close: () => fs.closeSync(fd) }
  } catch (error) { fs.closeSync(fd); throw error }
}

export function archiveInfo(file) {
  const archive = openArchive(file)
  try { return { version: archive.version, fingerprint: archive.fingerprint, patched: archive.patched } }
  finally { archive.close() }
}

export function verifyPatchedArchive(file, bundle) {
  const archive = openArchive(file)
  try {
    if (!archive.patched) throw new Error('Plugin script reference is missing')
    const bytes = archive.read('out/renderer/zcode-skins.bundle.js')
    const node = archive.entries.get('out/renderer/zcode-skins.bundle.js')
    const hash = digest(bytes)
    if (hash !== digest(fs.readFileSync(bundle)) || node.integrity?.hash !== hash) throw new Error('Installed bundle integrity mismatch')
    const html = archive.read('out/renderer/index.html')
    if (archive.entries.get('out/renderer/index.html').integrity?.hash !== digest(html)) throw new Error('Renderer HTML integrity mismatch')
    return hash
  } finally { archive.close() }
}
