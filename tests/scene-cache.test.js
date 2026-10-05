import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareSceneInMemory } from '../src/engine/scene-prepare.js'
import { loadSceneManifest } from '../src/engine/scene-player.js'

test('version-6 Uint8Array caches restore without reopening a large package', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ parserVersion: 6, manifest: { layers: [] }, resources: {} }))
  let reads = 0, registered = false
  const bridge = { readFileText() { reads++; throw Error('no access') }, readFileBytes() { reads++; throw Error('no access') },
    loadSceneArtifacts: async () => ({ files: { 'manifest.json': bytes } }), registerSceneSource() { registered = true } }
  const result = await prepareSceneInMemory(bridge, 'D:/WE/example')
  assert.equal(result.ok, true); assert.equal(registered, true); assert.equal(reads, 0)
})

test('obsolete cache remains registered for preview if source package is unavailable', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ manifest: { layers: [] }, resources: {}, project: { type: 'scene', file: 'scene.json' } }))
  let registered = false, writes = 0
  const bridge = { readFileText: async () => { throw Error('folder permission missing') }, readFileBytes: async () => { throw Error('folder permission missing') },
    loadSceneArtifacts: async () => ({ files: { 'manifest.json': bytes } }), registerSceneSource() { registered = true },
    saveSceneArtifacts() { writes++ } }
  await assert.rejects(prepareSceneInMemory(bridge, 'D:/WE/example'), error => error.code === 'SCENE_PKG_UNAVAILABLE')
  assert.equal(registered, true); assert.equal(writes, 0)
})

test('old manifest is re-prepared before obsolete resources are loaded', async () => {
  const old = { scenePath: 'D:/WE/example/scene.pkg', manifest: { layers: [] }, resources: { old: 'old.png' } }
  const fresh = { parserVersion: 6, manifest: { layers: [] }, resources: {} }
  const bridge = { readFileText: async p => ({ text: JSON.stringify(p === 'new.json' ? fresh : old) }),
    readFileDataUrl: () => { throw Error('old resource must not be read') } }
  let prepared = 0
  const scene = await loadSceneManifest(bridge, 'old.json', async dir => {
    assert.equal(dir, 'D:/WE/example'); prepared++; return { ok: true, manifest: true, manifestPath: 'new.json' }
  })
  assert.equal(prepared, 1); assert.deepEqual(scene.objectUrls, [])
})

test('cancelling after a bridge URL is created revokes it and stops loading', async () => {
  const abort = new AbortController(), oldRevoke = URL.revokeObjectURL
  const revoked = []
  URL.revokeObjectURL = value => revoked.push(value)
  try {
    const bridge = { readFileText: async () => ({ text: JSON.stringify({ manifest: {}, resources: { one: 'one.png' } }) }),
      readFileDataUrl() {}, readFileObjectUrl: async () => { abort.abort(); return 'blob:cancelled' } }
    await assert.rejects(loadSceneManifest(bridge, 'cache.json', null, abort.signal), error => error.name === 'AbortError')
    assert.deepEqual(revoked, ['blob:cancelled'])
  } finally { URL.revokeObjectURL = oldRevoke }
})
