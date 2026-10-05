import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CONFIG, normalizeConfig } from '../src/engine/config.js'
import { BackdropManager, normalizeMediaSource } from '../src/engine/backdrop-manager.js'
import { GlassController } from '../src/engine/glass-controller.js'
import { SkinController } from '../src/engine/skin-controller.js'

function fixture() {
  let config = { ...DEFAULT_CONFIG }
  let preview = null
  let base = null
  const calls = []
  const store = {
    $config: { get: () => config },
    $tryOnSkin: { get: () => preview },
    $tryOnBaseTheme: { get: () => base },
    saveConfig(change) { config = normalizeConfig(typeof change === 'function' ? change(config) : { ...config, ...change }); return config },
    startTryOn(skin, name) { base ??= name; preview = skin },
    exitTryOn() { preview = null; base = null }
  }
  const skins = [{ id: 'blue-fantasy', name: 'Blue', wallpaper: 'https://example.com/blue.png', wallpaperType: 'image' }]
  const backdrop = { update: options => { calls.push(['backdrop', options]); return Boolean(options.enabled && normalizeMediaSource(options.src, options.type)) }, destroy: () => calls.push(['backdrop.destroy']) }
  const glass = { update: options => calls.push(['glass', options]), destroy: () => calls.push(['glass.destroy']) }
  const controller = new SkinController(store, skins, backdrop, glass)
  const theme = { themeName: 'nous-alt', renderedMode: 'dark',
    previewTheme: (...args) => calls.push(['preview', ...args]),
    clearThemePreview: () => calls.push(['clearPreview']),
    setTheme: name => calls.push(['setTheme', name]) }
  return { store, calls, controller, theme, skin: skins[0] }
}

test('ZCode host theme notifications retain the persisted selected skin', () => {
  const f = fixture()
  f.store.saveConfig({ activeSkinId: f.skin.id, wallpaperEnabled: true })
  f.controller.sync('zcode-default', 'light')
  assert.equal(f.calls.find(([type]) => type === 'backdrop')[1].src, f.skin.wallpaper)
  f.controller.destroy()
  const count = f.calls.length
  f.controller.sync('zcode-default', 'dark')
  assert.equal(f.calls.length, count, 'late callbacks cannot restart a disposed skin')
})

test('fresh config stays inert and legacy transparency is bounded', () => {
  assert.equal(normalizeConfig(null).activeSkinId, 'default')
  assert.equal(normalizeConfig(null).wallpaperEnabled, false)
  assert.equal(normalizeConfig({ maskOcclusion: 500 }).maskOcclusion, 100)
  assert.equal(normalizeConfig({ wallpaperBlur: -5 }).wallpaperBlur, 0)
  assert.equal(normalizeConfig({ wallpaperBlur: 61 }).wallpaperBlur, 60)
})

test('percent parameters honor the full 0-100 range at every endpoint', () => {
  for (const key of ['maskOcclusion', 'wallpaperOpacity', 'panelGlass', 'bubbleOpacity', 'wallpaperVolume']) {
    for (const value of [0, 50, 100]) {
      // schema 4: every stored value is a deliberate user choice and survives.
      const stored = normalizeConfig({ schemaVersion: 4, [key]: value })
      assert.equal(stored[key], value, `${key}=${value} must survive normalization unchanged`)
      const reloaded = normalizeConfig(JSON.parse(JSON.stringify(stored)))
      assert.equal(reloaded[key], value, `${key}=${value} must survive a reload round-trip`)
    }
  }
})

test('upgrades keep stored numbers instead of rewriting them', () => {
  // Schema-1 shipped panelGlass 80 (80% transparency). The 0-100 contract
  // makes that value legal, so it must survive as 80 — not be coerced to 15.
  assert.equal(normalizeConfig({ panelGlass: 80 }).panelGlass, 80)
  assert.equal(normalizeConfig({ schemaVersion: 2, panelGlass: 60 }).panelGlass, 60)
  // Old bubbles were clamped to 70-100; a stored 70 stays 70 and 0 is legal.
  assert.equal(normalizeConfig({ bubbleOpacity: 70 }).bubbleOpacity, 70)
  assert.equal(normalizeConfig({ bubbleOpacity: 0 }).bubbleOpacity, 0)
  // DSH-ceiling 90 occlusion is preserved, and the defaults only fill gaps.
  assert.equal(normalizeConfig({ maskOcclusion: 90 }).maskOcclusion, 90)
  assert.equal(normalizeConfig({}).maskOcclusion, DEFAULT_CONFIG.maskOcclusion)
  assert.equal(normalizeConfig({}).panelGlass, DEFAULT_CONFIG.panelGlass)
})

test('media sources accept web/local paths and reject unsafe schemes', () => {
  assert.equal(normalizeMediaSource('https://example.com/a.png'), 'https://example.com/a.png')
  assert.equal(normalizeMediaSource('C:\\Pictures\\a b.png'), 'file:///C:/Pictures/a%20b.png')
  assert.equal(normalizeMediaSource('javascript:alert(1)'), null)
  assert.equal(normalizeMediaSource('data:text/html,<script>x</script>'), null)
  assert.equal(normalizeMediaSource('data:image/png;base64,AAAA', 'video'), null)
})

test('failed media is hidden and remains disabled for the same source', () => {
  const manager = new BackdropManager()
  let notified = 0
  manager.root = { style: {} }
  manager.media = { style: {}, querySelector: () => null, replaceChildren() {} }
  // Keys gained a live/frame suffix; the fixture mirrors the live-mode key.
  manager.currentKey = 'image:https://example.com/bad.png:live'
  manager.onVisibilityChange = () => { notified += 1 }
  manager.fail(manager.currentKey)
  assert.equal(manager.root.style.display, 'none')
  assert.equal(notified, 1)
  assert.equal(manager.update({ enabled: true, type: 'image', src: 'https://example.com/bad.png' }), false)
})

function backdropFixture() {
  const elements = []
  const make = () => {
    const el = {
      style: {}, dataset: {}, isConnected: false,
      setAttribute() {}, appendChild(child) { elements.push(child) },
      querySelector: () => null,
      replaceChildren() {}, remove() {}, prepend() {}
    }
    elements.push(el)
    return el
  }
  const previousDocument = globalThis.document
  globalThis.document = {
    documentElement: { dataset: {} },
    body: { prepend() {} },
    getElementById: () => null,
    createElement: make,
    addEventListener() {},
    removeEventListener() {}
  }
  return { manager: new BackdropManager(), elements, restore: () => { globalThis.document = previousDocument } }
}

test('backdrop endpoints are honest: mask 100, opacity 0, blur 60 with overscan', () => {
  const { manager, restore } = backdropFixture()
  try {
    assert.equal(manager.update({ enabled: true, src: 'https://example.com/a.png', occlusion: 100, blur: 60, opacity: 0 }), true)
    // Occlusion 100 = the veil fully hides the wallpaper (no 0.9 ceiling).
    assert.equal(manager.mask.style.backgroundColor, 'rgba(0,0,0,1)')
    // Wallpaper opacity 0 = the media layer is invisible, not knocked back to 1.
    assert.equal(manager.media.style.opacity, '0')
    // 60px blur is honored and the media box overscans by the blur radius so
    // no white rim shows at the viewport edges.
    assert.equal(manager.media.style.filter, 'blur(60px)')
    assert.equal(manager.media.style.inset, '-68px')
    // Blur 0 must not leave a stale blur filter behind.
    assert.equal(manager.update({ enabled: true, src: 'https://example.com/a.png', blur: 0, occlusion: 0 }), true)
    assert.equal(manager.media.style.filter, 'none')
    assert.equal(manager.mask.style.backgroundColor, 'rgba(0,0,0,0)')
    // Light mode uses the white veil at the same alpha.
    assert.equal(manager.update({ enabled: true, src: 'https://example.com/a.png', occlusion: 35, isDark: false }), true)
    assert.equal(manager.mask.style.backgroundColor, 'rgba(255,255,255,0.35)')
  } finally {
    restore()
  }
})

test('try-on is transient, apply persists, restore returns to previous Hermes theme', () => {
  const { calls, controller, store, theme, skin } = fixture()
  controller.sync(theme.themeName, theme.renderedMode)
  assert.equal(calls.at(-1)[1].enabled, false)
  controller.tryOn(skin, theme)
  assert.deepEqual(calls.find(call => call[0] === 'preview'), ['preview', 'blue-fantasy', 'dark'])
  assert.equal(calls.some(call => call[0] === 'setTheme'), false)
  assert.equal(store.$config.get().activeSkinId, 'default')
  assert.equal(store.$config.get().wallpaperEnabled, false)
  assert.equal(calls.findLast(call => call[0] === 'backdrop')[1].enabled, true)
  controller.exitTryOn(theme)
  assert.equal(store.$tryOnSkin.get(), null)
  controller.apply(skin, theme)
  assert.equal(store.$config.get().activeSkinId, 'blue-fantasy')
  assert.equal(store.$config.get().previousTheme, 'nous-alt')
  assert.deepEqual(calls.findLast(call => call[0] === 'setTheme'), ['setTheme', 'blue-fantasy'])
  controller.restore(theme)
  assert.deepEqual(calls.findLast(call => call[0] === 'setTheme'), ['setTheme', 'nous-alt'])
  assert.equal(store.$config.get().wallpaperEnabled, false)
})

test('external Hermes theme switch removes wallpaper effects', () => {
  const { calls, controller, theme, skin } = fixture()
  controller.apply(skin, theme)
  controller.sync('another-theme', 'light')
  assert.equal(calls.findLast(call => call[0] === 'glass')[1].enabled, false)
  assert.equal(calls.findLast(call => call[0] === 'backdrop')[1].enabled, false)
})

test('Wallpaper Engine selection works on a stock Hermes theme and survives skin changes', () => {
  const { calls, controller, store, theme, skin } = fixture()
  controller.sync(theme.themeName, theme.renderedMode)
  controller.changeConfig({ wallpaperEnabled: true, wallpaperType: 'video',
    wallpaperSource: 'hermes-media://stream/D%3A%5CWallpapers%5Cfilm.mp4' })
  assert.equal(calls.findLast(call => call[0] === 'backdrop')[1].enabled, true)
  controller.apply(skin, theme)
  assert.equal(store.$config.get().wallpaperType, 'video')
  assert.match(store.$config.get().wallpaperSource, /^hermes-media:/)
  controller.restore(theme)
  assert.equal(store.$config.get().wallpaperEnabled, true)
  assert.equal(calls.findLast(call => call[0] === 'backdrop')[1].enabled, true)
})

test('dispose ends an in-progress preview and removes owned effects', () => {
  const { calls, controller, theme, skin } = fixture()
  controller.tryOn(skin, theme)
  controller.destroy()
  assert.ok(calls.some(call => call[0] === 'clearPreview'))
  assert.ok(calls.some(call => call[0] === 'backdrop.destroy'))
  assert.ok(calls.some(call => call[0] === 'glass.destroy'))
})
