import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConfig, DEFAULT_CONFIG } from '../src/engine/config.js'

test('schema 3 shipped the stock bubble fill as the untouched default; v4 migrates it once', () => {
  const migrated = normalizeConfig({ schemaVersion: 3, bubbleOpacity: 100 })
  assert.equal(migrated.bubbleOpacity, 55)
  assert.equal(migrated.schemaVersion, 5)

  // A 100 stored on the new schema is a deliberate user choice and stays.
  assert.equal(normalizeConfig({ schemaVersion: 4, bubbleOpacity: 100 }).bubbleOpacity, 100)
  // Missing field takes the new default; endpoints stay honest.
  assert.equal(normalizeConfig({}).bubbleOpacity, DEFAULT_CONFIG.bubbleOpacity)
  assert.equal(DEFAULT_CONFIG.bubbleOpacity, 55)
  assert.equal(normalizeConfig({ bubbleOpacity: 0 }).bubbleOpacity, 0)
})

test('independent glass controls migrate without copying a fully transparent interface', () => {
  const config = normalizeConfig({ schemaVersion: 4, panelGlass: 100, composerFrost: 1, surfaceFrost: 0 })
  assert.equal(config.panelGlass, 100)
  assert.equal(config.composerFrost, 1)
  assert.equal(config.surfaceFrost, 0)
  for (const key of ['composerTransparency', 'capsuleTransparency', 'cardTransparency']) {
    assert.equal(config[key], 65)
    assert.equal(normalizeConfig({ [key]: 0 })[key], 0)
    assert.equal(normalizeConfig({ [key]: 100 })[key], 100)
    assert.equal(normalizeConfig({ [key]: 120 })[key], 100)
  }
  const next = normalizeConfig({ ...config, composerTransparency: 20, capsuleTransparency: 80, cardTransparency: 45 })
  assert.deepEqual(normalizeConfig(JSON.parse(JSON.stringify(next))), next)
})
