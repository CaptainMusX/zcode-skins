import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFileIndex, attachZcodeFileBridge, installZcodeFileBridge } from '../src/adapter/zcode-file-bridge.js'
import { readWallpaperProject, scanWallpaperEngine } from '../src/engine/we-library.js'
import { rehydrateSceneWallpaper, sceneTokenForDir } from '../src/engine/scene-prepare.js'

const fakeFile = (name, body = '') => ({ name, text: async () => body, arrayBuffer: async () => new TextEncoder().encode(body).buffer })

test('buildFileIndex registers ancestors, files, and the picked root', () => {
  const index = buildFileIndex([
    { absPath: 'D:\\Steam\\steamapps\\workshop\\content\\431960\\1001\\project.json', file: fakeFile('project.json') },
    { absPath: 'D:/Steam/steamapps/workshop/content/431960/1001/preview.jpg', file: fakeFile('preview.jpg') }
  ])
  const container = index.dirs.get('d:\\steam\\steamapps\\workshop\\content\\431960')
  assert.ok(container.some(entry => entry.name === '1001' && entry.isDirectory))
  const project = index.dirs.get('d:\\steam\\steamapps\\workshop\\content\\431960\\1001')
  assert.ok(project.some(entry => entry.name === 'project.json' && !entry.isDirectory))
  assert.ok(project.some(entry => entry.name === 'preview.jpg' && !entry.isDirectory))
  assert.equal(index.files.get('d:\\steam\\steamapps\\workshop\\content\\431960\\1001\\project.json').name, 'project.json')
  assert.deepEqual(index.roots, ['D:\\Steam'])
})

test('attachZcodeFileBridge serves we-library scans from the indexed snapshot', async () => {
  const target = {}
  const projectJson = JSON.stringify({ type: 'video', title: 'Bridge video', file: 'film.mp4', preview: 'preview.jpg' })
  const picked = [
    { absPath: 'D:\\WE\\steamapps\\workshop\\content\\431960\\9001\\project.json', file: fakeFile('project.json', projectJson) },
    { absPath: 'D:\\WE\\steamapps\\workshop\\content\\431960\\9001\\film.mp4', file: fakeFile('film.mp4') },
    { absPath: 'D:\\WE\\steamapps\\workshop\\content\\431960\\9001\\preview.jpg', file: fakeFile('preview.jpg') }
  ]
  assert.equal(attachZcodeFileBridge(target, {
    zcode: { getPathForFile: file => file.__absPath },
    pickFiles: async ({ directories }) => (directories ? picked : [])
  }), true)

  const roots = await target.zcodeDesktop.selectPaths({ directories: true })
  assert.deepEqual(roots, ['D:\\WE'])

  const scan = await scanWallpaperEngine(target.zcodeDesktop, roots)
  assert.equal(scan.error, null)
  assert.equal(scan.items.length, 1)
  assert.equal(scan.items[0].mediaType, 'video')

  const project = await readWallpaperProject(target.zcodeDesktop, 'D:\\WE\\steamapps\\workshop\\content\\431960\\9001', 'workshop')
  assert.equal(project.title, 'Bridge video')
  const singleSeparatorPath = picked[0].absPath.replace(/[\\/]+/g, '\\')
  assert.equal((await target.zcodeDesktop.readFileText(singleSeparatorPath)).text, projectJson,
    'single and doubled Windows separators refer to the same indexed file')

  await assert.rejects(
    () => target.zcodeDesktop.readFileDataUrl('D:\\missing\\file.png'),
    /not-indexed/
  )
})

test('installZcodeFileBridge is a no-op outside ZCode Desktop', () => {
  delete globalThis.window
  assert.equal(installZcodeFileBridge(), false)
  globalThis.window = {}
  assert.equal(installZcodeFileBridge(), false)
  delete globalThis.window
})

/** Node lacks the DOM events the bridge dispatches — stub them per test. */
function makeWindow(bridge) {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type) { this.type = type }
  }
  return { zcodeDesktop: bridge, dispatchEvent() {} }
}

/** Minimal in-memory indexedDB: enough surface for the bridge's kv helpers
 * (open → transaction → objectStore put/get/delete), settling asynchronously
 * like the real thing so the await chains hold. */
function makeFakeIndexedDB() {
  const databases = new Map()
  class FakeRequest {
    constructor(exec) {
      this.onsuccess = null; this.onerror = null; this.result = undefined; this.error = null
      queueMicrotask(() => {
        try { this.result = exec(); this.onsuccess?.() } catch (error) { this.error = error; this.onerror?.(error) }
      })
    }
  }
  return {
    databases,
    open(name) {
      return new FakeRequest(() => {
        if (!databases.has(name)) databases.set(name, new Map())
        const db = databases.get(name)
        return {
          objectStoreNames: { contains: () => true },
          transaction(storeName) {
            if (!db.has(storeName)) db.set(storeName, new Map())
            const store = db.get(storeName)
            // The bridge assigns oncomplete/onerror on the RETURNED object —
            // the completion microtask must close over that same object.
            const tx = { oncomplete: null, onerror: null }
            queueMicrotask(() => tx.oncomplete?.())
            return Object.assign(tx, {
              objectStore: () => ({
                put: (value, key) => { store.set(key, value); return new FakeRequest(() => undefined) },
                get: key => new FakeRequest(() => store.get(key)),
                delete: key => new FakeRequest(() => { store.delete(key) })
              })
            })
          }
        }
      })
    }
  }
}

function seedLegacyArtifacts(manifest) {
  const storeMap = globalThis.indexedDB.databases
  if (!storeMap.has('zcode-skins-cache')) storeMap.set('zcode-skins-cache', new Map())
  const db = storeMap.get('zcode-skins-cache')
  if (!db.has('kv')) db.set('kv', new Map())
  db.get('kv').set(
    'scene-artifacts', { at: 1, files: { 'manifest.json': new TextEncoder().encode(manifest) } })
}

test('scene artifacts and index snapshots roundtrip through consistent IDB keys', async () => {
  globalThis.indexedDB = makeFakeIndexedDB()
  const target = {}
  assert.equal(attachZcodeFileBridge(target, { zcode: { getPathForFile: file => file.__absPath }, pickFiles: async () => [] }), true)
  const bridge = target.zcodeDesktop
  const files = new Map([['manifest.json', new TextEncoder().encode('{"manifest":true,"resources":{}}')]])
  assert.equal(await bridge.saveSceneArtifacts('D:/WE/Scenes/Butterfly', files), true)
  const restored = await bridge.loadSceneArtifacts('d:/we/scenes/butterfly')
  assert.ok(restored?.files, 'the per-scene key must be readable back (write/read keys used to diverge)')
  assert.ok(restored.files['manifest.json'])
  globalThis.window = makeWindow(bridge)
  assert.equal(await bridge.saveIndexSnapshot(), true)
  assert.equal(await bridge.hydrateIndexSnapshot(), true, 'the index snapshot key must match its writer')
})

test('rehydrate adopts legacy artifacts for the active scene and rebuilds the backdrop', async () => {
  globalThis.indexedDB = makeFakeIndexedDB()
  const target = {}
  attachZcodeFileBridge(target, { zcode: { getPathForFile: file => file.__absPath }, pickFiles: async () => [] })
  const bridge = target.zcodeDesktop
  globalThis.window = makeWindow(bridge)

  const dir = 'D:\\WE\\steamapps\\workshop\\content\\431960\\7001'
  const token = sceneTokenForDir(dir)
  const manifest = JSON.stringify({ parserVersion: 6, manifest: true, resources: {}, framePath: null, scripted: false })
  // Pre-fix builds wrote every scene onto this single legacy key.
  seedLegacyArtifacts(manifest)

  let syncCalls = 0
  let hides = 0
  const controller = {
    store: { $config: { get: () => ({
      wallpaperEnabled: true, wallpaperType: 'scene', wallpaperMode: 'live',
      wallpaperSource: `zcode-scene://${token}/manifest.json`,
      weSelection: { id: dir.toLowerCase(), title: 'Scene', kind: 'scene', staticFallback: false, framePath: null, previewPath: null }
    }) } },
    backdrop: { failedKeys: new Set(['poisoned']), hide() { hides += 1 } },
    sync() { syncCalls += 1 }
  }
  rehydrateSceneWallpaper(controller)
  await new Promise(resolve => setTimeout(resolve, 30))

  assert.equal(syncCalls, 1, 'sync runs once the store is restored')
  assert.equal(hides, 1, 'the backdrop is reset so showScene actually rebuilds')
  assert.equal(controller.backdrop.failedKeys.size, 0, 'poisoned failure keys are cleared')
  const file = await bridge.readFileText(`zcode-scene://${token}/manifest.json`)
  assert.match(file?.text || '', /"manifest":true/)
  const migrated = await bridge.loadSceneArtifacts(dir.toLowerCase())
  assert.ok(migrated?.files, 'the legacy entry is re-keyed under the scene directory')
  assert.equal(await bridge.takeLegacySceneArtifacts(), null, 'the legacy key is consumed')
})

test('rehydrate ignores legacy artifacts belonging to a different scene', async () => {
  globalThis.indexedDB = makeFakeIndexedDB()
  const target = {}
  attachZcodeFileBridge(target, { zcode: { getPathForFile: file => file.__absPath }, pickFiles: async () => [] })
  const bridge = target.zcodeDesktop
  globalThis.window = makeWindow(bridge)

  const manifest = JSON.stringify({ manifest: true, resources: {} })
  seedLegacyArtifacts(manifest)

  let syncCalls = 0
  const controller = {
    store: { $config: { get: () => ({
      wallpaperEnabled: true, wallpaperType: 'scene', wallpaperMode: 'live',
      wallpaperSource: `zcode-scene://${sceneTokenForDir('D:\\Other\\Scene')}/manifest.json`,
      weSelection: { id: 'd:/we/scenes/butterfly', title: 'Butterfly', kind: 'scene', staticFallback: false }
    }) } },
    backdrop: { failedKeys: new Set(), hide() {} },
    sync() { syncCalls += 1 }
  }
  rehydrateSceneWallpaper(controller)
  await new Promise(resolve => setTimeout(resolve, 30))

  assert.equal(syncCalls, 0, 'a mismatched legacy store must not be adopted')
  assert.ok(globalThis.indexedDB.databases.get('zcode-skins-cache').get('kv').has('scene-artifacts'),
    'the legacy entry is kept for the scene that actually owns it')
})
