import { Button, Input, usePluginI18n, useValue } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { normalizeMediaSource } from '../engine/backdrop-manager.js'
import { SCENE_PKG_UNAVAILABLE } from '../engine/scene-prepare.js'
import { scanWallpaperEngine, readWallpaperProject, saveCachedWallpapers, wallpaperMediaUrl } from '../engine/we-library.js'

const PAGE_SIZE = 12

export function WallpaperEnginePanel({ store, controller, preview, prepareScene }) {
  const t = usePluginI18n('hermes-skins')
  const config = useValue(store.$config)
  const [items, setItems] = useState([])
  const [libraries, setLibraries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [applied, setApplied] = useState('')
  const [appliedNote, setAppliedNote] = useState('')
  const [pkgPickItem, setPkgPickItem] = useState(null)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [previews, setPreviews] = useState({})
  const [importingId, setImportingId] = useState(null)
  const scanRevision = useRef(0)
  const repairedPreviews = useRef(new Set())
  const bridge = typeof window !== 'undefined' ? (window.zcodeDesktop || window.hermesDesktop) : null
  const rootsKey = config.weRoots.join('|')

  // A cached item's previewPath can outlive the file it pointed at (workshop
  // updates, moved folders): the scan only validated existence once, at
  // discovery time. Re-derive the preview from the persisted directory index
  // (readDir reads the localStorage/IDB cache — no File handles needed) and
  // persist the corrected item so the card shows the workshop's own preview
  // (preview.gif & friends) again.
  const repairPreview = async item => {
    const dir = item?.dir || (typeof item?.id === 'string' && /^[a-z]:[\\/]/i.test(item.id) ? item.id : null)
    if (!bridge?.readDir || !dir || repairedPreviews.current.has(item.id)) return
    repairedPreviews.current.add(item.id)
    try {
      const fresh = await readWallpaperProject(bridge, dir, item.source || 'workshop')
      if (!fresh?.previewPath || fresh.previewPath === item.previewPath) return
      setItems(current => {
        const next = current.map(existing => existing.id === fresh.id ? { ...existing, ...fresh } : existing)
        saveCachedWallpapers(next, [])
        return next
      })
    } catch { /* The card keeps its placeholder; refresh rescans from scratch. */ }
  }

  async function refresh() {
    const revision = ++scanRevision.current
    setLoading(true)
    setError('')
    try {
      const result = await scanWallpaperEngine(bridge, config.weRoots)
      if (revision !== scanRevision.current) return
      setItems(result.items)
      setLibraries(result.libraries)
      setPage(0)
      if (result.error) setError(result.error)
    } catch (cause) {
      if (revision === scanRevision.current) setError(String(cause?.message || cause))
    } finally {
      if (revision === scanRevision.current) setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    return () => { scanRevision.current += 1 }
  }, [rootsKey])

  // The backdrop reports media load failures (missing/corrupt file) so a
  // failed "set as wallpaper" is visible instead of a silent no-op.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleFailure = event => setError(event?.detail?.fallback
      ? (event.detail.code === 'SCENE_PKG_UNAVAILABLE' ? t('weReauthorize') : t('weSceneFallback')) : t('weLoadFailed'))
    if (controller.backdrop.lastMediaIssue) handleFailure({ detail: controller.backdrop.lastMediaIssue })
    window.addEventListener('zcode-skins:wallpaper-error', handleFailure)
    return () => window.removeEventListener('zcode-skins:wallpaper-error', handleFailure)
  }, [t])

  // The full directory index is restored from IndexedDB a moment after boot;
  // rescan then so the gallery reflects everything without a manual re-pick.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleHydrated = () => void refresh()
    window.addEventListener('zcode-skins:index-hydrated', handleHydrated)
    return () => window.removeEventListener('zcode-skins:index-hydrated', handleHydrated)
  }, [])

  const filtered = items.filter(item => (filter === 'all' || item.kind === filter) &&
    (!query || item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())))
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const visiblePaths = visible.map(item => item.previewPath).join('|')

  useEffect(() => {
    if (!bridge?.readFileDataUrl) return
    let cancelled = false
    const fetchPreviews = async () => {
      for (let start = 0; start < visible.length && !cancelled; start += 4) {
        await Promise.all(visible.slice(start, start + 4).map(async item => {
          if (!item.previewPath) { void repairPreview(item); return }
          if (previews[item.previewPath]) return
          try {
            const data = await bridge.readFileDataUrl(item.previewPath)
            if (!cancelled && typeof data === 'string' && data.startsWith('data:image/')) {
              setPreviews(current => ({ ...current, [item.previewPath]: data }))
            } else if (!cancelled) {
              void repairPreview(item)
            }
          } catch { void repairPreview(item) /* A missing thumbnail must not block the inventory. */ }
        }))
      }
    }
    void fetchPreviews()
    return () => { cancelled = true }
  }, [visiblePaths])

  async function chooseFolder() {
    if (!bridge?.selectPaths) {
      setError(t('weBridgeUnavailable'))
      return
    }
    const paths = await bridge.selectPaths({ directories: true, multiple: false,
      defaultPath: libraries[0] || config.weRoots[0], title: t('weChooseFolder') })
    const selected = paths?.[0]
    if (selected && !config.weRoots.includes(selected)) {
      controller.changeConfig({ weRoots: [...config.weRoots, selected] })
    }
  }

  async function useWallpaper(item) {
    setError('')
    setApplied('')
    setAppliedNote('')
    setPkgPickItem(null)
    setImportingId(item.id)
    try {
      let source = wallpaperMediaUrl(item.mediaPath, item.mediaType)
      let type = item.mediaType
      let framePath = null
      let staticFallback = item.staticFallback
      if (item.kind === 'scene') {
        // Re-selecting the already-prepared scene must not depend on the
        // gateway: its unpacked manifest and preview frame are already on
        // disk and referenced by the current config. The prepared store lives
        // in memory only, so right after a restart it may still be rehydrating
        // (or gone) — probe it first; if it cannot serve, fall through to a
        // full re-prepare instead of pretending success.
        if (config.wallpaperType === 'scene' &&
            config.weSelection?.id === item.id && config.wallpaperSource &&
            !config.wallpaperSource.startsWith('data:')) {
          const probe = await (bridge?.readFileText?.(config.wallpaperSource)?.catch(() => null)) ?? null
          if (probe?.text) {
            controller.changeConfig({ wallpaperEnabled: true })
            setApplied(item.title)
            return
          }
        }
        if (!prepareScene) {
          // ZCode has no unpack backend: apply the project's static preview
          // frame instead of failing outright.
          if (!item.previewPath) throw new Error(t('weSceneUnsupported'))
          controller.changeConfig({
            wallpaperEnabled: true,
            wallpaperType: 'image',
            wallpaperSource: item.previewPath,
            weSelection: { id: item.id, title: item.title, kind: item.kind,
              staticFallback: true, framePath: null, previewPath: item.previewPath }
          })
          setApplied(item.title)
          setAppliedNote(t('weSceneFallbackNote'))
          return
        }
        const result = await prepareScene(item.dir)
        if (!result?.ok) {
          const error = new Error(result?.error || t('weSceneBackendUnavailable'))
          if (result?.code) error.code = result.code
          throw error
        }
        framePath = result.framePath || null
        if (result.manifest && result.manifestPath) {
          source = result.manifestPath
          type = 'scene'
          staticFallback = false
        } else if (result.videoPath) {
          source = wallpaperMediaUrl(result.videoPath, 'video')
          type = 'video'
          staticFallback = false
        } else if (framePath) {
          source = framePath
          type = 'image'
          staticFallback = true
        } else {
          throw new Error(t('weSceneUnsupported'))
        }
      }
      controller.changeConfig({
        wallpaperEnabled: true,
        wallpaperType: type,
        wallpaperSource: source,
        weSelection: { id: item.id, title: item.title, kind: item.kind, staticFallback,
          framePath, previewPath: item.previewPath, dir: item.dir }
      })
      setApplied(item.title)
    } catch (cause) {
      // A blocked backend surfaces as an ipc 404 "Plugin not found" — map it
      // to the recovery action instead of the raw electron error text.
      const message = String(cause?.message || cause)
      if (cause?.code === SCENE_PKG_UNAVAILABLE) {
        // The project folder was never enumerated into the index; let the user
        // pick that one (small) folder, then retry automatically.
        setError('')
        setPkgPickItem(item)
      } else {
        setError(/Plugin not found|\b404\b/.test(message) ? t('weSceneBackendMissing') : message)
      }
    } finally {
      setImportingId(null)
    }
  }

  async function pickSceneFolder(item) {
    setError('')
    setPkgPickItem(null)
    setImportingId(item.id)
    try {
      const paths = bridge?.selectPaths ? await bridge.selectPaths({ directories: true }) : null
      const picked = paths?.[0]
      if (!picked) return
      await useWallpaper(item)
    } finally {
      setImportingId(null)
    }
  }

  const kindLabel = kind => t({ video: 'weTypeVideo', scene: 'weTypeScene', image: 'weTypeImage', web: 'weTypeWeb' }[kind] || 'weTypeOther')
  return jsxs('section', { 'data-hermes-skins-surface': '', className: 'rounded-xl border border-border bg-card p-5', children: [
    jsxs('div', { className: 'flex flex-wrap items-start justify-between gap-3', children: [
      jsxs('div', { className: 'space-y-1', children: [
        jsx('h2', { className: 'text-xl font-semibold tracking-tight text-foreground', children: t('weTitle') }),
        jsx('p', { className: 'text-ui-sm text-muted-foreground', children: t('weDescription') })
      ] }),
      jsxs('div', { className: 'flex gap-2', children: [
        jsx(Button, { size: 'sm', variant: 'outline', onClick: chooseFolder, children: t('weChooseFolder') }),
        jsx(Button, { size: 'sm', variant: 'outline', onClick: refresh, disabled: loading,
          children: loading ? t('weScanning') : t('weRefresh') })
      ] })
    ] }),
    jsx('p', { className: 'mt-3 text-ui-sm text-muted-foreground', children: loading ? t('weScanning') : t('weFound', items.length) }),
    jsx('p', { className: 'mt-1 text-ui-sm text-muted-foreground', children: t('wePickHint') }),
    error && jsx('p', { className: 'mt-2 text-ui-sm text-destructive', children: error }),
    applied && !error && jsx('p', { className: 'mt-2 text-ui-sm font-medium text-primary', children:
      appliedNote ? `${t('weAppliedHint', applied)} ${appliedNote}` : t('weAppliedHint', applied) }),
    pkgPickItem && jsxs('div', { className: 'mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-2.5', children: [
      jsx('span', { className: 'text-ui-sm text-foreground', children: t('weScenePickHint', pkgPickItem.title) }),
      jsx(Button, { size: 'sm', variant: 'outline', disabled: Boolean(importingId),
        onClick: () => void pickSceneFolder(pkgPickItem), children: t('weScenePickButton') })
    ] }),
    !loading && config.weSelection && items.length > 0 && !items.some(item => item.id === config.weSelection.id) &&
      jsx('p', { className: 'mt-2 text-ui-sm text-amber-600', children: t('weMissing') }),
    jsxs('div', { className: 'mt-4 flex flex-wrap items-center gap-2', children: [
      jsx(Input, { value: query, onChange: event => { setQuery(event.target.value); setPage(0) },
        placeholder: t('weSearch'), className: 'max-w-64', 'aria-label': t('weSearch') }),
      ['all', 'video', 'scene', 'image', 'web'].map(value => jsx('button', {
        key: value, type: 'button', 'aria-pressed': filter === value,
        onClick: () => { setFilter(value); setPage(0) },
        className: `rounded-full px-2.5 py-1 text-ui-sm ${filter === value ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground'}`,
        children: value === 'all' ? t('tagsAll') : kindLabel(value)
      }))
    ] }),
    !loading && items.length === 0 && jsx('p', { className: 'mt-4 text-ui-base text-muted-foreground', children: t('weEmpty') }),
    jsxs('div', { className: 'mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3', children: visible.map(item => {
      const selected = config.weSelection?.id === item.id
      // ZCode's bridge exposes absolute paths: previews load straight from
      // disk (works from the persisted index, no File handles needed).
      const directSrc = bridge?.isZcodeBridge ? normalizeMediaSource(item.previewPath, 'image') : null
      const previewSrc = previews[item.previewPath] || directSrc
      return jsxs('article', { key: item.id, 'data-hermes-skins-surface': '', className: `overflow-hidden rounded-lg border bg-background ${selected ? 'border-primary' : 'border-border'}`, children: [
        previewSrc
          ? jsx('img', { src: previewSrc, alt: '', loading: 'lazy', className: 'h-36 w-full object-cover',
              onError: event => {
                if (directSrc) event.currentTarget.style.visibility = 'hidden'
                void repairPreview(item)
              } })
          : jsx('div', { className: 'h-36 bg-muted/40' }),
        jsxs('div', { className: 'space-y-2 p-3', children: [
          jsx('h3', { className: 'line-clamp-2 min-h-8 text-ui-base font-medium text-foreground', title: item.title, children: item.title }),
          jsx('p', { className: 'text-ui-sm text-muted-foreground', children: item.kind === 'scene'
            ? `${kindLabel(item.kind)} · ${t('weSceneLive')}`
            : item.staticFallback ? `${kindLabel(item.kind)} · ${t('weStaticFallback')}` : kindLabel(item.kind) }),
          jsx(Button, { size: 'sm', className: 'w-full', disabled: Boolean(preview) || Boolean(importingId),
            variant: selected ? 'secondary' : 'default', onClick: () => void useWallpaper(item),
            children: importingId === item.id ? t('wePreparing') : selected ? t('weSelected') : t('weUse') })
        ] })
      ] })
    }) }),
    pages > 1 && jsxs('div', { className: 'mt-4 flex items-center justify-end gap-2 text-ui-sm text-muted-foreground', children: [
      jsx(Button, { size: 'sm', variant: 'outline', disabled: page === 0,
        onClick: () => setPage(page - 1), children: '←' }),
      jsx('span', { children: `${page + 1} / ${pages}` }),
      jsx(Button, { size: 'sm', variant: 'outline', disabled: page + 1 >= pages,
        onClick: () => setPage(page + 1), children: '→' })
    ] })
  ] })
}
