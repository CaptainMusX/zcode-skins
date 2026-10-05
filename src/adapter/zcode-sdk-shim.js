import { renderedThemeMode } from '../engine/theme-watcher.js'
/**
 * ZCode Desktop Plugin SDK Shim
 * Lightweight standalone compatibility layer for UI components and reactive state.
 *
 * All React primitives are imported explicitly so the bundle works in a plain
 * renderer (ZCode Desktop) that exposes no host-injected globals.
 */

import { useState, useEffect } from 'react'
import { jsx } from 'react/jsx-runtime'
import { I18N_DICTIONARY } from '../i18n.js'

// ─── Reactive Nanostores-compatible atom ────────────────────────
export var atom = function atom(initial) {
  let val = initial
  const listeners = new Set()
  return {
    get() {
      return val
    },
    set(next) {
      if (val !== next) {
        val = next
        listeners.forEach(fn => fn(val))
      }
    },
    subscribe(fn) {
      listeners.add(fn)
      fn(val)
      return () => listeners.delete(fn)
    }
  }
}

// ─── React Hook: useValue ───────────────────────────────────────
export function useValue(store) {
  const [val, setVal] = useState(() => (store && typeof store.get === 'function' ? store.get() : store))
  useEffect(() => {
    if (!store || typeof store.subscribe !== 'function') return
    return store.subscribe(v => setVal(v))
  }, [store])
  return val
}

// ─── React Hook: useTheme ───────────────────────────────────────
export function useTheme() {
  const [mode, setMode] = useState(() => {
    if (typeof document === 'undefined') return 'dark'
    const isDark = renderedThemeMode() === 'dark'
    return isDark ? 'dark' : 'light'
  })

  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return
    const updateMode = () => {
      const isDark = renderedThemeMode() === 'dark'
      setMode(isDark ? 'dark' : 'light')
    }
    const obs = new MutationObserver(updateMode)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => obs.disconnect()
  }, [])

  return {
    themeName: 'zcode-default',
    renderedMode: mode,
    previewTheme: () => {},
    clearThemePreview: () => {},
    setTheme: () => {}
  }
}

// ─── React Hook: usePluginI18n ──────────────────────────────────
export function usePluginI18n(dictOrNamespace = 'zcode-skins') {
  const lang = typeof navigator !== 'undefined' && navigator.language?.startsWith('zh') ? 'zh' : 'en'
  return key => {
    const dict = I18N_DICTIONARY[lang] || I18N_DICTIONARY.en || {}
    return dict[key] || key
  }
}

// ─── Constants ──────────────────────────────────────────────────
export var ROUTES_AREA = 'routes'
export var SIDEBAR_NAV_AREA = 'sidebar-nav'
export var PALETTE_AREA = 'palette'
export var THEMES_AREA = 'themes'

export var host = { isAvailable: false }

// ─── UI Atomic Components (Tailwind-compatible) ─────────────────
export function Badge({ children, className = '' }) {
  return jsx('span', {
    className: `inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-ui-sm font-medium text-primary border border-primary/20 ${className}`,
    children
  })
}

export function Button({ children, variant = 'primary', size = 'default', disabled = false, onClick, className = '', ...props }) {
  let baseStyle = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed '
  if (size === 'sm') baseStyle += 'px-2.5 py-1 text-ui-sm '
  else if (size === 'icon') baseStyle += 'p-1.5 '
  else baseStyle += 'px-3.5 py-1.5 text-ui-base '

  if (variant === 'primary') {
    baseStyle += 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm '
  } else if (variant === 'outline') {
    baseStyle += 'border border-border bg-card/60 hover:bg-accent/40 text-foreground '
  } else if (variant === 'secondary') {
    baseStyle += 'bg-secondary text-secondary-foreground hover:bg-secondary/80 '
  } else if (variant === 'ghost') {
    baseStyle += 'hover:bg-accent/30 text-foreground '
  }

  return jsx('button', {
    type: 'button',
    disabled,
    onClick,
    className: `${baseStyle} ${className}`,
    ...props,
    children
  })
}

export function Input({ value = '', onChange, placeholder = '', className = '', ...props }) {
  return jsx('input', {
    type: 'text',
    value,
    placeholder,
    onChange,
    className: `flex h-9 w-full rounded-lg border border-border bg-background/80 px-3 py-1 text-ui-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-ui-base file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ${className}`,
    ...props
  })
}

export function Switch({ checked = false, onCheckedChange, disabled = false, className = '' }) {
  return jsx('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': checked,
    disabled,
    onClick: () => !disabled && onCheckedChange?.(!checked),
    className: `relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ${
      checked ? 'bg-primary' : 'bg-muted-foreground/30'
    } ${className}`,
    children: jsx('span', {
      className: `pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
        checked ? 'translate-x-4' : 'translate-x-0'
      }`
    })
  })
}

export function SegmentedControl({ value, options = [], onChange, disabled = false, className = '' }) {
  return jsx('div', {
    className: `inline-flex h-9 items-center justify-center rounded-lg bg-muted/50 p-1 text-muted-foreground border border-border/40 ${className}`,
    children: options.map(opt => {
      // Callers pass options as { id, label }; accept { value, label } too.
      const optionValue = opt.value ?? opt.id
      const isSelected = optionValue === value
      return jsx('button', {
        key: optionValue,
        type: 'button',
        disabled,
        onClick: () => !disabled && onChange?.(optionValue),
        className: `inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-ui-sm font-medium ring-offset-background transition-all focus-visible:outline-none ${
          isSelected ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`,
        children: opt.label
      })
    })
  })
}
