import { atom } from 'nanostores'
import { normalizeConfig } from './config.js'
import { ensurePaletteContrast } from './color-contrast.js'

export function toThemeContribution(skin) {
  const complete = colors => ensurePaletteContrast({
    ...colors,
    destructive: colors.destructive || '#dc2626',
    destructiveForeground: colors.destructiveForeground || '#ffffff'
  })
  return {
    name: skin.id,
    label: skin.name || skin.nameEn || skin.id,
    description: skin.tagline || skin.description || '',
    colors: complete(skin.colors),
    darkColors: complete(skin.darkColors || skin.colors)
  }
}

export function createSkinStore(ctx) {
  const defaultStorage = {
    get(key, fallback) {
      try {
        const val = localStorage.getItem(`zcode-skins:${key}`)
        return val ? JSON.parse(val) : fallback
      } catch {
        return fallback
      }
    },
    set(key, val) {
      try {
        localStorage.setItem(`zcode-skins:${key}`, JSON.stringify(val))
      } catch {}
    }
  }
  const storage = ctx?.storage || defaultStorage

  const $config = atom(normalizeConfig(storage.get('config', {})))
  const $tryOnSkin = atom(null)
  const $tryOnBaseTheme = atom(null)

  function saveConfig(updater) {
    const prev = $config.get()
    const next = normalizeConfig(typeof updater === 'function' ? updater(prev) : { ...prev, ...updater })
    storage.set('config', next)
    $config.set(next)
    return next
  }

  function startTryOn(skin, themeName) {
    if (!$tryOnSkin.get()) $tryOnBaseTheme.set(themeName)
    $tryOnSkin.set(skin)
  }

  function exitTryOn() {
    $tryOnSkin.set(null)
    $tryOnBaseTheme.set(null)
  }

  function addCustomSkin(skin) {
    if (ctx && typeof ctx.register === 'function') {
      try {
        ctx.register({ id: `theme-${skin.id}`, area: 'themes', data: toThemeContribution(skin) })
      } catch {}
    }
    saveConfig(prev => ({ ...prev, customSkins: [skin, ...prev.customSkins] }))
  }

  return { $config, $tryOnSkin, $tryOnBaseTheme, saveConfig, startTryOn, exitTryOn, addCustomSkin }
}
