/** Paint each ZCode material once, on its native surface rather than its portal. */
const STYLE_ID = 'zcode-skins-runtime-css'
const SCOPE = ':root[data-zcode-skins-active="true"]'
const MENUS = ':is([data-slot="dropdown-menu-content"], [data-slot="dropdown-menu-sub-content"], [data-slot="context-menu-content"], [data-slot="context-menu-sub-content"], [data-slot="select-content"], [data-slot="popover-content"], [data-slot="tooltip-content"], [role="menu"], [role="listbox"])'
const DIALOGS = ':is([data-slot="dialog-content"], [data-slot="alert-dialog-content"], [data-slot="sheet-content"], [role="dialog"])'
const COMPOSER = '.chat-composer-input-surface form > .bg-input'
const CAPSULES = ':is(aside[data-display-mode], header .bg-input, header div[class*="rounded-"][class*="border"])'
const PROTECTED = `:where(${MENUS}, ${MENUS} *, ${DIALOGS}, ${DIALOGS} *, [data-radix-popper-content-wrapper], [data-radix-popper-content-wrapper] *, .chat-composer-input-surface, .chat-composer-input-surface *, aside[data-display-mode], aside[data-display-mode] *, [data-remote-screen], [data-remote-screen] *)`
const STRUCTURAL = `:is(aside, nav, .bg-background, .bg-sidebar):not(${PROTECTED})`
const CARDS = `:is(section.bg-card, div.bg-card, pre.bg-card, [data-slot="card"]):not(${PROTECTED})`

export function parseSerializedColor(text) {
  if (typeof text !== 'string') return null
  let match = text.match(/^color\((?:srgb|srgb-linear) ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/)
  if (match) return { r: Math.round(Number(match[1]) * 255), g: Math.round(Number(match[2]) * 255), b: Math.round(Number(match[3]) * 255), a: match[4] === undefined ? 1 : Number(match[4]) }
  match = text.match(/^rgba?\(([\d.]+),?\s*([\d.]+),?\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\)$/)
  if (match) return { r: Math.round(Number(match[1])), g: Math.round(Number(match[2])), b: Math.round(Number(match[3])), a: match[4] === undefined ? 1 : Number(match[4]) }
  match = text.match(/^#([0-9a-f]{6})$/i)
  if (!match) return null
  const value = parseInt(match[1], 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255, a: 1 }
}

export class GlassController {
  constructor() { this.styleEl = null }

  update({ enabled, glassTransparency = 10, composerTransparency = 65, capsuleTransparency = 65,
    cardTransparency = 65, bubbleOpacity = 100, composerFrost = 10, surfaceFrost = 8 }) {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (!enabled) { this.destroy(); return }
    const pct = (value, fallback) => Number.isFinite(Number(value)) ? Math.min(100, Math.max(0, Number(value))) : fallback
    const keep = 100 - pct(glassTransparency, 10)
    const blur = value => value > 0 ? `blur(${Math.min(20, value)}px)` : 'none'
    const frost = blur(pct(surfaceFrost, 8))
    const composer = blur(pct(composerFrost, 10))
    if (!this.styleEl || !document.head.contains(this.styleEl)) {
      this.styleEl = document.getElementById(STYLE_ID) || document.createElement('style')
      this.styleEl.id = STYLE_ID
      this.styleEl.dataset.plugin = 'zcode-skins'
      if (!this.styleEl.isConnected) document.head.appendChild(this.styleEl)
    }
    root.setAttribute('data-zcode-skins-active', 'true')
    root.removeAttribute('data-hermes-skins-active')
    const css = `
      ${SCOPE} {
        --zcode-skins-keep: ${keep}%;
        --zcode-skins-chrome-tint: color-mix(in srgb, var(--color-background, #18181b) ${keep}%, transparent);
        --zcode-skins-composer-tint: color-mix(in srgb, var(--color-card, var(--color-background, #18181b)) ${100 - pct(composerTransparency, 65)}%, transparent);
        --zcode-skins-capsule-tint: color-mix(in srgb, var(--color-card, var(--color-background, #18181b)) ${100 - pct(capsuleTransparency, 65)}%, transparent);
        --zcode-skins-card-tint: color-mix(in srgb, var(--color-card, var(--color-background, #18181b)) ${100 - pct(cardTransparency, 65)}%, transparent);
        --zcode-skins-floating-tint: color-mix(in srgb, var(--color-menu, var(--color-popover, var(--color-background, #18181b))) ${Math.max(keep, 70)}%, transparent);
        --zcode-skins-overlay-tint: color-mix(in srgb, var(--color-card, var(--color-background, #18181b)) ${Math.max(keep, 74)}%, transparent);
        --zcode-skins-frost: ${frost};
        --zcode-skins-composer-frost: ${composer};
        --user-bubble-keep: ${pct(bubbleOpacity, 100)}%;
        --color-background-alt: var(--zcode-skins-chrome-tint);
      }
      ${SCOPE} body, ${SCOPE} #root, ${SCOPE} #root > div, ${SCOPE} .bg-background-win-alt {
        background-color: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      ${SCOPE} #root { position: relative; z-index: 1; }
      ${SCOPE} [data-v4-user-input-bubble] {
        background-color: color-mix(in srgb, var(--color-surface, rgba(13, 13, 13, 0.03)) ${pct(bubbleOpacity, 100)}%, transparent) !important;
      }
      ${SCOPE} ${STRUCTURAL} {
        background-color: var(--zcode-skins-chrome-tint) !important;
        backdrop-filter: var(--zcode-skins-frost);
        -webkit-backdrop-filter: var(--zcode-skins-frost);
      }
      ${SCOPE} ${STRUCTURAL} ${STRUCTURAL} {
        background-color: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      ${SCOPE} ${CARDS} {
        background-color: var(--zcode-skins-card-tint) !important;
        backdrop-filter: var(--zcode-skins-frost);
        -webkit-backdrop-filter: var(--zcode-skins-frost);
      }
      ${SCOPE} ${CARDS} ${CARDS} {
        background-color: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      ${SCOPE} code[class*="bg-markdown-inline-code"]:not(pre code) {
        background-color: var(--zcode-skins-card-tint) !important;
      }
      ${SCOPE} ${CAPSULES} {
        background-color: var(--zcode-skins-capsule-tint) !important;
        backdrop-filter: var(--zcode-skins-frost) !important;
        -webkit-backdrop-filter: var(--zcode-skins-frost) !important;
      }
      ${SCOPE} ${COMPOSER} {
        background-color: var(--zcode-skins-composer-tint) !important;
        backdrop-filter: var(--zcode-skins-composer-frost) !important;
        -webkit-backdrop-filter: var(--zcode-skins-composer-frost) !important;
      }
      ${SCOPE} .chat-composer-input-surface, ${SCOPE} .chat-composer-input-surface form,
      ${SCOPE} ${COMPOSER} :is([role="textbox"], textarea) {
        background-color: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      /* Portals only position their children; painting them creates square corners. */
      ${SCOPE} [data-radix-popper-content-wrapper] {
        background: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        box-shadow: none !important;
      }
      ${SCOPE} ${MENUS} {
        background-color: var(--zcode-skins-floating-tint) !important;
        backdrop-filter: var(--zcode-skins-frost) !important;
        -webkit-backdrop-filter: var(--zcode-skins-frost) !important;
      }
      /* Preserve native geometry, focus, hover and independent submenus. */
      ${SCOPE} ${MENUS} :is(.bg-background, .bg-card, .bg-menu, .bg-popover, .bg-surface, [data-slot="command"]):not(${MENUS}) {
        background-color: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      ${SCOPE} ${MENUS} .bg-menu:not(${MENUS})::after { background-color: transparent !important; }
      ${SCOPE} ${DIALOGS} {
        background-color: var(--zcode-skins-overlay-tint) !important;
        backdrop-filter: var(--zcode-skins-frost) !important;
        -webkit-backdrop-filter: var(--zcode-skins-frost) !important;
      }
      ${SCOPE} ${DIALOGS} :is(.bg-card, .bg-background):not(${DIALOGS}, ${MENUS}) {
        background-color: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
    `
    if (this.styleEl.textContent !== css) this.styleEl.textContent = css
  }

  destroy() {
    if (typeof document === 'undefined') return
    document.documentElement.removeAttribute('data-zcode-skins-active')
    document.documentElement.removeAttribute('data-hermes-skins-active')
    ;(this.styleEl || document.getElementById(STYLE_ID))?.remove()
    this.styleEl = null
  }
}
