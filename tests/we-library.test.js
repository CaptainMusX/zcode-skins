import test from 'node:test'
import assert from 'node:assert/strict'
import { joinLocalPath, parseSteamLibraryFolders, readWallpaperProject, safeProjectPath,
  scanWallpaperEngine, wallpaperMediaUrl } from '../src/engine/we-library.js'
import { normalizeMediaSource } from '../src/engine/backdrop-manager.js'

function libraryFixture() {
  const dirs = new Map()
  const files = new Map()
  const root = 'D:\\Program Files (x86)\\Steam'
  const workshop = joinLocalPath(root, 'steamapps', 'workshop', 'content', '431960')
  const video = joinLocalPath(workshop, '1001')
  const scene = joinLocalPath(workshop, '1002')
  const setDir = (path, entries) => dirs.set(path.toLowerCase(), entries.map(entry => ({
    name: entry, path: joinLocalPath(path, entry), isDirectory: !entry.includes('.')
  })))
  setDir(joinLocalPath(root, 'steamapps'), ['workshop', 'libraryfolders.vdf'])
  setDir(workshop, ['1001', '1002'])
  setDir(video, ['project.json', 'film.mp4', 'preview.gif'])
  setDir(scene, ['project.json', 'scene.pkg', 'preview.jpg'])
  // Indexed but outside every scanned container: stands in for library parts
  // a partial scan does not cover (restart timing, quota-trimmed listings).
  const other = 'D:\\WE\\other\\3001'
  setDir('D:\\WE\\other', ['3001'])
  setDir(other, ['project.json'])
  files.set(joinLocalPath(video, 'project.json').toLowerCase(), JSON.stringify({
    type: 'video', title: 'Working video', file: 'film.mp4', preview: 'preview.gif'
  }))
  files.set(joinLocalPath(scene, 'project.json').toLowerCase(), JSON.stringify({
    type: 'scene', title: 'Packed scene', file: 'scene.json', preview: 'preview.jpg'
  }))
  files.set(joinLocalPath(other, 'project.json').toLowerCase(), JSON.stringify({
    type: 'video', title: 'Unscanned but indexed', file: 'film.mp4', preview: 'preview.gif'
  }))
  files.set(joinLocalPath(root, 'steamapps', 'libraryfolders.vdf').toLowerCase(), '"path" "D:\\\\Program Files (x86)\\\\Steam"')
  const bridge = {
    async readDir(path) {
      const entries = dirs.get(path.toLowerCase())
      if (!entries) return { entries: [], error: 'ENOENT' }
      return { entries }
    },
    async readFileText(path) {
      const text = files.get(path.toLowerCase())
      if (!text) throw new Error('not found')
      return { text, truncated: false }
    }
  }
  return { bridge, root, video, scene, other }
}

test('rejects project path traversal and parses Steam libraries', () => {
  assert.equal(safeProjectPath('D:\\project', '..\\outside.mp4'), null)
  assert.equal(safeProjectPath('D:\\project', 'C:\\outside.mp4'), null)
  assert.deepEqual(parseSteamLibraryFolders('"path" "D:\\\\Steam"'), ['D:\\Steam'])
})

test('finds video playback and a static scene preview when scene.json is absent', async () => {
  const { bridge, video, scene } = libraryFixture()
  const playable = await readWallpaperProject(bridge, video, 'workshop')
  const fallback = await readWallpaperProject(bridge, scene, 'workshop')
  assert.equal(playable.mediaType, 'video')
  assert.equal(playable.staticFallback, false)
  assert.equal(fallback.mediaType, 'image')
  assert.equal(fallback.staticFallback, true)
  assert.equal(fallback.mediaPath, joinLocalPath(scene, 'preview.jpg'))
  const url = wallpaperMediaUrl(playable.mediaPath, playable.mediaType)
  // ZCode renderer: absolute paths resolve through normalizeMediaSource's
  // file:/// conversion (Hermes hosts use the hermes-media protocol instead).
  assert.match(normalizeMediaSource(url, 'video'), /^file:\/\/\//)
})

test('auto-discovers an installed Steam library', async () => {
  const { bridge } = libraryFixture()
  const result = await scanWallpaperEngine(bridge)
  assert.equal(result.items.length, 2)
  assert.equal(result.items.filter(item => item.kind === 'video').length, 1)
  assert.equal(result.items.filter(item => item.kind === 'scene').length, 1)
})

const ITEM_CACHE_KEY = 'zcode-skins:we-items'

test('prunes cached wallpapers the index no longer lists, keeps still-indexed ones', async () => {
  const { bridge, other } = libraryFixture()
  const store = new Map()
  const originalStorage = globalThis.localStorage
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value))
  }
  try {
    store.set(ITEM_CACHE_KEY, JSON.stringify({ items: [
      { id: other.toLowerCase(), dir: other, title: 'Unscanned but indexed' },
      { id: 'd:\\we\\gone\\4001', dir: 'D:\\WE\\gone\\4001', title: 'Deleted long ago' }
    ], libraries: [], at: 0 }))
    const result = await scanWallpaperEngine(bridge)
    const ids = result.items.map(item => item.id)
    assert.ok(ids.includes(other.toLowerCase()), 'still-indexed cache entries survive partial scans')
    assert.ok(!ids.includes('d:\\we\\gone\\4001'), 'cache entries whose directory left the index are pruned')
    const persisted = JSON.parse(store.get(ITEM_CACHE_KEY))
    assert.ok(!persisted.items.some(item => item.id === 'd:\\we\\gone\\4001'), 'the pruned entry leaves the persisted cache')
  } finally {
    globalThis.localStorage = originalStorage
  }
})

test('prunes wallpapers whose preview no longer loads from disk, keeps all when probing is blind', async () => {
  const fixture = libraryFixture()
  const bridge = { ...fixture.bridge, isZcodeBridge: true }
  const originalImage = globalThis.Image
  let dead = new Set()
  globalThis.Image = class {
    set src(value) { queueMicrotask(() => (dead.has(value) ? this.onerror?.() : this.onload?.())) }
  }
  try {
    // The stale index still lists both projects, but the disk only serves one
    // preview: the deleted project is pruned while the live one survives.
    dead = new Set([normalizeMediaSource(joinLocalPath(fixture.scene, 'preview.jpg'), 'image')])
    const pruned = await scanWallpaperEngine(bridge)
    assert.deepEqual(pruned.items.map(item => item.title), ['Working video'])

    // Every probe failing means file:/// loading is broken, not the library.
    dead = new Set([normalizeMediaSource(joinLocalPath(fixture.video, 'preview.gif'), 'image'),
      normalizeMediaSource(joinLocalPath(fixture.scene, 'preview.jpg'), 'image')])
    const allDead = await scanWallpaperEngine(bridge)
    assert.equal(allDead.items.length, 2)
  } finally {
    globalThis.Image = originalImage
  }
})
