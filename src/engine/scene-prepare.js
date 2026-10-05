/**
 * Renderer-side Wallpaper Engine scene preparation for ZCode Desktop.
 *
 * The vendored dsh-skins extractor (pkg-extract.ts) runs fully in memory:
 * the packed scene .pkg is read through the local file bridge, derived
 * resources land in a per-scene session store served back through the bridge,
 * and the returned manifestPath keys into that store — so loadSceneManifest()
 * and the sandboxed player keep working unchanged. Tokens derive from the
 * project directory, which makes them stable across restarts so a persisted
 * scene wallpaper can be silently re-prepared at boot.
 */

import { buildSceneManifest, extractSceneMainImage, extractSceneResource, extractSceneVideo } from '../../third_party/dsh-skins/pkg-extract.ts'
import { joinLocalPath, safeProjectPath } from './we-library.js'

const RESOURCE_PREFIX = '/api/skin-center/we/scene-resource/local/'
const MAX_PKG_BYTES = 512 * 1024 * 1024
export const SCENE_SCHEME = 'zcode-scene://'
export const SCENE_PARSER_VERSION = 6
/** Error.code thrown when the scene .pkg can be located on disk but its bytes
 * are not reachable through the index — the panel offers a folder pick. */
export const SCENE_PKG_UNAVAILABLE = 'SCENE_PKG_UNAVAILABLE'

async function artifactManifest(files) {
  const value = files.get('manifest.json')
  const text = typeof value?.text === 'function' ? await value.text()
    : typeof value === 'string' ? value : new TextDecoder().decode(value)
  return JSON.parse(text)
}

function extensionOf(bytes) {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return '.png'
  if (bytes.length > 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return '.mp4'
  return null
}

function fnvHex(text, length) {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  // 24 hex-ish chars from two rounds with distinct salts.
  let second = 0x811c9dc5
  for (let index = text.length - 1; index >= 0; index--) {
    second ^= text.charCodeAt(index) + index
    second = Math.imul(second, 0x01000193) >>> 0
  }
  return (hash.toString(16).padStart(8, '0') + second.toString(16).padStart(8, '0')).repeat(2).slice(0, length)
}

/** Stable per-project token: the same workshop dir always maps to the same
 * manifest path, before and after a restart. */
export function sceneTokenForDir(dir) {
  return `sc${fnvHex(String(dir).toLowerCase().replace(/[\\/]+$/, ''), 24)}`
}

function collectUrls(value, found = new Set()) {
  if (typeof value === 'string' && value.startsWith(RESOURCE_PREFIX)) found.add(value)
  else if (Array.isArray(value)) value.forEach(item => collectUrls(item, found))
  else if (value && typeof value === 'object') Object.values(value).forEach(item => collectUrls(item, found))
  return found
}

export async function prepareSceneInMemory(bridge, dir) {
  if (!bridge?.readFileText || !bridge?.readFileBytes) {
    throw new Error('Local file bridge unavailable / 本地文件桥不可用')
  }

  // Fast path first: a previously prepared store persisted in IndexedDB
  // restores with a plain IDB read — no project.json lookup (its cached text
  // may not have survived a restart), no 250 MB package unzipping, no texture
  // decode. The dirKey is stable across restarts.
  const dirKey = String(dir).toLowerCase().replace(/[\\/]+$/, '')
  const cachedArtifacts = await bridge.loadSceneArtifacts?.(dirKey)
  let cachedPrepared = null
  if (cachedArtifacts?.files) {
    const files = new Map(Object.entries(cachedArtifacts.files))
    const token = sceneTokenForDir(dir)
    if (!files.has('manifest.json')) {
      // A broken cache entry must not poison future loads.
      bridge.registerSceneSource?.(token, files)
    } else {
      bridge.registerSceneSource(token, files)
      let prepared = null
      try {
        prepared = await artifactManifest(files)
        cachedPrepared = prepared
      } catch { prepared = null }
      if (prepared && Number(prepared.parserVersion || 0) >= SCENE_PARSER_VERSION) {
        return {
          ok: true,
          manifestPath: `${SCENE_SCHEME}${token}/manifest.json`,
          framePath: prepared.framePath || null,
          videoPath: prepared.videoPath || null,
          manifest: Boolean(prepared.manifest),
          scripted: Boolean(prepared.scripted),
          resourceCount: prepared.resourceCount ?? Object.keys(prepared.resources || {}).length,
          missingCount: prepared.missingCount ?? (prepared.missing || []).length
        }
      }
    }
  }

  let projectText
  try { projectText = await bridge.readFileText(joinLocalPath(dir, 'project.json')) }
  catch { /* The persisted project metadata can restore an authorized package. */ }
  let project
  try {
    project = projectText?.text ? JSON.parse(String(projectText.text).replace(/^\uFEFF/, '')) : cachedPrepared?.project
    if (!project) throw new Error('missing project')
  } catch {
    throw Object.assign(new Error('scene project.json is missing or invalid'), {
      code: projectText?.text ? 'SCENE_PROJECT_INVALID' : SCENE_PKG_UNAVAILABLE
    })
  }
  if (String(project?.type || '').toLowerCase() !== 'scene') throw new Error('not a scene project')

  // Packed scenes ship scene.pkg even when project.json's file field points
  // at the loose scene.json; try the canonical name first, then the field
  // and its .pkg twin.
  const candidates = [joinLocalPath(dir, 'scene.pkg')]
  if (typeof project.file === 'string' && project.file.trim()) {
    const viaField = safeProjectPath(dir, project.file)
    if (viaField) candidates.push(viaField)
    if (/\.json$/i.test(project.file)) {
      const viaPkg = safeProjectPath(dir, project.file.replace(/\.json$/i, '.pkg'))
      if (viaPkg) candidates.push(viaPkg)
    }
  }
  let pkgPath = null
  let pkg = null
  let pkgFromCache = false
  const attempts = []
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const buffer = await bridge.readFileBytes(candidate)
      if (buffer && buffer.byteLength) {
        pkgPath = candidate
        pkg = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
        break
      }
      attempts.push(`${candidate}: empty`)
    } catch (error) {
      attempts.push(`${candidate}: ${error?.message || error}`)
    }
  }
  if (!pkg) {
    // The bytes are not reachable through the session index — fall back to the
    // persisted IndexedDB copy from a previous preparation.
    const cached = await bridge.loadScenePkg?.(dirKey)
    if (cached) {
      pkg = new Uint8Array(cached instanceof ArrayBuffer ? cached : await cached.arrayBuffer())
      pkgPath = candidates.find(Boolean)
      pkgFromCache = true
    }
  }
  if (!pkg) {
    const error = new Error(`scene.pkg bytes unavailable (tried: ${attempts.join('; ') || 'no candidates'})`)
    error.code = SCENE_PKG_UNAVAILABLE
    error.dir = dir
    throw error
  }
  if (pkg.length > MAX_PKG_BYTES) throw new Error('scene package exceeds 512 MiB')

  let manifest = null
  let frame = null
  let video = null
  const errors = []
  try { manifest = buildSceneManifest(pkg, 'local', project) } catch (error) { errors.push(`manifest: ${error.message}`) }
  try { frame = extractSceneMainImage(pkg) } catch (error) { errors.push(`frame: ${error.message}`) }
  if (!manifest?.layers?.length && !manifest?.models?.length) {
    try { video = extractSceneVideo(pkg) } catch (error) { errors.push(`video: ${error.message}`) }
  }
  const hasScene = Boolean(manifest?.layers?.length || manifest?.models?.length)
  if (!hasScene && !video && !frame) {
    throw new Error(errors.join('; ') || 'scene extraction produced nothing renderable')
  }

  const token = sceneTokenForDir(dir)
  const files = new Map()
  const resources = {}
  const missing = []
  for (const url of collectUrls(manifest || {})) {
    const subpath = url.slice(RESOURCE_PREFIX.length).split('/').map(decodeURIComponent).join('/')
    try {
      const bytes = extractSceneResource(pkg, subpath)
      const ext = bytes && extensionOf(bytes)
      if (!bytes || !ext) { missing.push(subpath); continue }
      const name = `r/${fnvHex(subpath, 24)}${ext}`
      files.set(name, bytes)
      resources[url] = `${SCENE_SCHEME}${token}/${name}`
    } catch (error) {
      missing.push(`${subpath}: ${error.message}`)
    }
  }
  let framePath = null
  if (frame) {
    files.set('frame.png', frame.png)
    framePath = `${SCENE_SCHEME}${token}/frame.png`
  }
  let videoPath = null
  if (video) {
    files.set('video.mp4', video)
    videoPath = `${SCENE_SCHEME}${token}/video.mp4`
  }
  const result = {
    parserVersion: SCENE_PARSER_VERSION,
    project,
    frame: Boolean(frame), video: Boolean(video),
    scripted: Boolean(manifest?.scripted), errors, manifest, resources, missing,
    framePath, videoPath, scenePath: pkgPath, projectPath: joinLocalPath(dir, 'project.json')
  }
  files.set('manifest.json', new TextEncoder().encode(JSON.stringify(result)))
  if (!bridge.registerSceneSource) throw new Error('bridge does not support scene stores')
  bridge.registerSceneSource(token, files)
  // Persist (best-effort): the prepared store makes re-preparation after a
  // restart one IDB read; the raw package stays as a re-extraction fallback
  // for when the artifact store gets evicted.
  try {
    await bridge.saveSceneArtifacts?.(dirKey, files)
    if (!pkgFromCache) await bridge.saveScenePkg?.(dirKey, new Blob([pkg]))
  } catch { /* Persistence is optional. */ }
  return {
    ok: true,
    manifestPath: `${SCENE_SCHEME}${token}/manifest.json`,
    framePath, videoPath,
    manifest: hasScene, scripted: Boolean(manifest?.scripted),
    resourceCount: Object.keys(resources).length, missingCount: missing.length
  }
}

/** prepareScene(item.dir) implementation handed to the UI: deduplicates
 * concurrent preparations of the same project and maps failures to the
 * { ok: false, error } contract the panel already handles. */
export function createRendererScenePreparer() {
  const inflight = new Map()
  const preparer = async dir => {
    const bridge = typeof window !== 'undefined' ? window.zcodeDesktop : null
    if (!bridge) return { ok: false, error: 'Local file bridge unavailable / 本地文件桥不可用' }
    const key = String(dir || '').toLowerCase()
    if (!key) return { ok: false, error: 'scene project directory is required' }
    if (inflight.has(key)) return inflight.get(key)
    const job = prepareSceneInMemory(bridge, dir)
      .catch(error => ({ ok: false, error: String(error?.message || error), code: error?.code }))
    inflight.set(key, job)
    try {
      return await job
    } finally {
      inflight.delete(key)
    }
  }
  return preparer
}

/** Re-prepare the persisted scene wallpaper after a renderer restart: the
 * session store is gone, but the stable token keeps the config path valid.
 * normalizeConfig persists weSelection WITHOUT a dir field (older builds) —
 * the lowercased directory survives as `id` (WE items key themselves by
 * directory), so the preparer derives the project directory from it. */
export function rehydrateSceneWallpaper(controller) {
  const config = controller?.store?.$config?.get()
  const selection = config?.weSelection
  const dir = typeof selection?.dir === 'string' && selection.dir
    ? selection.dir
    : (typeof selection?.id === 'string' && /^[a-z]:[\\/]/i.test(selection.id) ? selection.id : null)
  if (config?.wallpaperType !== 'scene' ||
      typeof config.wallpaperSource !== 'string' || !config.wallpaperSource.startsWith(SCENE_SCHEME) ||
      !dir || selection?.staticFallback) return
  if (typeof window === 'undefined' || !window.zcodeDesktop) return

  const restore = async () => {
    const bridge = window.zcodeDesktop
    const dirKey = String(dir).toLowerCase().replace(/[\\/]+$/, '')
    let prepared = null
    // One-shot legacy migration: pre-fix builds piled every prepared scene
    // onto the single 'scene-artifacts' key. The last one prepared is almost
    // always the active wallpaper — adopt it when the tokens match instead of
    // throwing away a 250 MB extraction.
    try {
      const tokenMatch = config.wallpaperSource.match(/^zcode-scene:\/\/([^/]+)\//)
      const expectedToken = sceneTokenForDir(dir)
      if (tokenMatch && tokenMatch[1] === expectedToken) {
        const legacy = await bridge.takeLegacySceneArtifacts?.()
        const files = legacy?.files ? new Map(Object.entries(legacy.files)) : null
        if (files?.has('manifest.json')) {
          bridge.registerSceneSource(expectedToken, files)
          await bridge.saveSceneArtifacts(dirKey, files)
          const manifest = await artifactManifest(files)
          if (Number(manifest.parserVersion || 0) >= SCENE_PARSER_VERSION) prepared = { ok: true }
        }
      }
    } catch { /* Migration is best-effort; the preparer below still runs. */ }

    if (!prepared) {
      const result = await createRendererScenePreparer()(dir)
      if (!result?.ok && !bridge.hasSceneSource?.(sceneTokenForDir(dir))) return
    }

    if (controller.destroyed || controller.store.$config.get().wallpaperSource !== config.wallpaperSource) return

    // The boot-time sync ran before this store was registered and either
    // poisoned failedKeys or left a stale currentKey behind — both would keep
    // every later sync from rebuilding the scene. Reset the backdrop and sync
    // again so showScene actually runs.
    controller.backdrop?.failedKeys?.clear()
    controller.backdrop?.hide()
    controller.sync()
  }

  void restore().catch(() => { /* The wallpaper stays hidden; the user can reselect. */ })
}
