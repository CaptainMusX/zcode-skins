/** Keeps Hermes' selected theme authoritative and owns every cosmetic effect. */
export class SkinController {
  constructor(store, skins, backdrop, glass) {
    this.store = store
    this.skins = skins
    this.backdrop = backdrop
    this.glass = glass
    this.lastTheme = null
    this.lastMode = 'dark'
    this.previewCleanup = null
    this.backdrop.onVisibilityChange = () => this.sync()
  }

  findSkin(id) {
    return [...this.skins, ...this.store.$config.get().customSkins].find(s => s.id === id)
  }

  sync(themeName = this.lastTheme, renderedMode = this.lastMode) {
    if (this.destroyed) return
    this.lastTheme = themeName
    this.lastMode = renderedMode
    const preview = this.store.$tryOnSkin.get()
    if (preview && this.store.$tryOnBaseTheme.get() !== themeName) {
      this.previewCleanup?.()
      this.previewCleanup = null
      this.store.exitTryOn()
    }
    const activePreview = this.store.$tryOnSkin.get()
    const config = this.store.$config.get()
    const skin = activePreview || this.findSkin(themeName) ||
      (themeName === 'zcode-default' ? this.findSkin(config.activeSkinId) : null)
    const customSource = !activePreview && config.wallpaperSource && !config.wallpaperSource.startsWith('data:image/svg+xml')
    const source = customSource ? config.wallpaperSource : skin?.wallpaper
    const enabled = Boolean(source && (activePreview || config.wallpaperEnabled) && (skin || customSource))
    const showing = this.backdrop.update({
      enabled,
      type: customSource ? config.wallpaperType : (skin?.wallpaperType || 'image'),
      src: source,
      sceneFrame: config.wallpaperType === 'scene' ? (config.weSelection?.framePath || config.weSelection?.previewPath) : null,
      webPreview: config.wallpaperType === 'web' ? config.weSelection?.previewPath : null,
      mode: config.wallpaperMode,
      fit: config.wallpaperFit,
      opacity: config.wallpaperOpacity,
      pauseOnHidden: config.pauseOnHidden,
      sound: config.wallpaperSound,
      volume: config.wallpaperVolume,
      blur: activePreview?.defaultBlur ?? config.wallpaperBlur,
      occlusion: activePreview?.defaultOcclusion ?? config.maskOcclusion,
      isDark: renderedMode === 'dark'
    })
    this.glass.update({ enabled: showing, glassTransparency: config.panelGlass,
      composerTransparency: config.composerTransparency, capsuleTransparency: config.capsuleTransparency,
      cardTransparency: config.cardTransparency,
      bubbleOpacity: config.bubbleOpacity, composerFrost: config.composerFrost,
      surfaceFrost: config.surfaceFrost })
    this.applySkinColors(skin, renderedMode)
  }

  applySkinColors(skin, mode) {
    if (typeof document === 'undefined') return
    let styleEl = document.getElementById('zcode-skin-colors')
    if (!skin || !skin.colors) {
      styleEl?.remove()
      return
    }
    const colors = (mode === 'dark' ? (skin.darkColors || skin.colors) : skin.colors) || {}
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = 'zcode-skin-colors'
      document.head.appendChild(styleEl)
    }
    styleEl.textContent = `
      :root, .dark, html {
        ${colors.primary ? `--color-brand: ${colors.primary} !important; --color-primary: ${colors.primary} !important;` : ''}
        ${colors.accent ? `--color-accent: ${colors.accent} !important;` : ''}
        ${colors.card ? `--color-card: ${colors.card} !important;` : ''}
        ${colors.border ? `--color-border: ${colors.border} !important; --color-card-border: ${colors.border} !important;` : ''}
        ${colors.foreground ? `--color-foreground: ${colors.foreground} !important;` : ''}
      }
    `
  }

  tryOn(skin, theme) {
    this.store.startTryOn(skin, theme?.themeName)
    this.previewCleanup = theme?.clearThemePreview
    if (typeof theme?.previewTheme === 'function') {
      theme.previewTheme(skin.id, theme.renderedMode)
    }
    this.sync(theme?.themeName, theme?.renderedMode)
  }

  exitTryOn(theme) {
    if (typeof theme?.clearThemePreview === 'function') {
      theme.clearThemePreview()
    }
    this.previewCleanup = null
    this.store.exitTryOn()
    this.sync(theme?.themeName, theme?.renderedMode)
  }

  apply(skin, theme) {
    const previousTheme = this.findSkin(theme?.themeName)
      ? this.store.$config.get().previousTheme
      : theme?.themeName
    this.store.saveConfig(prev => ({
      ...prev,
      previousTheme: previousTheme || 'default',
      activeSkinId: skin.id,
      wallpaperEnabled: Boolean(prev.wallpaperSource || skin.wallpaper),
      wallpaperType: prev.wallpaperSource ? prev.wallpaperType : (skin.wallpaperType || 'image'),
      wallpaperSource: prev.wallpaperSource,
      wallpaperBlur: skin.defaultBlur ?? prev.wallpaperBlur,
      maskOcclusion: skin.defaultOcclusion ?? prev.maskOcclusion
    }))
    if (typeof theme?.clearThemePreview === 'function') {
      theme.clearThemePreview()
    }
    this.previewCleanup = null
    this.store.exitTryOn()
    if (typeof theme?.setTheme === 'function') {
      theme.setTheme(skin.id)
    }
    this.sync(skin.id, theme?.renderedMode)
  }

  restore(theme) {
    const previous = this.store.$config.get().previousTheme
    const target = previous && !this.findSkin(previous) ? previous : 'default'
    this.store.saveConfig(prev => ({ ...prev, activeSkinId: 'default', wallpaperEnabled: Boolean(prev.wallpaperSource) }))
    if (typeof theme?.clearThemePreview === 'function') {
      theme.clearThemePreview()
    }
    this.previewCleanup = null
    this.store.exitTryOn()
    if (typeof theme?.setTheme === 'function') {
      theme.setTheme(target)
    }
    this.sync(target, theme?.renderedMode)
  }

  changeConfig(change) {
    this.store.saveConfig(change)
    this.sync()
  }

  destroy() {
    this.destroyed = true
    this.previewCleanup?.()
    this.previewCleanup = null
    this.backdrop.destroy()
    this.glass.destroy()
    if (typeof document !== 'undefined') document.getElementById('zcode-skin-colors')?.remove()
  }
}
