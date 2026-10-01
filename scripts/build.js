/**
 * Build script to generate:
 * 1. Standard ESM plugin.js (100% compatible with plugin specs & test suites)
 * 2. Self-contained ZCode Desktop bundle (dist/zcode-skins.bundle.js) via esbuild & shim
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const i18nCode = fs.readFileSync(path.join(rootDir, 'src/i18n.js'), 'utf8')
const catalogCode = fs.readFileSync(path.join(rootDir, 'src/catalog/builtin-skins.js'), 'utf8')
const backdropCode = fs.readFileSync(path.join(rootDir, 'src/engine/backdrop-manager.js'), 'utf8')
const glassCode = fs.readFileSync(path.join(rootDir, 'src/engine/glass-controller.js'), 'utf8')
const rangeCode = fs.readFileSync(path.join(rootDir, 'src/engine/range-controller.js'), 'utf8')
const configCode = fs.readFileSync(path.join(rootDir, 'src/engine/config.js'), 'utf8')
const contrastCode = fs.readFileSync(path.join(rootDir, 'src/engine/color-contrast.js'), 'utf8')
const storageCode = fs.readFileSync(path.join(rootDir, 'src/engine/storage-manager.js'), 'utf8')
const controllerCode = fs.readFileSync(path.join(rootDir, 'src/engine/skin-controller.js'), 'utf8')
const watcherCode = fs.readFileSync(path.join(rootDir, 'src/engine/theme-watcher.js'), 'utf8')
const weLibraryCode = fs.readFileSync(path.join(rootDir, 'src/engine/we-library.js'), 'utf8')
const sceneCode = fs.readFileSync(path.join(rootDir, 'src/engine/scene-player.js'), 'utf8')
const webCode = fs.readFileSync(path.join(rootDir, 'src/engine/web-player.js'), 'utf8')
const playerCode = fs.readFileSync(path.join(rootDir, 'third_party/dsh-skins/we-player-source.ts'), 'utf8')
const shimCode = fs.readFileSync(path.join(rootDir, 'third_party/dsh-skins/we-shim-source.ts'), 'utf8')
const tryOnBannerCode = fs.readFileSync(path.join(rootDir, 'src/ui/TryOnBanner.js'), 'utf8')
const studioCode = fs.readFileSync(path.join(rootDir, 'src/ui/CustomThemeStudio.js'), 'utf8')
const wePanelCode = fs.readFileSync(path.join(rootDir, 'src/ui/WallpaperEnginePanel.js'), 'utf8')
const pageCode = fs.readFileSync(path.join(rootDir, 'src/ui/SkinCenterPage.js'), 'utf8')
const modalHostCode = fs.readFileSync(path.join(rootDir, 'src/adapter/zcode-modal-host.js'), 'utf8')

function stripImportsAndExports(code) {
  return code
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?/gm, '')
    .replace(/^export\s+(async\s+)?(const|class|function|let|var)\s+/gm, '$1$2 ')
    .replace(/^export\s+default\s+[\s\S]*?;?/gm, '')
    .trim()
}

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))

const sections = [
`/**
 * ZCode Skin Center (zcode-skins)
 * Version: ${pkg.version}
 * Author: CaptainMusX (adapted for ZCode Desktop)
 *
 * Standalone Desktop Beautification & Skin Plugin for ZCode Desktop.
 * Provides skin gallery, custom wallpaper/video engine, glassmorphism translucency,
 * try-on/apply workflows, and theme studio.
 *
 * Third-party portions: dsh-skins, pinned at 82f42bd3bf91ea88475e59a2753f87041a960a56.
 * Copyright (c) 2026, zhu1090093659; historical notice: dsh-external contributors.
 * Changes in this generated file: adapted for ZCode Desktop environment.
 * See LICENSING.md, THIRD-PARTY-NOTICES.md and the accompanying complete license texts.
 */

import {
  atom, Badge, Button, host, Input,
  PALETTE_AREA, ROUTES_AREA, SegmentedControl, SIDEBAR_NAV_AREA,
  Switch, THEMES_AREA,
  usePluginI18n, useTheme, useValue
} from '@hermes/plugin-sdk'
import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
`,
'// ─── Submodule: i18n ──────────────────────────────────────────',
stripImportsAndExports(i18nCode),
'// ─── Submodule: Catalog ───────────────────────────────────────',
stripImportsAndExports(catalogCode),
'// ─── Submodule: Backdrop Engine ───────────────────────────────',
stripImportsAndExports(backdropCode),
'// ─── Submodule: Glassmorphism Controller ──────────────────────',
stripImportsAndExports(glassCode),
'// ─── Submodule: Range Controller ──────────────────────────────',
stripImportsAndExports(rangeCode),
'// ─── Submodule: Config & Contract ─────────────────────────────',
stripImportsAndExports(configCode),
'// ─── Submodule: Color & Contrast ──────────────────────────────',
stripImportsAndExports(contrastCode),
'// ─── Submodule: Storage Manager ───────────────────────────────',
stripImportsAndExports(storageCode),
'// ─── Submodule: Skin Controller ───────────────────────────────',
stripImportsAndExports(controllerCode),
'// ─── Submodule: Theme Watcher ─────────────────────────────────',
stripImportsAndExports(watcherCode),
'// ─── Submodule: Wallpaper Engine Library ─────────────────────',
stripImportsAndExports(weLibraryCode),
'// ─── Explicitly MIT-marked WebGL player from dsh-skins ──────',
stripImportsAndExports(playerCode),
stripImportsAndExports(shimCode),
'// ─── Scene Player Bridge ─────────────────────────────────────',
stripImportsAndExports(sceneCode),
'// ─── Sandboxed Web Wallpaper Bridge ──────────────────────────',
stripImportsAndExports(webCode),
'// ─── Submodule: Try-On Banner ────────────────────────────────',
stripImportsAndExports(tryOnBannerCode),
'// ─── Submodule: Custom Theme Studio ──────────────────────────',
stripImportsAndExports(studioCode),
'// ─── Submodule: Wallpaper Engine Panel ───────────────────────',
stripImportsAndExports(wePanelCode),
'// ─── Submodule: Skin Center Page ─────────────────────────────',
stripImportsAndExports(pageCode),
'// ─── Submodule: ZCode Modal & Floating Host ──────────────────',
stripImportsAndExports(modalHostCode),
`// ─── Plugin Registration Entry ────────────────────────────────
const PLUGIN_ID = 'zcode-skins'

export default {
  id: PLUGIN_ID,
  name: 'ZCode Skin Center',
  defaultEnabled: true,

  register(ctx) {
    ctx?.i18n?.register?.(I18N_DICTIONARY)
    const store = createSkinStore(ctx)
    const backdropManager = new BackdropManager()
    const glassController = new GlassController()
    const rangeController = new RangeController()
    rangeController.start()
    const controller = new SkinController(store, BUILTIN_SKINS, backdropManager, glassController)

    for (const skin of BUILTIN_SKINS) {
      ctx?.register?.({
        id: 'theme-' + skin.id,
        area: THEMES_AREA,
        data: toThemeContribution(skin)
      })
    }
    for (const skin of store.$config.get().customSkins) {
      ctx?.register?.({ id: 'theme-' + skin.id, area: THEMES_AREA, data: toThemeContribution(skin) })
    }

    ctx?.register?.({
      id: 'page',
      area: ROUTES_AREA,
      data: { path: '/skins' },
      render: () => jsx(SkinCenterPage, {
        store,
        controller,
        prepareScene: dir => ctx?.rest?.('/scene/prepare', { method: 'POST', body: { dir } })
      })
    })

    ctx?.register?.({
      id: 'sidebar-nav',
      area: SIDEBAR_NAV_AREA,
      order: 85,
      data: {
        path: '/skins',
        label: '皮肤中心',
        codicon: 'symbol-color'
      }
    })

    const disposeThemeWatcher = watchRootTheme(store, controller)

    ctx?.register?.({
      id: 'cmd-open-skins',
      area: PALETTE_AREA,
      data: {
        id: 'zcode-skins.open-gallery',
        title: 'Skin Center: Open Gallery / 皮肤中心: 打开画廊',
        keywords: ['skin', 'theme', 'wallpaper', 'gallery', '换肤', '皮肤', '壁纸'],
        run: () => host?.navigate?.('/skins')
      }
    })

    ctx?.register?.({
      id: 'cmd-toggle-wallpaper',
      area: PALETTE_AREA,
      data: {
        id: 'zcode-skins.toggle-wallpaper',
        title: 'Skin Center: Toggle Wallpaper / 皮肤中心: 切换壁纸开关',
        keywords: ['skin', 'wallpaper', 'toggle', '壁纸'],
        run: () => {
          const next = !store.$config.get().wallpaperEnabled
          controller.changeConfig({ wallpaperEnabled: next })
          host?.notify?.({
            kind: 'info',
            message: next ? 'Custom wallpaper enabled' : 'Custom wallpaper disabled'
          })
        }
      }
    })

    if (typeof document !== 'undefined') {
      controller.sync(document.documentElement?.dataset?.hermesTheme || 'zcode-default',
        document.documentElement?.dataset?.hermesMode || 'dark')
      setupZCodeFloatingHost({ store, controller })
    }

    if (typeof ctx?.onDispose === 'function') {
      ctx.onDispose(() => {
        disposeThemeWatcher()
        rangeController.destroy()
        controller.destroy()
      })
    }
  }
}
`
]

const bundled = sections.join('\n\n')
const outPath = path.join(rootDir, 'plugin.js')
const cleanBundle = bundled.replace(/[ \t]+$/gm, '')
fs.writeFileSync(outPath, cleanBundle, 'utf8')
console.log(`[build] Successfully compiled plugin to ${outPath} (${Buffer.byteLength(cleanBundle)} bytes)`)

// Next, compile self-contained standalone bundle for direct ZCode Desktop injection (no external dependencies)
const distDir = path.join(rootDir, 'dist')
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true })

const entryCode = `
import { createSkinStore } from '../src/engine/storage-manager.js'
import { BackdropManager } from '../src/engine/backdrop-manager.js'
import { GlassController } from '../src/engine/glass-controller.js'
import { RangeController } from '../src/engine/range-controller.js'
import { SkinController } from '../src/engine/skin-controller.js'
import { watchRootTheme } from '../src/engine/theme-watcher.js'
import { BUILTIN_SKINS } from '../src/catalog/builtin-skins.js'
import { setupZCodeFloatingHost } from '../src/adapter/zcode-modal-host.js'

function boot() {
  if (typeof window === 'undefined' || window.__ZCODE_SKINS_INJECTED__) return
  window.__ZCODE_SKINS_INJECTED__ = true

  const store = createSkinStore()
  const backdropManager = new BackdropManager()
  const glassController = new GlassController()
  const rangeController = new RangeController()
  rangeController.start()
  const controller = new SkinController(store, BUILTIN_SKINS, backdropManager, glassController)
  watchRootTheme(store, controller)

  const isDark = document.documentElement.classList.contains('dark') ||
    document.body.classList.contains('dark') ||
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
  controller.sync('zcode-default', isDark ? 'dark' : 'light')

  setupZCodeFloatingHost({ store, controller })
  console.log('[zcode-skins] ZCode Desktop Skin Center initialized successfully!')
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
`
const tempEntry = path.join(distDir, 'entry.tmp.js')
fs.writeFileSync(tempEntry, entryCode, 'utf8')

try {
  await esbuild.build({
    entryPoints: [tempEntry],
    outfile: path.join(distDir, 'zcode-skins.bundle.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    alias: {
      '@hermes/plugin-sdk': path.join(rootDir, 'src/adapter/zcode-sdk-shim.js'),
      'nanostores': path.join(rootDir, 'src/adapter/zcode-sdk-shim.js')
    },
    define: {
      'process.env.NODE_ENV': '"production"'
    }
  })
  console.log('[build] Standalone ZCode Desktop injection bundle compiled to dist/zcode-skins.bundle.js')
} catch (e) {
  console.error('[build] Warning: Could not compile dist bundle:', e)
} finally {
  if (fs.existsSync(tempEntry)) fs.unlinkSync(tempEntry)
}
