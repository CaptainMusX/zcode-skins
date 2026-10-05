/** Wallpaper Engine library discovery through Hermes Desktop's local file bridge. */
import { normalizeMediaSource } from './backdrop-manager.js'

const STEAM_APP_ID = '431960'
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|mkv|avi)$/i
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|bmp)$/i

export const joinLocalPath = (base, ...parts) =>
  [String(base).replace(/[\\/]+$/, ''), ...parts.map(part => String(part).replace(/^[\\/]+|[\\/]+$/g, ''))].join('\\')

export function safeProjectPath(dir, relative) {
  if (typeof relative !== 'string' || !relative.trim()) return null
  const parts = relative.replace(/\\/g, '/').split('/')
  if (parts.some(part => !part || part === '.' || part === '..' || part.includes(':'))) return null
  return joinLocalPath(dir, ...parts)
}

export function wallpaperMediaUrl(path, type) {
  // Hermes hosts stream local video through their media protocol; ZCode's
  // renderer converts absolute Windows paths to file:/// URLs instead
  // (see normalizeMediaSource in backdrop-manager.js).
  if (type === 'video' && typeof window !== 'undefined' && window.hermesDesktop &&
      !window.zcodeDesktop) {
    return `hermes-media://stream/${encodeURIComponent(path)}`
  }
  return path
}

async function entriesAt(bridge, path) {
  try {
    const result = await bridge.readDir(path)
    return !result?.error && Array.isArray(result?.entries) ? result.entries : null
  } catch {
    return null
  }
}

async function textAt(bridge, path) {
  try {
    const result = await bridge.readFileText(path)
    return result?.truncated ? null : result?.text || null
  } catch {
    return null
  }
}

async function existsAt(bridge, path) {
  const normalized = String(path).replace(/\//g, '\\')
  const index = normalized.lastIndexOf('\\')
  if (index < 0) return false
  const parent = await entriesAt(bridge, normalized.slice(0, index))
  return Boolean(parent?.some(entry => entry.name.toLowerCase() === normalized.slice(index + 1).toLowerCase()))
}

async function mapLimit(items, limit, fn) {
  let cursor = 0
  const results = new Array(items.length)
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index])
    }
  }))
  return results
}

export async function readWallpaperProject(bridge, dir, source = 'manual') {
  const entries = await entriesAt(bridge, dir)
  if (!entries?.some(entry => entry.name.toLowerCase() === 'project.json')) return null
  const text = await textAt(bridge, joinLocalPath(dir, 'project.json'))
  if (!text) return null
  let project
  try { project = JSON.parse(text.replace(/^\uFEFF/, '')) } catch { return null }
  if (!project || typeof project !== 'object') return null

  const kind = String(project.type || '').toLowerCase()
  const mainPath = safeProjectPath(dir, project.file)
  const candidatePreview = safeProjectPath(dir, project.preview)
  const previewPath = candidatePreview && IMAGE_EXTENSIONS.test(candidatePreview) ? candidatePreview : null
  const [mainExists, previewExists] = await Promise.all([
    mainPath ? existsAt(bridge, mainPath) : false,
    previewPath ? existsAt(bridge, previewPath) : false
  ])
  const canPlayVideo = kind === 'video' && mainExists && VIDEO_EXTENSIONS.test(mainPath)
  const canShowImage = kind === 'image' && mainExists && IMAGE_EXTENSIONS.test(mainPath)
  const canShowWeb = kind === 'web' && mainExists && /\.html?$/i.test(mainPath)
  const mediaType = canPlayVideo ? 'video' : canShowWeb ? 'web' : 'image'
  const mediaPath = canPlayVideo || canShowImage || canShowWeb ? mainPath : (previewExists ? previewPath : null)
  if (!mediaPath) return null
  const title = typeof project.title === 'string' && project.title.trim()
    ? project.title.trim().slice(0, 120) : dir.split(/[\\/]/).at(-1)
  return {
    id: dir.toLowerCase(),
    title,
    kind,
    source,
    dir,
    mediaPath,
    mediaType,
    previewPath: previewExists ? previewPath : mediaPath,
    staticFallback: !canPlayVideo && !canShowImage && !canShowWeb,
    workshopId: typeof project.workshopid === 'string' ? project.workshopid : null
  }
}

async function scanContainer(bridge, root, source) {
  const entries = await entriesAt(bridge, root)
  if (!entries) return []
  if (entries.some(entry => entry.name.toLowerCase() === 'project.json')) {
    const project = await readWallpaperProject(bridge, root, source)
    return project ? [project] : []
  }
  const dirs = entries.filter(entry => entry.isDirectory).slice(0, 1000)
  return (await mapLimit(dirs, 8, entry => readWallpaperProject(bridge, entry.path || joinLocalPath(root, entry.name), source)))
    .filter(Boolean)
}

export function parseSteamLibraryFolders(text) {
  if (typeof text !== 'string') return []
  const paths = []
  const pattern = /"path"\s*"((?:\\.|[^"\\])*)"/g
  for (const match of text.matchAll(pattern)) {
    const path = match[1].replace(/\\\\/g, '\\').replace(/\//g, '\\')
    if (/^[A-Za-z]:\\/.test(path)) paths.push(path)
  }
  return [...new Set(paths)]
}

// A cached entry the scan no longer sees stays only while its project
// directory is still indexed: the snapshot index may cover less than the
// whole library (restart timing, index hydration), but once a folder re-pick
// drops the directory the wallpaper is deleted and must not be resurrected.
async function cachedItemStillIndexed(bridge, item) {
  const dir = item?.dir || (typeof item?.id === 'string' && /^[a-z]:[\\/]/i.test(item.id) ? item.id : null)
  if (!dir) return true
  const entries = await entriesAt(bridge, dir)
  return Boolean(entries?.some(entry => entry.name.toLowerCase() === 'project.json'))
}

// ZCode-only live-disk probe: the persisted index learns about deletions only
// on a folder re-pick, but image previews load straight from disk through
// file:/// URLs. A preview that no longer loads means the project vanished
// from the disk even though the stale index still lists it.
function probePreviewAlive(path) {
  return new Promise(resolve => {
    const source = normalizeMediaSource(path, 'image')
    if (!source) { resolve(true); return }
    const image = new Image()
    const settle = alive => { image.onload = null; image.onerror = null; resolve(alive) }
    image.onload = () => settle(true)
    image.onerror = () => settle(false)
    image.src = source
  })
}

export async function scanWallpaperEngine(bridge, manualRoots = []) {
  if (!bridge?.readDir || !bridge?.readFileText) {
    // No usable index: serve the persisted library so the gallery survives
    // restarts even when the directory index could not be rebuilt.
    const cached = loadCachedWallpapers()
    if (cached?.items?.length) return { items: cached.items, libraries: cached.libraries || [], error: null }
    return { items: [], libraries: [], error: 'Local file bridge unavailable / 本地文件桥不可用' }
  }
  const probes = []
  for (const drive of ['C', 'D', 'E', 'F', 'G', 'H']) {
    for (const suffix of ['Program Files (x86)\\Steam', 'Program Files\\Steam', 'Steam', 'SteamLibrary']) {
      probes.push(`${drive}:\\${suffix}`)
    }
  }
  const validManual = manualRoots.filter(root => typeof root === 'string' && /^[A-Za-z]:[\\/]/.test(root))
  const candidates = [...new Set([...validManual, ...probes])]
  const found = await mapLimit(candidates, 8, async root => {
    const steamapps = joinLocalPath(root, 'steamapps')
    return (await entriesAt(bridge, steamapps)) ? root : null
  })
  const libraries = new Set(found.filter(Boolean))
  for (const root of [...libraries]) {
    const vdf = await textAt(bridge, joinLocalPath(root, 'steamapps', 'libraryfolders.vdf'))
    for (const library of parseSteamLibraryFolders(vdf)) libraries.add(library)
  }
  const containers = []
  for (const root of libraries) {
    containers.push([joinLocalPath(root, 'steamapps', 'workshop', 'content', STEAM_APP_ID), 'workshop'])
    const projects = joinLocalPath(root, 'steamapps', 'common', 'wallpaper_engine', 'projects')
    containers.push([joinLocalPath(projects, 'myprojects'), 'local'])
    containers.push([joinLocalPath(projects, 'defaultprojects'), 'built-in'])
  }
  for (const root of validManual) {
    containers.push([root, 'manual'])
    containers.push([joinLocalPath(root, STEAM_APP_ID), 'manual'])
    containers.push([joinLocalPath(root, 'myprojects'), 'manual'])
    containers.push([joinLocalPath(root, 'defaultprojects'), 'manual'])
    containers.push([joinLocalPath(root, 'projects', 'myprojects'), 'manual'])
    containers.push([joinLocalPath(root, 'projects', 'defaultprojects'), 'manual'])
    containers.push([joinLocalPath(root, 'workshop', 'content', STEAM_APP_ID), 'manual'])
    containers.push([joinLocalPath(root, 'common', 'wallpaper_engine', 'projects', 'myprojects'), 'manual'])
    containers.push([joinLocalPath(root, 'common', 'wallpaper_engine', 'projects', 'defaultprojects'), 'manual'])
  }
  const uniqueContainers = [...new Map(containers.map(([path, source]) => [path.toLowerCase(), [path, source]])).values()]
  const scanned = await mapLimit(uniqueContainers, 4, ([path, source]) => scanContainer(bridge, path, source))
  const items = [...new Map(scanned.flat().map(item => [item.id, item])).values()]
    .sort((a, b) => a.title.localeCompare(b.title, 'zh'))
  // Merge with the persisted library: a fresh scan only sees what the current
  // directory index covers, so previously discovered projects must survive
  // restarts (their media paths are absolute and keep working). Cached items
  // the scan no longer finds are kept only while their directory is still
  // indexed — a refreshed index (folder re-pick) drops deleted projects.
  const cached = loadCachedWallpapers()
  const scannedIds = new Set(items.map(item => item.id))
  const missing = (cached?.items || []).filter(item => !scannedIds.has(item.id))
  const survivors = (await mapLimit(missing, 8,
    async item => (await cachedItemStillIndexed(bridge, item)) ? item : null)).filter(Boolean)
  let merged = [...new Map([...survivors, ...items].map(item => [item.id, item])).values()]
    .sort((a, b) => a.title.localeCompare(b.title, 'zh'))
  // Real-disk cross-check: prune projects whose image preview no longer loads
  // from disk. Only when at least one probe succeeds — every probe failing
  // means file:/// loading itself is unavailable, not that all wallpapers are.
  if (typeof Image !== 'undefined' && bridge.isZcodeBridge) {
    const probed = await mapLimit(
      merged.filter(item => item.previewPath && IMAGE_EXTENSIONS.test(item.previewPath)),
      8, async item => ({ item, alive: await probePreviewAlive(item.previewPath) }))
    if (probed.length && probed.some(entry => entry.alive)) {
      const dead = new Set(probed.filter(entry => !entry.alive).map(entry => entry.item.id))
      merged = merged.filter(item => !dead.has(item.id))
    }
  }
  saveCachedWallpapers(merged, [...libraries])
  return { items: merged, libraries: [...libraries], error: null }
}

const ITEM_CACHE_KEY = 'zcode-skins:we-items'

export function loadCachedWallpapers() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ITEM_CACHE_KEY) || 'null')
    return parsed && Array.isArray(parsed.items) ? parsed : null
  } catch {
    return null
  }
}

export function saveCachedWallpapers(items, libraries) {
  try {
    localStorage.setItem(ITEM_CACHE_KEY, JSON.stringify({ items: items.slice(0, 500), libraries, at: Date.now() }))
  } catch { /* Persistence is best-effort. */ }
}
