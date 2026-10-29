import type { SongCatalogDocument } from '@gekichumai/dxdata'
import snapshotAssetUrl from '@gekichumai/dxdata/snapshot.json?url'
import * as Sentry from '@sentry/tanstackstart-react'

// The browser never gets the catalog in a JS chunk. It loads the dxdata API document once, keeps it in Cache Storage,
// and on later visits renders from that copy at once while it revalidates in the background with the stored ETag.
// The catalog is a plain GET route of the backend, not an oRPC procedure, and it has to be a plain fetch() so that it
// consumes the <link rel=preload> of the head script (`CATALOG_PRELOAD_INLINE_SCRIPT`).

export const CATALOG_URL = `${import.meta.env.VITE_BACKEND_URL}/api/v1/dxdata`
export const CATALOG_CACHE_NAME = 'dxrating-catalog-v1'
/** Set once a catalog is in Cache Storage: the head script then leaves out the preload, which would go unused */
export const CATALOG_CACHED_MARKER_KEY = 'dxrating:catalog-cached'
const ETAG_HEADER = 'x-dxrating-catalog-etag'

const CATALOG_PRELOAD_LINK_ID = 'dxrating-catalog-preload'

/**
 * Preloads the catalog for visitors without a cached copy; runs in <head>, before any module script. The router runs
 * head scripts once more when it hydrates, so the script adds its link only once.
 */
export const CATALOG_PRELOAD_INLINE_SCRIPT = `try{if(!localStorage.getItem(${JSON.stringify(CATALOG_CACHED_MARKER_KEY)})&&!document.getElementById(${JSON.stringify(CATALOG_PRELOAD_LINK_ID)})){var l=document.createElement("link");l.id=${JSON.stringify(CATALOG_PRELOAD_LINK_ID)};l.rel="preload";l.as="fetch";l.crossOrigin="anonymous";l.href=${JSON.stringify(CATALOG_URL)};document.head.appendChild(l)}}catch(e){}`

type CatalogResponse = { document: SongCatalogDocument; text: string; etag: string | null }

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
  if (cached) {
    publish(cached.document)
    void revalidateCatalog(cache!, cached.etag)
    return cached.document
  }

  const fresh = await fetchCatalog()
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

async function fetchCatalog(): Promise<CatalogResponse> {
  try {
    return await readCatalogResponse(await fetch(CATALOG_URL))
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