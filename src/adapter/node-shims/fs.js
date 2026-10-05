/** node:fs shim for the browser-bundled pkg extractor. The extractor's
 * filesystem path only serves unpacked Wallpaper Engine project folders;
 * ZCode feeds it packed .pkg bytes instead, so every call fails closed and
 * the extractor reports those sources as unavailable. */

const fail = name => () => {
  throw new Error(`fs.${name}: local filesystem access is unavailable in the renderer`)
}

export const statSync = fail('statSync')
export const lstatSync = fail('lstatSync')
export const realpathSync = fail('realpathSync')
export const readFileSync = fail('readFileSync')
export const readdirSync = fail('readdirSync')

export default { statSync, lstatSync, realpathSync, readFileSync, readdirSync }
