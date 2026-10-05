import test from 'node:test'
import assert from 'node:assert/strict'
import { GlassController, parseSerializedColor } from '../src/engine/glass-controller.js'

function fixture() {
  const old = globalThis.document
  const attrs = new Map([['data-hermes-skins-active', 'true']])
  const children = []
  let writes = 0
  globalThis.document = {
    documentElement: { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k) },
    head: { contains: el => children.includes(el), appendChild: el => { children.push(el); el.isConnected = true } },
    getElementById: () => children[0],
    createElement: () => {
      let text = ''
      return { dataset: {}, get textContent() { return text }, set textContent(value) { writes++; text = value },
        remove() { children.splice(children.indexOf(this), 1); this.isConnected = false } }
    }
  }
  return { attrs, children, writes: () => writes, restore: () => { globalThis.document = old } }
}

test('color parser handles Chromium serializations and rejects unresolved variables', () => {
  assert.deepEqual(parseSerializedColor('color(srgb 0.5 0.6 0.7 / 0.45)'), { r: 128, g: 153, b: 179, a: 0.45 })
  assert.deepEqual(parseSerializedColor('rgba(255, 255, 255, 0.3)'), { r: 255, g: 255, b: 255, a: 0.3 })
  assert.deepEqual(parseSerializedColor('#aabbcc'), { r: 170, g: 187, b: 204, a: 1 })
  assert.equal(parseSerializedColor('var(--unresolved)'), null)
})

test('ZCode material honors transparency and independent frost endpoints', () => {
  const f = fixture()
  try {
    const glass = new GlassController()
    glass.update({ enabled: true, glassTransparency: 100, surfaceFrost: 0, composerFrost: 1, bubbleOpacity: 0 })
    assert.equal(f.attrs.get('data-zcode-skins-active'), 'true')
    assert.equal(f.attrs.has('data-hermes-skins-active'), false)
    assert.match(glass.styleEl.textContent, /--zcode-skins-keep: 0%/)
    assert.match(glass.styleEl.textContent, /--zcode-skins-frost: none/)
    assert.match(glass.styleEl.textContent, /--zcode-skins-composer-frost: blur\(1px\)/)
    glass.update({ enabled: true, glassTransparency: 0, surfaceFrost: 20, composerFrost: 0 })
    assert.match(glass.styleEl.textContent, /--zcode-skins-keep: 100%/)
    assert.match(glass.styleEl.textContent, /--zcode-skins-frost: blur\(20px\)/)
    assert.match(glass.styleEl.textContent, /--zcode-skins-composer-frost: none/)
  } finally { f.restore() }
})

test('identical syncs do not rewrite CSS and disabling releases all owned flags', () => {
  const f = fixture()
  try {
    const glass = new GlassController()
    glass.update({ enabled: true })
    glass.update({ enabled: true })
    assert.equal(f.writes(), 1)
    glass.update({ enabled: false })
    assert.equal(f.children.length, 0)
    assert.equal(f.attrs.size, 0)
    glass.destroy()
  } finally { f.restore() }
})

test('composer, capsule and card backgrounds have independent values', () => {
  const f = fixture()
  try {
    const glass = new GlassController()
    glass.update({ enabled: true, glassTransparency: 100, composerTransparency: 20, capsuleTransparency: 80, cardTransparency: 45 })
    const css = glass.styleEl.textContent
    assert.match(css, /--zcode-skins-composer-tint: [^;]+80%, transparent/)
    assert.match(css, /--zcode-skins-capsule-tint: [^;]+20%, transparent/)
    assert.match(css, /--zcode-skins-card-tint: [^;]+55%, transparent/)
    assert.match(css, /--zcode-skins-keep: 0%/)
  } finally { f.restore() }
})
