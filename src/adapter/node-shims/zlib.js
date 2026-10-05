/** node:zlib shim on top of fflate's synchronous zlib-format codecs — the
 * same wire format Node's inflateSync/deflateSync produce and consume. */
import { unzlibSync, zlibSync } from 'fflate'

export function inflateSync(data, options) {
  return unzlibSync(new Uint8Array(data))
}

export function deflateSync(data, options) {
  const level = Number(options?.level)
  return zlibSync(new Uint8Array(data), {
    level: Number.isFinite(level) ? Math.min(9, Math.max(0, level)) : 6,
    mem: 12
  })
}

export default { inflateSync, deflateSync }
