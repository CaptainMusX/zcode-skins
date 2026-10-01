/**
 * Build a patched app.asar by binary-patching only the archive header and
 * appending the plugin bundle — the ~317 MB payload region is copied verbatim
 * (never re-packed), so unpacked native modules and file integrity stay intact.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const ASAR = process.argv[2] || 'D:/Program Files/ZCode/resources/app.asar'
const BUNDLE = process.argv[3] || 'F:/ZCode UI增强/dist/zcode-skins.bundle.js'
const OUT = process.argv[4] || 'F:/ZCode UI增强/dist/app.patched.asar'

const ALIGN = 4
const pad = n => (ALIGN - (n % ALIGN)) % ALIGN

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

const bundleCode = fs.readFileSync(BUNDLE, 'utf8')
if (bundleCode.includes('</script')) {
  throw new Error('bundle contains a </script sequence; it cannot be inlined into HTML safely')
}
const bundleBuf = Buffer.from(bundleCode, 'utf8')

const fd = fs.openSync(ASAR, 'r')
try {
  const fileSize = fs.statSync(ASAR).size
  const head = Buffer.alloc(16)
  fs.readSync(fd, head, 0, 16, 0)
  // asar header layout: [u32=4][u32=size][u32=headerPayload][u32=jsonLen][json...]
  // `size` at offset 4 is the whole header pickle length, so the payload starts
  // at 8 + size.
  const sizeField = head.readUInt32LE(4)
  const headerStrSize = head.readUInt32LE(12)
  const oldHeaderSize = 8 + sizeField
  const payloadSize = fileSize - oldHeaderSize

  const jsonBuf = Buffer.alloc(headerStrSize)
  fs.readSync(fd, jsonBuf, 0, headerStrSize, 16)
  const header = JSON.parse(jsonBuf.toString('utf8'))

  const getNode = p => p.split('/').reduce((cur, seg) => cur.files[seg], header)
  const walk = (node, fn) => {
    if (node.files) {
      for (const child of Object.values(node.files)) walk(child, fn)
    } else if (node.offset !== undefined) {
      fn(node)
    }
  }

  const idx = getNode('out/renderer/index.html')
  const idxOffset = Number(idx.offset)
  const idxSize = idx.size

  const readRegion = (offset, size) => {
    const buf = Buffer.alloc(size)
    fs.readSync(fd, buf, 0, size, oldHeaderSize + offset)
    return buf
  }

  const origHtml = readRegion(idxOffset, idxSize).toString('utf8')
  if (origHtml.includes('zcode-skins.bundle.js')) {
    console.log('[patch] index.html already references the bundle; nothing to do')
    process.exit(0)
  }

  // 1. The bundle becomes a new file placed at the end of the payload region.
  const bundleOffset = payloadSize
  header.files.out.files.renderer.files['zcode-skins.bundle.js'] = {
    size: bundleBuf.length,
    offset: String(bundleOffset),
    integrity: {
      algorithm: 'SHA256',
      hash: sha256(bundleBuf),
      blockSize: 4194304,
      blocks: [sha256(bundleBuf)]
    }
  }

  // 2. index.html grows by the script tag and therefore moves to the very end.
  const tag = '  <script src="./zcode-skins.bundle.js"></script>\n'
  const newHtml = origHtml.replace('</body>', `${tag}</body>`)
  if (newHtml === origHtml) throw new Error('could not find </body> in index.html')
  const newHtmlBuf = Buffer.from(newHtml, 'utf8')
  const newHtmlOffset = bundleOffset + bundleBuf.length

  idx.size = newHtmlBuf.length
  idx.offset = String(newHtmlOffset)
  const htmlHash = sha256(newHtmlBuf)
  idx.integrity = { algorithm: 'SHA256', hash: htmlHash, blockSize: 4194304, blocks: [htmlHash] }

  // 3. Re-serialize the header (padding keeps it 4-byte aligned).
  let headerJson = Buffer.from(JSON.stringify(header), 'utf8')
  headerJson = Buffer.concat([headerJson, Buffer.alloc(pad(headerJson.length), 0x20)])
  const newHeaderSize = 16 + headerJson.length
  const pickle = Buffer.alloc(16)
  pickle.writeUInt32LE(4, 0)
  // `size` covers the padded JSON plus the 8-byte (jsonLen + padding) tail, so
  // the payload region begins at 8 + size === 16 + paddedJsonLen.
  pickle.writeUInt32LE(headerJson.length + 8, 4)
  pickle.writeUInt32LE(headerJson.length + 4, 8)
  pickle.writeUInt32LE(headerJson.length, 12)

  // 4. Stream: new header -> original payload -> bundle -> new index.html.
  const out = fs.openSync(OUT, 'w')
  try {
    fs.writeSync(out, pickle)
    fs.writeSync(out, headerJson)

    const CHUNK = 8 * 1024 * 1024
    let copied = 0
    while (copied < payloadSize) {
      const n = Math.min(CHUNK, payloadSize - copied)
      const buf = Buffer.alloc(n)
      fs.readSync(fd, buf, 0, n, oldHeaderSize + copied)
      fs.writeSync(out, buf)
      copied += n
    }
    fs.writeSync(out, bundleBuf)
    fs.writeSync(out, newHtmlBuf)
  } finally {
    fs.closeSync(out)
  }

  const stat = fs.statSync(OUT)
  console.log('[patch] patched archive written:', OUT)
  console.log('[patch] size:', stat.size.toLocaleString(), 'bytes')
  console.log('[patch] bundle offset:', bundleOffset.toLocaleString(), `(${bundleBuf.length} bytes)`)
  console.log('[patch] index.html offset:', newHtmlOffset.toLocaleString(), `(${newHtmlBuf.length} bytes)`)
} finally {
  fs.closeSync(fd)
}
