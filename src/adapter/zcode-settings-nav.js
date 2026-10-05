import { renderedThemeMode } from '../engine/theme-watcher.js'
/**
 * ZCode Settings Entry — sidebar item + inline panel
 * Installs a "皮肤中心 / Skin Center" item into ZCode Desktop's settings
 * sidebar, directly below the built-in 外观 (Appearance) item. Clicking it
 * swaps the settings content pane (the same right-hand surface every native
 * section uses) for the Skin Center page, exactly like a native section —
 * no modal is involved. The Ctrl+Shift+S modal remains as a global shortcut.
 *
 * ZCode builds that sidebar with React from a hard-coded config array and
 * exposes no extension point, so we wait for the sidebar to mount and insert
 * a plain button mirroring the native items' markup — their Tailwind classes
 * are guaranteed to exist in the app stylesheet because real items emit them.
 * React re-renders may drop the node at any time, so the observer re-inserts
 * it and re-attaches the panel while the settings page is open.
 */

const NAV_BUTTON_FLAG = 'data-zcode-skins-nav'
const PANEL_FLAG = 'data-zcode-skins-panel'
const HIDDEN_FLAG = 'data-zcode-skins-hidden'
// aria-labels ZCode puts on its built-in Appearance nav item (zh + en).
const APPEARANCE_SELECTOR = 'nav button[aria-label="外观"], nav button[aria-label="Appearance"]'

const NAV_ACTIVE_CLASSES = 'bg-surface-hover text-foreground'
const NAV_IDLE_CLASSES = 'text-foreground-subtle hover:bg-surface-hover hover:text-foreground'

function navLabel() {
  return typeof navigator !== 'undefined' && navigator.language?.startsWith('zh') ? '皮肤中心' : 'Skin Center'
}

function createNavButton(onClick) {
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute('aria-label', navLabel())
  button.setAttribute(NAV_BUTTON_FLAG, '1')
  // Same class strings as ZCode's own sidebar items (ekn component), so the
  // entry is visually indistinguishable from native navigation items.
  button.className = `flex h-8 w-full items-center gap-2 rounded-xl px-2.5 text-left transition-colors max-lg:mx-auto max-lg:size-10 max-lg:justify-center max-lg:px-0 ${NAV_IDLE_CLASSES}`
  button.innerHTML = `
    <span class="flex size-4 shrink-0 items-center justify-center text-current">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="size-4 text-foreground" aria-hidden="true">
        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle>
        <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle>
        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle>
        <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle>
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path>
      </svg>
    </span>
    <span class="min-w-0 flex-1 max-lg:sr-only">
      <span class="truncate text-ui-base text-foreground">${navLabel()}</span>
    </span>`
  button.addEventListener('click', onClick)
  return button
}

export function installSettingsEntry({ renderPanelInto, panelStyleText = '' }) {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  // panelStyleText is intentionally NOT injected: the fallback sheet declares
  // a cascade layer that sorts AFTER ZCode's own utilities layer, so its
  // fixed .text-ui-sm/.rounded-lg/.shadow-* rules would override the app's
  // fluid 界面字号 scale and corner radii app-wide the moment the panel
  // opens (reported as "字号自动变小 / 边框变方"). The light-DOM panel
  // resolves its classes from ZCode's own stylesheet instead.

  let navButton = null
  let panel = null
  let panelDispose = null
  let panelThemeObserver = null
  let hiddenNative = []
  let savedActiveButton = null
  let frame = 0
  let sectionObserver = null

  const setNavActive = active => {
    if (!navButton) return
    navButton.classList.remove(...[...(active ? NAV_IDLE_CLASSES : NAV_ACTIVE_CLASSES).split(' ')])
    navButton.classList.add(...[...(active ? NAV_ACTIVE_CLASSES : NAV_IDLE_CLASSES).split(' ')])
    if (active) navButton.setAttribute('aria-current', 'page')
    else navButton.removeAttribute('aria-current')
  }

  const hideNativeActiveHighlight = () => {
    const nav = navButton?.closest('nav')
    const active = nav?.querySelector('button[aria-current="page"]')
    if (!active || active === navButton) return
    savedActiveButton = { button: active, className: active.className, ariaCurrent: active.getAttribute('aria-current') }
    active.classList.remove(...NAV_ACTIVE_CLASSES.split(' '))
    active.classList.add(...NAV_IDLE_CLASSES.split(' '))
    active.removeAttribute('aria-current')
  }

  const restoreNativeActiveHighlight = () => {
    const saved = savedActiveButton
    savedActiveButton = null
    if (!saved || !saved.button.isConnected) return
    saved.button.className = saved.className
    if (saved.ariaCurrent) saved.button.setAttribute('aria-current', saved.ariaCurrent)
  }

  const closePanel = () => {
    if (!panel) return
    sectionObserver?.disconnect()
    sectionObserver = null
    panelThemeObserver?.disconnect()
    panelThemeObserver = null
    panelDispose?.()
    panelDispose = null
    panel.remove()
    panel = null
    for (const el of hiddenNative) {
      el.style.removeProperty('display')
      el.removeAttribute(HIDDEN_FLAG)
    }
    hiddenNative = []
    restoreNativeActiveHighlight()
    setNavActive(false)
  }

  const openPanel = () => {
    if (panel) return
    // Settings content pane: the grid root carries data-active-section and the
    // scrollable section surface is its <main>.
    const root = document.querySelector('[data-active-section]')
    const main = root?.querySelector?.('main')
    if (!root || !main) {
      // Settings page not mounted (or markup changed) — fall back to the modal.
      window.dispatchEvent(new CustomEvent('zcode-skins:open'))
      return
    }
    // Light DOM on purpose: the panel inherits ZCode's own font, tokens, and
    // Tailwind utilities so it reads as a native settings section. No extra
    // stylesheet is injected — a later cascade layer would override the
    // app's own utilities app-wide (see the note above installSettingsEntry).
    panel = document.createElement('div')
    panel.setAttribute(PANEL_FLAG, '1')
    panel.style.cssText = 'display:block;width:100%;'
    const mount = document.createElement('div')
    mount.style.cssText = 'width:100%;'
    panel.appendChild(mount)
    try {
      panelDispose = renderPanelInto?.(mount) || null
    } catch {
      panel.remove()
      panel = null
      window.dispatchEvent(new CustomEvent('zcode-skins:open'))
      return
    }
    const syncTheme = () => {
      const isDark = renderedThemeMode() === 'dark'
      panel.setAttribute('data-zc-theme', isDark ? 'dark' : 'light')
    }
    syncTheme()
    panelThemeObserver = new MutationObserver(syncTheme)
    panelThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    panelThemeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    for (const child of [...main.children]) {
      if (child === panel) continue
      child.setAttribute(HIDDEN_FLAG, '1')
      child.style.display = 'none'
      hiddenNative.push(child)
    }
    main.appendChild(panel)
    hideNativeActiveHighlight()
    setNavActive(true)
    // Any navigation away from our pseudo-section closes the panel.
    sectionObserver = new MutationObserver(() => {
      if (root.getAttribute('data-active-section') !== undefined) closePanel()
    })
    sectionObserver.observe(root, { attributes: true, attributeFilter: ['data-active-section'] })
  }

  const onNavClickCapture = event => {
    if (!panel) return
    const button = event.target?.closest?.('button')
    if (!button) return
    if (button === navButton) return
    if (button.closest('nav') || button.getAttribute('aria-label')?.includes('返回') ||
        button.getAttribute('aria-label')?.toLowerCase().includes('back')) {
      closePanel()
    }
  }

  const ensurePlaced = () => {
    if (panel && !panel.isConnected) {
      // The settings page unmounted (返回工作区) while the panel was open.
      sectionObserver?.disconnect()
      sectionObserver = null
      panelThemeObserver?.disconnect()
      panelThemeObserver = null
      panelDispose?.()
      panelDispose = null
      panel = null
      hiddenNative = []
      savedActiveButton = null
      setNavActive(false)
    }
    if (navButton && document.contains(navButton)) return
    const appearanceButton = document.querySelector(APPEARANCE_SELECTOR)
    if (!appearanceButton || !appearanceButton.parentNode) return
    if (!navButton) navButton = createNavButton(openPanel)
    appearanceButton.after(navButton)
    document.addEventListener('click', onNavClickCapture, true)
  }

  // Coalesce mutation bursts into one check per animation frame.
  const schedule = () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      try {
        ensurePlaced()
      } catch {
        // Sidebar not ready yet; the next mutation batch retries.
      }
    })
  }

  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true })
  schedule()

  return () => {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    observer.disconnect()
    sectionObserver?.disconnect()
    sectionObserver = null
    panelThemeObserver?.disconnect()
    panelThemeObserver = null
    document.removeEventListener('click', onNavClickCapture, true)
    closePanel()
    if (navButton) {
      navButton.remove()
      navButton = null
    }
  }
}
