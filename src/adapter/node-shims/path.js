/** node:path shim (forward slashes; only used by the extractor's unpacked-dir
 * access, which the renderer build does not exercise). */

export const sep = '/'

export const join = (...parts) =>
  parts.filter(part => typeof part === 'string' && part.length).join('/').replace(/\/{2,}/g, '/')

export const resolve = (...parts) => join(...parts)

export default { join, resolve, sep }
