import test from 'node:test'
import assert from 'node:assert/strict'
import { loadWebWallpaper } from '../src/engine/web-player.js'

test('decorative resource errors cannot swallow the web resource budget', async () => {
  const root = 'D:\\WE\\example'
  const bridge = {
    readDir: async () => ({ entries: [{ path: root + '\\large.png', isDirectory: false }] }),
    readFileText: async path => ({ text: path.endsWith('index.html') ? '<html></html>' : '' }),
    readFileDataUrl: async () => 'x'.repeat(64 * 1024 * 1024 + 1)
  }
  await assert.rejects(loadWebWallpaper(bridge, root + '\\index.html', ''), /64 MiB/)
})

test('web resource traversal cannot enter a sibling with the same path prefix', async () => {
  const root = 'D:\\WE\\example'
  let reads = 0
  const bridge = {
    readDir: async () => ({ entries: [{ path: root + '-other\\secret.png', isDirectory: false }] }),
    readFileText: async () => ({ text: '<html></html>' }),
    readFileDataUrl: async () => { reads++; return '' }
  }
  await loadWebWallpaper(bridge, root + '\\index.html', '')
  assert.equal(reads, 0)
})

test('web wallpaper bundles local script and image into an isolated document', async () => {
  const root = 'D:\\WE\\example'
  const main = `${root}\\index.html`
  const contents = new Map([
    [main.toLowerCase(), '<html><head></head><body><script src="main.js"></script><img src="pic.png"></body></html>'],
    [`${root}\\main.js`.toLowerCase(), 'parent.postMessage({type:"web-loaded"},"*")'],
    [`${root}\\project.json`.toLowerCase(), JSON.stringify({ general: { properties: { speed: { value: 2 } } } })]
  ])
  const bridge = {
    async readDir() { return { entries: ['index.html', 'main.js', 'pic.png', 'project.json']
      .map(name => ({ name, path: `${root}\\${name}`, isDirectory: false })) } },
    async readFileText(path) { return { text: contents.get(path.toLowerCase()) || '', truncated: false } },
    async readFileDataUrl() { return 'data:image/png;base64,AAAA' }
  }
  const html = await loadWebWallpaper(bridge, main, 'window.testShim=true;')
  assert.match(html, /window\.testShim=true/)
  assert.match(html, /parent\.postMessage/)
  assert.match(html, /data:image\/png;base64,AAAA/)
  assert.doesNotMatch(html, /src="main\.js"/)
  assert.match(html, /"speed":\{"value":2\}/)
})
