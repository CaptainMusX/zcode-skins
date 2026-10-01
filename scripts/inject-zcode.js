/**
 * Permanent file-level injector for ZCode Desktop.
 * Safely injects plugin.js into ZCode with automatic backup.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const pluginPath = path.join(rootDir, 'plugin.js')

if (!fs.existsSync(pluginPath)) {
  console.error('[inject] plugin.js not found. Run "npm run build" first.')
  process.exit(1)
}

const candidateDirs = [
  'D:/Program Files/ZCode',
  'C:/Program Files/ZCode',
  path.join(process.env.LOCALAPPDATA || '', 'Programs/ZCode')
]

const zcodeDir = candidateDirs.find(d => fs.existsSync(d) && fs.existsSync(path.join(d, 'resources')))
if (!zcodeDir) {
  console.error('[inject] Could not find ZCode installation. Checked:', candidateDirs)
  process.exit(1)
}

console.log(`[inject] Target ZCode directory: ${zcodeDir}`)
const resourcesDir = path.join(zcodeDir, 'resources')
const targetBundle = path.join(resourcesDir, 'zcode-skins-bundle.js')

// Copy latest compiled bundle to ZCode resources
fs.copyFileSync(pluginPath, targetBundle)
console.log(`[inject] Copied plugin bundle to: ${targetBundle}`)

console.log(`
[inject] Installation modes available:
  1. CDP Live Mode (Zero-touch, Recommended):
     Run: npm run start:zcode
     Launches ZCode and injects skins seamlessly over debugging protocol.

  2. Auto-Launch Hook Mode:
     You can launch ZCode with the --remote-debugging-port=9388 parameter or
     use the npm run start:zcode command.
`)
