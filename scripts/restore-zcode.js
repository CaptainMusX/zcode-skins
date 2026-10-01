/**
 * Restore ZCode Desktop to official state.
 */

import fs from 'node:fs'
import path from 'node:path'

const candidateDirs = [
  'D:/Program Files/ZCode',
  'C:/Program Files/ZCode',
  path.join(process.env.LOCALAPPDATA || '', 'Programs/ZCode')
]

const zcodeDir = candidateDirs.find(d => fs.existsSync(d))
if (!zcodeDir) {
  console.log('[restore] No ZCode installation found.')
  process.exit(0)
}

const bundleFile = path.join(zcodeDir, 'resources', 'zcode-skins-bundle.js')
if (fs.existsSync(bundleFile)) {
  fs.unlinkSync(bundleFile)
  console.log('[restore] Removed injected bundle file:', bundleFile)
}

console.log('[restore] ZCode Desktop restored to clean official state.')
