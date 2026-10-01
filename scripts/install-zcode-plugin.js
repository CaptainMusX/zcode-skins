/**
 * Register zcode-skins into ZCode's native plugin registry.
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = os.homedir()
const PLUGINS_ROOT = path.join(HOME, '.zcode', 'cli', 'plugins')
const KNOWN_MARKETS_FILE = path.join(PLUGINS_ROOT, 'known_marketplaces.json')
const INSTALLED_PLUGINS_FILE = path.join(PLUGINS_ROOT, 'installed_plugins.json')
const MARKET_CACHE_DIR = path.join(PLUGINS_ROOT, 'marketplaces', 'zcode-skins-local')
const PROJECT_DIR = 'F:\\ZCode UI增强'

fs.mkdirSync(MARKET_CACHE_DIR, { recursive: true })

// 1. Copy marketplace.json to cache
const marketJson = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'marketplace.json'), 'utf8'))
fs.writeFileSync(path.join(MARKET_CACHE_DIR, 'marketplace.json'), JSON.stringify(marketJson, null, 2), 'utf8')

// 2. Update known_marketplaces.json
let knownMarkets = { version: 1, marketplaces: [] }
if (fs.existsSync(KNOWN_MARKETS_FILE)) {
  try {
    knownMarkets = JSON.parse(fs.readFileSync(KNOWN_MARKETS_FILE, 'utf8'))
  } catch {}
}

const existingIdx = knownMarkets.marketplaces.findIndex(m => m.id === 'zcode-skins-local')
const marketEntry = {
  id: 'zcode-skins-local',
  source: {
    source: 'directory',
    path: PROJECT_DIR
  },
  name: 'zcode-skins-local',
  description: '本地 ZCode 皮肤中心插件市场 (Local Skin Center Market)',
  addedAt: new Date().toISOString(),
  pluginCount: 1,
  lastUpdated: new Date().toISOString()
}

if (existingIdx >= 0) {
  knownMarkets.marketplaces[existingIdx] = marketEntry
} else {
  knownMarkets.marketplaces.push(marketEntry)
}
fs.writeFileSync(KNOWN_MARKETS_FILE, JSON.stringify(knownMarkets, null, 2), 'utf8')

// 3. Update installed_plugins.json
let installed = { version: 1, plugins: {} }
if (fs.existsSync(INSTALLED_PLUGINS_FILE)) {
  try {
    installed = JSON.parse(fs.readFileSync(INSTALLED_PLUGINS_FILE, 'utf8'))
  } catch {}
}

if (!installed.plugins || Array.isArray(installed.plugins)) {
  installed.plugins = {}
}

installed.plugins['zcode-skins@zcode-skins-local'] = {
  name: 'zcode-skins',
  marketplace: 'zcode-skins-local',
  version: '1.0.0',
  installPath: PROJECT_DIR,
  installedAt: new Date().toISOString(),
  scope: 'user',
  enabled: true
}

fs.writeFileSync(INSTALLED_PLUGINS_FILE, JSON.stringify(installed, null, 2), 'utf8')

console.log('[plugin] ✨ Successfully registered zcode-skins into ZCode Desktop!')
console.log(`[plugin] Marketplace registered: ${marketEntry.id}`)
console.log(`[plugin] Plugin installed path: ${PROJECT_DIR}`)
