/**
 * ZCode Desktop Local File Bridge
 * Exposes `window.zcodeDesktop` with the readDir/readFileText/readFileDataUrl/
 * selectPaths contract that we-library.js, scene-player.js, web-player.js and
 * WallpaperEnginePanel.js expect from the Hermes host.
 *
 * ZCode's renderer runs with contextIsolation (no Node access), but the host
 * exposes `window.zcode` with native file pickers and `webUtils.getPathForFile`.
 * There is no generic "list directory" IPC, so directory enumeration goes
 * through a hidden `<input webkitdirectory>`: the native folder dialog yields
 * a File object for every file below the picked folder, and getPathForFile
 * turns each into its absolute Windows path. That snapshot powers readDir and
 * the read* calls; picked roots accumulate, and the caller persists them
 * (config.weRoots) so wallpapers keep working across restarts.
 */

const DRIVE_ROOT = /^[A-Za-z]:$/
const INDEX_CACHE_KEY = 'zcode-skins:file-index'
const INDEX_CACHE_LIMIT = 4 * 1024 * 1024
const TEXT_CACHE_LIMIT = 4096
const CACHE_DB = 'zcode-skins-cache'
const CACHE_STORE = 'kv'

function openCacheDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CACHE_STORE)) {
        request.result.createObjectStore(CACHE_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function idbPut(key, value) {
  try {
    const db = await openCacheDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite')
      tx.objectStore(CACHE_STORE).put(value, key)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    return true
  } catch {
    return false
  }
}

async function idbGet(key) {
  try {
    const db = await openCacheDb()
    return await new Promise(resolve => {
      const tx = db.transaction(CACHE_STORE, 'readonly')
      const request = tx.objectStore(CACHE_STORE).get(key)
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

async function idbDelete(key) {
  try {
    const db = await openCacheDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite')
      tx.objectStore(CACHE_STORE).delete(key)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    return true
  } catch {
    return false
  }
}

// Back-compat: the older dedicated pkg database.
function openPkgDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('zcode-skins-scene-pkg', 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('pkgs')) {
        request.result.createObjectStore('pkgs')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Directory listings and small text files (project.json, libraryfolders.vdf)
 * persist to localStorage so library scans keep working after a restart
 * without re-picking the folder. File handles themselves stay session-only. */
function loadIndexCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(INDEX_CACHE_KEY) || 'null')
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

/** Pure index builder — exported for tests. entries need { absPath, file };
 * absolute paths may use \\ or / separators. */
export function buildFileIndex(entries) {
  const dirs = new Map()   // lowercase dir path -> [{ name, path, isDirectory }]
  const files = new Map()  // lowercase file path -> File
  const roots = new Set()

  const parentOf = path => {
    const trimmed = path.replace(/[\\/]+$/, '')
    const cut = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))
    if (cut < 0) return null
    const parent = trimmed.slice(0, cut)
    return DRIVE_ROOT.test(parent) ? parent + '\\' : parent
  }

  const ensureDir = path => {
    const key = path.toLowerCase()
    if (dirs.has(key)) return
    dirs.set(key, [])
    const parent = parentOf(path)
    if (!parent) return
    ensureDir(parent)
    dirs.get(parent.toLowerCase()).push({
      name: path.replace(/[\\/]+$/, '').split(/[\\/]/).pop(),
      path,
      isDirectory: true
    })
  }

  for (const { absPath, file } of entries) {
    if (typeof absPath !== 'string' || !absPath.trim()) continue
    // Normalize to Windows backslash form so keys match joinLocalPath output
    // regardless of which separator webUtils returned.
    const clean = absPath.trim().replace(/\//g, '\\')
    files.set(clean.toLowerCase(), file)
    const parent = parentOf(clean)
    if (!parent) continue
    ensureDir(parent)
    dirs.get(parent.toLowerCase()).push({
      name: clean.split(/[\\/]/).pop(),
      path: clean,
      isDirectory: false
    })
    // The picked folder itself is the top-most ancestor below the drive root.
    let top = parent
    while (true) {
      const upper = parentOf(top)
      if (!upper || DRIVE_ROOT.test(upper.replace(/[\\/]+$/, ''))) break
      top = upper
    }
    roots.add(top)
  }

  return { dirs, files, roots: [...roots] }
}

function guessMime(name) {
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg'
  if (/\.png$/i.test(name)) return 'image/png'
  if (/\.webp$/i.test(name)) return 'image/webp'
  if (/\.gif$/i.test(name)) return 'image/gif'
  if (/\.svg$/i.test(name)) return 'image/svg+xml'
  if (/\.webm$/i.test(name)) return 'video/webm'
  if (/\.mp4$/i.test(name)) return 'video/mp4'
  if (/\.json$/i.test(name)) return 'application/json'
  return 'application/octet-stream'
}

async function toDataUrl(file) {
  const buffer = await file.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  for (let start = 0; start < bytes.length; start += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(start, start + chunk))
  }
  return `data:${guessMime(file.name)};base64,${btoa(binary)}`
}

/** Attaches the bridge onto `target` (normally `window`). `pickFiles` must
 * resolve to { absPath, file }[] for whatever the user picked in the native
 * dialog; injectable so tests can drive the API without a DOM. */
export function attachZcodeFileBridge(target, { zcode, pickFiles }) {
  if (!target || !zcode) return false

  const resolvePath = file => {
    try {
      const viaWebUtils = zcode.getPathForFile?.(file)
      if (typeof viaWebUtils === 'string' && viaWebUtils.trim()) return viaWebUtils.trim()
    } catch { /* webUtils unavailable — fall through to the legacy property. */ }
    return typeof file.path === 'string' && file.path.trim() ? file.path.trim() : null
  }

  const dirs = new Map()
  const files = new Map()
  const sceneStores = new Map()
  const cache = loadIndexCache() || { dirs: {}, texts: {}, roots: [] }
  const cacheTexts = new Map(Object.entries(cache.texts || {}))
  // Older indexed snapshots contain doubled Windows separators. Equivalent
  // host paths must find those entries without rewriting persisted scene IDs.
  const lookup = (map, value) => {
    const raw = String(value).toLowerCase()
    const normalized = raw.replace(/[\\/]+/g, '\\')
    for (const key of [raw, normalized, normalized.replace(/\\/g, '\\\\'), normalized.replace(/\\/g, '/')]) {
      if (map.has(key)) return map.get(key)
    }
  }
  let cacheRoots = Array.isArray(cache.roots) ? cache.roots : []
  let persistTimer = 0

  const persistNow = () => {
    try {
      const payload = JSON.stringify({
        dirs: Object.fromEntries(dirs),
        texts: Object.fromEntries(cacheTexts),
        roots: cacheRoots
      })
      try {
        localStorage.setItem(INDEX_CACHE_KEY, payload)
      } catch {
        // Quota exceeded — drop the (large) listings, keep the small texts.
        localStorage.setItem(INDEX_CACHE_KEY, JSON.stringify({ dirs: {}, texts: Object.fromEntries(cacheTexts), roots: cacheRoots }))
      }
    } catch { /* Persistence is best-effort. */ }
    // The full index (dirs included) goes to IndexedDB without a quota cap.
    void idbPut('file-index', {
      at: Date.now(),
      dirs: [...dirs.entries()],
      texts: [...cacheTexts.entries()],
      roots: cacheRoots
    }, 'index')
  }
  const persist = () => {
    if (persistTimer) return
    persistTimer = setTimeout(() => {
      persistTimer = 0
      persistNow()
    }, 500)
  }

  for (const [key, listing] of Object.entries(cache.dirs || {})) {
    if (Array.isArray(listing)) dirs.set(key, listing)
  }

  const pruneUnder = roots => {
    const prefixes = roots.map(root => root.toLowerCase().replace(/[\\/]+$/, '') + '\\')
    const drop = path => prefixes.some(prefix => path.toLowerCase().startsWith(prefix))
    for (const key of [...dirs.keys()]) if (drop(key)) dirs.delete(key)
    for (const key of [...cacheTexts.keys()]) if (drop(key)) cacheTexts.delete(key)
  }

  const indexEntries = entries => {
    const index = buildFileIndex(entries)
    // Picks accumulate: users add one Steam library at a time. Listings under
    // a freshly picked root are replaced wholesale so deletions propagate.
    if (index.roots.length) pruneUnder(index.roots)
    for (const [key, listing] of index.dirs) {
      const existing = dirs.get(key)
      if (existing) {
        const seen = new Set(existing.map(entry => `${entry.path.toLowerCase()}|${entry.isDirectory}`))
        for (const entry of listing) {
          const mark = `${entry.path.toLowerCase()}|${entry.isDirectory}`
          if (!seen.has(mark)) {
            existing.push(entry)
            seen.add(mark)
          }
        }
      } else dirs.set(key, listing)
    }
    for (const [key, file] of index.files) files.set(key, file)
    for (const root of index.roots) {
      if (!cacheRoots.some(existing => existing.toLowerCase() === root.toLowerCase())) cacheRoots.push(root)
    }
    if (cacheTexts.size > TEXT_CACHE_LIMIT) {
      for (const key of cacheTexts.keys()) {
        if (cacheTexts.size <= TEXT_CACHE_LIMIT) break
        cacheTexts.delete(key)
      }
    }
    persist()
    return index.roots
  }

  // In-memory scene stores prepared by scene-prepare.js, served under
  // zcode-scene://<token>/<name>. Reads refresh recency so the active
  // scene's store survives LRU eviction.
  const SCENE_SCHEME = 'zcode-scene://'
  const parseScenePath = value => {
    const text = String(value)
    if (!text.startsWith(SCENE_SCHEME)) return null
    const rest = text.slice(SCENE_SCHEME.length)
    const cut = rest.indexOf('/')
    if (cut <= 0) return null
    return { token: rest.slice(0, cut), inner: rest.slice(cut + 1).toLowerCase() }
  }
  const sceneBytes = (token, inner) => {
    const store = sceneStores.get(token)
    if (!store || !store.has(inner)) return null
    const bytes = store.get(inner)
    sceneStores.delete(token)
    sceneStores.set(token, store)
    return bytes
  }
  const bytesToDataUrl = (bytes, name) => {
    let binary = ''
    const chunk = 0x8000
    for (let start = 0; start < bytes.length; start += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(start, start + chunk))
    }
    const mime = /\.png$/i.test(name) ? 'image/png' : /\.mp4$/i.test(name) ? 'video/mp4' : 'application/octet-stream'
    return `data:${mime};base64,${btoa(binary)}`
  }

  target.zcodeDesktop = {
    isZcodeBridge: true,
    hasSceneSource(token) { return sceneStores.has(String(token)) },
    indexEntries,
    registerSceneSource(token, files) {
      sceneStores.set(String(token), files instanceof Map ? files : new Map(Object.entries(files)))
      for (const key of [...sceneStores.keys()]) {
        if (sceneStores.size <= 3) break
        sceneStores.delete(key)
      }
    },
    // Scene .pkg bytes persist in IndexedDB (disk-backed, large quota) so a
    // prepared scene survives renderer restarts without re-picking folders.
    async saveScenePkg(key, blob) {
      try {
        const db = await openPkgDb()
        await new Promise((resolve, reject) => {
          const tx = db.transaction('pkgs', 'readwrite')
          tx.objectStore('pkgs').put(blob, String(key).toLowerCase())
          tx.oncomplete = resolve
          tx.onerror = () => reject(tx.error)
        })
        return true
      } catch {
        return false
      }
    },
    async loadScenePkg(key) {
      try {
        const db = await openPkgDb()
        return await new Promise(resolve => {
          const tx = db.transaction('pkgs', 'readonly')
          const request = tx.objectStore('pkgs').get(String(key).toLowerCase())
          request.onsuccess = () => resolve(request.result || null)
          request.onerror = () => resolve(null)
        })
      } catch {
        return null
      }
    },
    // Fully prepared scene store (manifest + extracted resources) persisted in
    // IndexedDB: re-preparing after a restart becomes an IDB read instead of a
    // full re-extraction of a 250 MB package.
    async saveSceneArtifacts(key, files) {
      const plain = files instanceof Map ? Object.fromEntries(files) : { ...files }
      // Keyed per scene directory — idbPut takes exactly (key, value), so the
      // key must be baked into the first argument (a stale third argument was
      // silently dropped, piling every scene onto one key and never matching
      // loadSceneArtifacts' `scene:<dir>` reads).
      return idbPut(`scene:${String(key).toLowerCase()}`, { at: Date.now(), files: plain })
    },
    async loadSceneArtifacts(key) {
      const record = await idbGet(`scene:${String(key).toLowerCase()}`)
      return record && record.files ? record : null
    },
    // One-shot migration: builds before the per-scene keys piled every
    // prepared scene onto the single legacy 'scene-artifacts' key. Returns the
    // record once and drops it, so the caller can re-key it to the scene that
    // actually claims it.
    async takeLegacySceneArtifacts() {
      const record = await idbGet('scene-artifacts')
      if (!record || !record.files) return null
      await idbDelete('scene-artifacts')
      return record
    },
    // The full directory index cannot fit localStorage (quota) — keep it in
    // IndexedDB so a restart restores the whole library without re-picking.
    async saveIndexSnapshot() {
      // Must match hydrateIndexSnapshot's read key ('index').
      return idbPut('index', {
        at: Date.now(),
        dirs: [...dirs.entries()],
        texts: [...cacheTexts.entries()],
        roots: cacheRoots
      })
    },
    async hydrateIndexSnapshot() {
      const snapshot = await idbGet('index')
      if (!snapshot) return false
      if (snapshot.dirs && dirs.size === 0) {
        for (const [key, listing] of snapshot.dirs) {
          if (Array.isArray(listing) && !dirs.has(key)) dirs.set(key, listing)
        }
      }
      if (snapshot.texts) {
        for (const [key, text] of snapshot.texts) {
          if (!cacheTexts.has(key)) cacheTexts.set(key, text)
        }
      }
      if (Array.isArray(snapshot.roots)) {
        for (const root of snapshot.roots) {
          if (!cacheRoots.some(existing => existing.toLowerCase() === root.toLowerCase())) cacheRoots.push(root)
        }
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('zcode-skins:index-hydrated'))
      }
      return true
    },
    async readDir(path) {
      const listing = lookup(dirs, path)
      return listing ? { entries: listing } : { error: 'not-indexed' }
    },
    async readFileText(path) {
      const scene = parseScenePath(path)
      if (scene) {
        const bytes = sceneBytes(scene.token, scene.inner)
        if (!bytes) return { error: 'scene-store-missing' }
        const buffer = bytes instanceof Blob ? await bytes.arrayBuffer() : bytes
        return { text: new TextDecoder().decode(buffer), truncated: false }
      }
      const key = String(path).toLowerCase()
      const file = lookup(files, key)
      if (file) {
        try {
          const text = await file.text()
          // Cache only small files (manifests, project.json, vdf); large
          // assets are re-read from the File handles within the session.
          if (text.length <= 131072) {
            cacheTexts.set(key, text)
            persist()
          }
          return { text, truncated: false }
        } catch (error) {
          return { error: String(error?.message || error) }
        }
      }
      const cachedText = lookup(cacheTexts, key)
      if (cachedText !== undefined) return { text: cachedText, truncated: false }
      return { error: 'not-indexed' }
    },
    async readFileDataUrl(path) {
      const scene = parseScenePath(path)
      if (scene) {
        const value = sceneBytes(scene.token, scene.inner)
        if (!value) throw new Error('scene-store-missing')
        if (value instanceof Blob) return bytesToDataUrl(new Uint8Array(await value.arrayBuffer()), scene.inner)
        return bytesToDataUrl(value, scene.inner)
      }
      const file = lookup(files, path)
      if (!file) throw new Error('not-indexed')
      return toDataUrl(file)
    },
    // Direct object URL — skips the base64 round-trip that made large scene
    // resources (hundreds of MB) slow and memory-hungry.
    async readFileObjectUrl(path) {
      const scene = parseScenePath(path)
      if (scene) {
        const value = sceneBytes(scene.token, scene.inner)
        if (!value) throw new Error('scene-store-missing')
        if (value instanceof Blob) return URL.createObjectURL(value)
        const mime = /\.png$/i.test(scene.inner) ? 'image/png' : /\.mp4$/i.test(scene.inner) ? 'video/mp4' : 'application/octet-stream'
        return URL.createObjectURL(new Blob([value], { type: mime }))
      }
      const file = lookup(files, path)
      if (!file) throw new Error('not-indexed')
      return URL.createObjectURL(file)
    },
    async readFileBytes(path) {
      const scene = parseScenePath(path)
      if (scene) {
        const value = sceneBytes(scene.token, scene.inner)
        if (!value) throw new Error('scene-store-missing')
        return value instanceof Blob ? value : value
      }
      const file = lookup(files, path)
      if (!file) throw new Error('not-indexed')
      return file.arrayBuffer()
    },
    async selectPaths({ directories = false } = {}) {
      const picked = (await pickFiles({ directories })) || []
      const roots = indexEntries(picked)
      if (!directories) return picked.map(entry => entry.absPath)
      return roots.length ? [roots[0]] : []
    }
  }
  return true
}

function pickWithNativeDialog({ directories }) {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    if (directories) {
      input.setAttribute('webkitdirectory', '')
      input.setAttribute('directory', '')
    }
    input.multiple = true
    input.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;'
    let settled = false
    const finish = value => {
      if (settled) return
      settled = true
      input.remove()
      resolve(value)
    }
    input.addEventListener('cancel', () => finish([]))
    input.addEventListener('change', () => {
      try {
        finish([...(input.files || [])])
      } catch {
        finish([])
      }
    })
    document.body.appendChild(input)
    input.click()
  })
}

export function installZcodeFileBridge() {
  if (typeof window === 'undefined') return false
  if (window.zcodeDesktop) return true
  // Only install in ZCode Desktop (window.zcode exposed by its preload). In
  // Hermes hosts the real hermesDesktop bridge must keep being used.
  const zcode = window.zcode
  if (!zcode) return false
  return attachZcodeFileBridge(window, {
    zcode,
    pickFiles: ({ directories }) => {
      const files = pickWithNativeDialog({ directories })
      return Promise.resolve(files).then(list => list.map(file => ({
        absPath: resolveHostPath(file),
        file
      })))
    }
  })
}

function resolveHostPath(file) {
  try {
    const viaWebUtils = window.zcode?.getPathForFile?.(file)
    if (typeof viaWebUtils === 'string' && viaWebUtils.trim()) return viaWebUtils.trim()
  } catch { /* webUtils unavailable — fall through to the legacy property. */ }
  return typeof file.path === 'string' && file.path.trim() ? file.path.trim() : null
}
