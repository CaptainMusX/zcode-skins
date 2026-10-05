/** Minimal Buffer shim for the browser-bundled dsh-skins pkg extractor.
 * Covers only the APIs pkg-extract.ts uses: Buffer.from / Buffer.alloc /
 * Buffer.concat and instance toString('base64'|'utf8'|'hex'). */

const encoders = {
  base64: bytes => {
    let binary = ''
    const chunk = 0x8000
    for (let start = 0; start < bytes.length; start += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(start, start + chunk))
    }
    return btoa(binary)
  },
  utf8: bytes => new TextDecoder().decode(bytes),
  hex: bytes => [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
}

class BufferShim extends Uint8Array {
  static from(value, encodingOrOffset, length) {
    if (typeof value === 'string') {
      const bytes = new TextEncoder().encode(value)
      return new BufferShim(bytes)
    }
    if (ArrayBuffer.isView(value)) {
      const start = typeof encodingOrOffset === 'number' ? encodingOrOffset : 0
      const end = typeof length === 'number' ? start + length : value.byteLength - start
      return new BufferShim(value.buffer.slice(value.byteOffset + start, value.byteOffset + end))
    }
    if (Array.isArray(value) || value instanceof Uint8Array || value instanceof ArrayBuffer) {
      return new BufferShim(value)
    }
    throw new TypeError('Buffer.from: unsupported input')
  }

  static alloc(size) {
    return new BufferShim(Number(size) || 0)
  }

  static concat(list) {
    const total = list.reduce((sum, item) => sum + item.length, 0)
    const out = new BufferShim(total)
    let cursor = 0
    for (const item of list) {
      out.set(item, cursor)
      cursor += item.length
    }
    return out
  }

  toString(encoding = 'utf8') {
    const encode = encoders[encoding]
    if (!encode) throw new TypeError(`Buffer.toString: unsupported encoding ${encoding}`)
    return encode(this)
  }

  writeUInt32BE(value, offset = 0) {
    const view = new DataView(this.buffer, this.byteOffset, this.byteLength)
    view.setUint32(offset, value >>> 0, false)
    return this
  }

  writeUInt32LE(value, offset = 0) {
    const view = new DataView(this.buffer, this.byteOffset, this.byteLength)
    view.setUint32(offset, value >>> 0, true)
    return this
  }

  writeUInt16BE(value, offset = 0) {
    const view = new DataView(this.buffer, this.byteOffset, this.byteLength)
    view.setUint16(offset, value >>> 0, false)
    return this
  }

  writeUInt16LE(value, offset = 0) {
    const view = new DataView(this.buffer, this.byteOffset, this.byteLength)
    view.setUint16(offset, value >>> 0, true)
    return this
  }

  writeUInt8(value, offset = 0) {
    new DataView(this.buffer, this.byteOffset, this.byteLength).setUint8(offset, value)
    return this
  }

  write(text, offset = 0, encoding = 'utf8') {
    const bytes = new TextEncoder().encode(
      encoding === 'ascii' || encoding === 'latin1'
        ? String(text).replace(/[^\x00-\xff]/g, '?')
        : String(text)
    )
    this.set(bytes, offset)
    return this
  }
}

export default BufferShim
export { BufferShim as Buffer }
