import type { SongCatalogDocument } from '@gekichumai/dxdata'
import snapshotAssetUrl from '@gekichumai/dxdata/snapshot.json?url'
import * as Sentry from '@sentry/tanstackstart-react'

// The browser never gets the catalog in a JS chunk. It loads the dxdata API document once, keeps it in Cache Storage,
// and on later visits renders from that copy at once while it revalidates in the background with the stored ETag.
// The catalog is a plain GET route of the backend, not an oRPC procedure: a first visit takes over the plain fetch() the
// head script starts (`CATALOG_EARLY_FETCH_INLINE_SCRIPT`), and revalidation needs its own conditional request.

export const CATALOG_URL = `${import.meta.env.VITE_BACKEND_URL}/api/v1/dxdata`
export const CATALOG_CACHE_NAME = 'dxrating-catalog-v1'
/** Set once a catalog is in Cache Storage: the head script then does not fetch the catalog, which would go unused */
export const CATALOG_CACHED_MARKER_KEY = 'dxrating:catalog-cached'
const ETAG_HEADER = 'x-dxrating-catalog-etag'

declare global {
  interface Window {
    /** The catalog request the head script started, until the loader takes it over (null after that) */
    __dxratingCatalogRequest?: Promise<Response> | null
  }
}

/**
 * Starts the catalog download for visitors without a cached copy; runs in <head>, before any module script, so the
 * download runs alongside the app's JS. A plain fetch rather than an injected <link rel=preload>: hydration re-creates
 * a script-inserted link, which starts a second download, and browsers differ on preloads `as=fetch`. The router runs
 * head scripts once more when it hydrates, so the script starts one request only. Low priority: on a slow link the
 * page's own images and scripts come first, and the server-rendered page does not need the catalog.
 */
export const CATALOG_EARLY_FETCH_INLINE_SCRIPT = `try{if(!localStorage.getItem(${JSON.stringify(CATALOG_CACHED_MARKER_KEY)})&&window.__dxratingCatalogRequest===undefined){var r=fetch(${JSON.stringify(CATALOG_URL)},{priority:"low"});r.catch(function(){});window.__dxratingCatalogRequest=r}}catch(e){}`

/** The request the head script started, once: the first load takes it over instead of starting its own */
const takeEarlyCatalogRequest = (): Promise<Response> | undefined => {
  if (typeof window === 'undefined') return undefined
  const request = window.__dxratingCatalogRequest ?? undefined
  // null, not undefined: the script runs again when the router hydrates and must not start another request
  if (request) window.__dxratingCatalogRequest = null
  return request
}

type CatalogResponse = { document: SongCatalogDocument; text: string; etag: string | null }

// A cold load waits this long for the API to respond, then this long for the body, before it falls back to the
// snapshot: an unresponsive API must not hold up search, the calculator and imports
const API_RESPONSE_DEADLINE_MS = 10_000
const API_BODY_DEADLINE_MS = 60_000

const catalogTime = (updatedAt: string) => Date.parse(updatedAt.replace(/(\.\d{3})\d+/, '$1'))
const BUILD_CATALOG_TIME = catalogTime(import.meta.env.VITE_CATALOG_SNAPSHOT_UPDATED_AT ?? '')

/**
 * Whether a catalog is older than the snapshot this build renders with: it may lack songs the server-rendered page
 * shows, so it is only used when nothing newer can be had
 */
export const isOlderThanBuildCatalog = (document: SongCatalogDocument) => {
  const time = catalogTime(document.updatedAt)
  return Number.isFinite(BUILD_CATALOG_TIME) && Number.isFinite(time) && time < BUILD_CATALOG_TIME
}

let loadedDocument: SongCatalogDocument | null = null
let pendingLoad: Promise<SongCatalogDocument> | undefined
const listeners = new Set<() => void>()

/** The complete catalog, once loaded */
export const getLoadedCatalogDocument = (): SongCatalogDocument | null => loadedDocument

export const subscribeToCatalog = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const publish = (document: SongCatalogDocument) => {
  if (loadedDocument?.updatedAt === document.updatedAt) return
  // For performance measurements: when pages could first render from the complete catalog
  if (!loadedDocument) performance.mark?.('dxrating:catalog-loaded')
  loadedDocument = document
  for (const listener of listeners) listener()
}

/** Loads the complete catalog: from Cache Storage if there is a copy, else from the network. Retries after a failure */
export function loadClientCatalogDocument(): Promise<SongCatalogDocument> {
  if (loadedDocument) return Promise.resolve(loadedDocument)
  pendingLoad ??= loadCatalog().catch((error: unknown) => {
    pendingLoad = undefined
    throw error
  })
  return pendingLoad
}

async function loadCatalog(): Promise<SongCatalogDocument> {
  const cache = await openCatalogCache()
  const cached = cache ? await readCachedCatalog(cache) : null
  if (cached && !isOlderThanBuildCatalog(cached.document)) {
    publish(cached.document)
    void revalidateCatalog(cache!, cached.etag)
    return cached.document
  }

  // No copy, or one older than the catalog this page was rendered with
  let fresh: CatalogResponse
  try {
    fresh = await fetchCatalog()
  } catch (error) {
    // Neither the API nor the snapshot: an older copy still beats no catalog
    if (!cached) throw error
    publish(cached.document)
    return cached.document
  }
  publish(fresh.document)
  if (cache) void storeCatalog(cache, fresh)
  return fresh.document
}

export const isSongCatalogDocument = (value: unknown): value is SongCatalogDocument => {
  if (typeof value !== 'object' || value === null) return false
  const document = value as Partial<SongCatalogDocument>
  return (
    document.schemaVersion === 1 &&
    typeof document.updatedAt === 'string' &&
    Array.isArray(document.versions) &&
    Array.isArray(document.songs) &&
    document.songs.length > 0
  )
}

async function readCatalogResponse(response: Response): Promise<CatalogResponse> {
  if (!response.ok) throw new Error(`Catalog request failed with HTTP ${response.status}`)
  const text = await response.text()
  const document: unknown = JSON.parse(text)
  if (!isSongCatalogDocument(document)) throw new Error('Catalog response is not a schema v1 catalog document')
  return { document, text, etag: response.headers.get('etag') }
}

/** Rejects once `ms` pass without the promise settling. The work itself goes on; nothing waits for it any more */
const withDeadline = <T>(promise: Promise<T>, ms: number, message: string) =>
  new Promise<T>((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(deadline)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(deadline)
        reject(error)
      },
    )
  })

async function fetchApiCatalog(): Promise<CatalogResponse> {
  // The head script's request when there is one. The deadlines settle the load instead of aborting the request
  const response = await withDeadline(
    takeEarlyCatalogRequest() ?? fetch(CATALOG_URL),
    API_RESPONSE_DEADLINE_MS,
    'The catalog API did not respond in time',
  )
  const catalog = await withDeadline(
    readCatalogResponse(response),
    API_BODY_DEADLINE_MS,
    'The catalog API response stalled',
  )
  if (isOlderThanBuildCatalog(catalog.document))
    throw new Error('The catalog API served a catalog older than this build')
  return catalog
}

async function fetchCatalog(): Promise<CatalogResponse> {
  try {
    return await fetchApiCatalog()
  } catch (error) {
    // The snapshot this build was made with, served as a static asset: the site keeps working while the API is down
    Sentry.logger?.warn?.('Catalog API unavailable, loading the bundled snapshot', { error: String(error) })
    const snapshot = await readCatalogResponse(await fetch(snapshotAssetUrl))
    // Not the API's ETag: the next revalidation fetches the API document in full
    return { ...snapshot, etag: null }
  }
}

async function revalidateCatalog(cache: Cache, etag: string | null) {
  try {
    const response = await fetch(CATALOG_URL, {
      cache: 'no-store',
      headers: etag ? { 'If-None-Match': etag } : {},
    })
    if (response.status === 304) return
    const fresh = await readCatalogResponse(response)
    if (isOlderThanBuildCatalog(fresh.document)) return
    await storeCatalog(cache, fresh)
    publish(fresh.document)
  } catch {
    // Offline or the API is down: keep rendering the cached copy
  }
}

async function openCatalogCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null
  try {
    return await caches.open(CATALOG_CACHE_NAME)
  } catch {
    // Cache Storage can be unavailable (some private modes): load from the network every time
    return null
  }
}

async function readCachedCatalog(cache: Cache): Promise<{ document: SongCatalogDocument; etag: string | null } | null> {
  try {
    const response = await cache.match(CATALOG_URL)
    if (!response) return null
    const document: unknown = await response.json()
    if (!isSongCatalogDocument(document)) {
      await cache.delete(CATALOG_URL)
      return null
    }
    return { document, etag: response.headers.get(ETAG_HEADER) || null }
  } catch {
    return null
  }
}

async function storeCatalog(cache: Cache, { text, etag }: CatalogResponse) {
  try {
    await cache.put(
      CATALOG_URL,
      new Response(text, { headers: { 'content-type': 'application/json', [ETAG_HEADER]: etag ?? '' } }),
    )
    localStorage.setItem(CATALOG_CACHED_MARKER_KEY, '1')
  } catch {
    // A full quota only costs the next visit a download
  }
}

/** Tests only: sets the complete catalog, or clears it with `null` */
export function setLoadedCatalogDocumentForTests(document: SongCatalogDocument | null) {
  pendingLoad = undefined
  if (document) {
    publish(document)
  } else {
    loadedDocument = null
    for (const listener of listeners) listener()
  }
}