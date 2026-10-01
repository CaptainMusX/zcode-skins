/**
 * ZCode Modal & Trigger Host
 * Mounts the Skin Center modal and floating trigger button into ZCode Desktop DOM.
 */

import { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useValue, useTheme, Button } from './zcode-sdk-shim.js'
import { SkinCenterPage } from '../ui/SkinCenterPage.js'
import { TryOnBanner } from '../ui/TryOnBanner.js'

export function ZCodeSkinCenterModal({ isOpen, onClose, store, controller, prepareScene }) {
  const [activeTab, setActiveTab] = useState('gallery')
  const preview = useValue(store.$tryOnSkin)
  const theme = useTheme()

  if (!isOpen) {
    if (preview) {
      return jsx('div', {
        className: 'zcode-skin-tryon-fixed-container fixed top-0 left-0 right-0 z-[99999]',
        children: jsx(TryOnBanner, {
          skin: preview,
          onApply: () => controller.apply(preview, theme),
          onExit: () => controller.exitTryOn(theme)
        })
      })
    }
    return null
  }

  return jsxs('div', {
    className: 'zcode-skin-center-backdrop fixed inset-0 z-[99990] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md transition-opacity duration-200',
    onClick: e => {
      if (e.target === e.currentTarget) onClose()
    },
    children: [
      preview && jsx('div', {
        className: 'fixed top-0 left-0 right-0 z-[99999]',
        children: jsx(TryOnBanner, {
          skin: preview,
          onApply: () => controller.apply(preview, theme),
          onExit: () => controller.exitTryOn(theme)
        })
      }),
      jsxs('div', {
        className: 'zcode-skin-center-dialog relative flex flex-col w-full max-w-5xl h-[85vh] rounded-2xl border border-white/10 bg-neutral-900/90 shadow-2xl text-neutral-100 overflow-hidden backdrop-blur-xl',
        children: [
          // Header Bar
          jsxs('div', {
            className: 'flex items-center justify-between px-6 py-4 border-b border-white/10 bg-neutral-950/40 select-none',
            children: [
              jsxs('div', {
                className: 'flex items-center gap-3',
                children: [
                  jsx('div', {
                    className: 'flex items-center justify-center w-8 h-8 rounded-lg bg-primary/20 text-primary border border-primary/30',
                    children: '🎨'
                  }),
                  jsxs('div', {
                    children: [
                      jsx('h1', { className: 'text-base font-semibold leading-tight', children: 'ZCode 皮肤中心' }),
                      jsx('p', { className: 'text-xs text-neutral-400', children: '自定义壁纸、Wallpaper Engine 动态背景与玻璃拟态' })
                    ]
                  })
                ]
              }),
              jsxs('div', {
                className: 'flex items-center gap-3',
                children: [
                  jsx('span', { className: 'text-xs text-neutral-500 font-mono hidden sm:inline-block', children: '快捷键: Ctrl+Shift+S' }),
                  jsx('button', {
                    type: 'button',
                    onClick: onClose,
                    className: 'p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors',
                    title: '关闭 (Esc)',
                    children: jsx('svg', {
                      className: 'w-5 h-5',
                      fill: 'none',
                      viewBox: '0 0 24 24',
                      stroke: 'currentColor',
                      children: jsx('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M6 18L18 6M6 6l12 12' })
                    })
                  })
                ]
              })
            ]
          }),
          // Page Content
          jsx('div', {
            className: 'flex-1 overflow-y-auto p-6',
            children: jsx(SkinCenterPage, { store, controller, prepareScene })
          })
        ]
      })
    ]
  })
}

export function setupZCodeFloatingHost({ store, controller, prepareScene }) {
  if (typeof document === 'undefined') return

  let hostContainer = document.getElementById('zcode-skins-host')
  if (!hostContainer) {
    hostContainer = document.createElement('div')
    hostContainer.id = 'zcode-skins-host'
    document.body.appendChild(hostContainer)
  }

  function RootWrapper() {
    const [open, setOpen] = useState(false)

    useEffect(() => {
      const handleKeyDown = e => {
        // Toggle on Ctrl+Shift+S or Alt+S
        if ((e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) ||
            (e.altKey && (e.key === 'S' || e.key === 's'))) {
          e.preventDefault()
          setOpen(prev => !prev)
        } else if (e.key === 'Escape' && open) {
          setOpen(false)
        }
      }
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [open])

    return jsxs('div', {
      children: [
        // Floating pill trigger
        !open && jsx('button', {
          type: 'button',
          onClick: () => setOpen(true),
          title: 'ZCode 皮肤中心 (Ctrl+Shift+S)',
          className: 'zcode-skin-floating-trigger fixed bottom-6 right-6 z-[99980] flex items-center gap-2 px-3 py-2 rounded-full bg-neutral-900/80 hover:bg-neutral-800 text-white text-xs font-medium border border-white/15 shadow-xl backdrop-blur-lg hover:scale-105 active:scale-95 transition-all duration-150 cursor-pointer',
          children: [
            jsx('span', { className: 'text-sm', children: '🎨' }),
            jsx('span', { className: 'hidden sm:inline-block', children: '换肤' })
          ]
        }),
        // Modal
        jsx(ZCodeSkinCenterModal, {
          isOpen: open,
          onClose: () => setOpen(false),
          store,
          controller,
          prepareScene
        })
      ]
    })
  }

  const root = createRoot(hostContainer)
  root.render(jsx(RootWrapper, {}))
}
