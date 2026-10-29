import type { SongCatalogDocument } from '@gekichumai/dxdata'
import snapshotAssetUrl from '@gekichumai/dxdata/snapshot.json?url'
import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CATALOG_CACHED_MARKER_KEY,
  CATALOG_PRELOAD_INLINE_SCRIPT,
  CATALOG_URL,
  getLoadedCatalogDocument,
  loadClientCatalogDocument,
  setLoadedCatalogDocumentForTests,
  subscribeToCatalog,
} from '../clientCatalog'

const catalogOf = (updatedAt: string): SongCatalogDocument => ({ ...catalogSnapshot, updatedAt })
const OLD = catalogOf('2026-10-28T00:00:00Z')
const NEW = catalogOf('2026-10-29T00:00:00Z')

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })

// Cache Storage as browsers have it, in memory
const createCacheStorage = () => {
  const entries = new Map<string, Response>()
  const cache = {
    match: async (key: RequestInfo | URL) => entries.get(String(key))?.clone(),
    put: async (key: RequestInfo | URL, response: Response) => {
      entries.set(String(key), response)
    },
    delete: async (key: RequestInfo | URL) => entries.delete(String(key)),
  }
  return { storage: { open: async () => cache } as unknown as CacheStorage, entries }
}

const cacheCatalog = (entries: Map<string, Response>, document: unknown, etag: string) =>
  entries.set(CATALOG_URL, jsonResponse(document, { headers: { 'x-dxrating-catalog-etag': etag } }))

describe('client catalog loading', () => {
  let cacheStorage: ReturnType<typeof createCacheStorage>
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    setLoadedCatalogDocumentForTests(null)
    localStorage.clear()
    cacheStorage = createCacheStorage()
    vi.stubGlobal('caches', cacheStorage.storage)
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  afterAll(() => {
    setLoadedCatalogDocumentForTests(catalogSnapshot)
  })

  it('loads the API document on a first visit, keeps it with its ETag and marks the cache as filled', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(NEW, { headers: { etag: 'W/"new"' } }))

    await expect(loadClientCatalogDocument()).resolves.toEqual(NEW)

    // a plain request, so it consumes the <link rel=preload> of the head script
    expect(fetchMock).toHaveBeenCalledWith(CATALOG_URL)
    expect(getLoadedCatalogDocument()).toEqual(NEW)
    await vi.waitFor(() => expect(localStorage.getItem(CATALOG_CACHED_MARKER_KEY)).toBe('1'))
    const cached = cacheStorage.entries.get(CATALOG_URL)!
    expect(cached.headers.get('x-dxrating-catalog-etag')).toBe('W/"new"')
    await expect(cached.clone().json()).resolves.toEqual(NEW)
  })

  it('renders a returning visit from the cached copy, then revalidates with its ETag', async () => {
    cacheCatalog(cacheStorage.entries, OLD, 'W/"old"')
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }))

    await expect(loadClientCatalogDocument()).resolves.toEqual(OLD)

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith(CATALOG_URL, {
      cache: 'no-store',
      headers: { 'If-None-Match': 'W/"old"' },
    })
    expect(getLoadedCatalogDocument()).toEqual(OLD)
  })

  it('swaps in a newer catalog found by revalidation and tells subscribers', async () => {
    cacheCatalog(cacheStorage.entries, OLD, 'W/"old"')
    fetchMock.mockResolvedValueOnce(jsonResponse(NEW, { headers: { etag: 'W/"new"' } }))
    const listener = vi.fn()
    const unsubscribe = subscribeToCatalog(listener)

    await expect(loadClientCatalogDocument()).resolves.toEqual(OLD)

    await vi.waitFor(() => expect(getLoadedCatalogDocument()).toEqual(NEW))
    expect(listener).toHaveBeenCalledTimes(2)
    expect(cacheStorage.entries.get(CATALOG_URL)!.headers.get('x-dxrating-catalog-etag')).toBe('W/"new"')
    unsubscribe()
  })

  it('keeps the cached copy when revalidation fails', async () => {
    cacheCatalog(cacheStorage.entries, OLD, 'W/"old"')
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(loadClientCatalogDocument()).resolves.toEqual(OLD)

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(getLoadedCatalogDocument()).toEqual(OLD)
    expect(cacheStorage.entries.get(CATALOG_URL)!.headers.get('x-dxrating-catalog-etag')).toBe('W/"old"')
  })

  it('falls back to the snapshot of the build when the API is down', async () => {
    fetchMock.mockImplementation(async (input) => {
      if (String(input) === CATALOG_URL) throw new TypeError('Failed to fetch')
      if (String(input) === snapshotAssetUrl) return jsonResponse(OLD)
      throw new Error(`unexpected request ${String(input)}`)
    })

    await expect(loadClientCatalogDocument()).resolves.toEqual(OLD)

    // not an API ETag: the next visit fetches the API document in full
    await vi.waitFor(() => expect(cacheStorage.entries.has(CATALOG_URL)).toBe(true))
    expect(cacheStorage.entries.get(CATALOG_URL)!.headers.get('x-dxrating-catalog-etag')).toBe('')
  })

  it('drops a cached copy of another schema and loads the API document', async () => {
    cacheCatalog(cacheStorage.entries, { schemaVersion: 2, songs: [] }, 'W/"v2"')
    fetchMock.mockResolvedValueOnce(jsonResponse(NEW, { headers: { etag: 'W/"new"' } }))

    await expect(loadClientCatalogDocument()).resolves.toEqual(NEW)
    expect(fetchMock).toHaveBeenCalledWith(CATALOG_URL)
  })

  it('loads from the network every time without Cache Storage', async () => {
    vi.stubGlobal('caches', undefined)
    fetchMock.mockResolvedValueOnce(jsonResponse(NEW, { headers: { etag: 'W/"new"' } }))

    await expect(loadClientCatalogDocument()).resolves.toEqual(NEW)
    expect(localStorage.getItem(CATALOG_CACHED_MARKER_KEY)).toBeNull()
  })

  it('retries after a failed load', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(loadClientCatalogDocument()).rejects.toThrow()

    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce(jsonResponse(NEW, { headers: { etag: 'W/"new"' } }))
    await expect(loadClientCatalogDocument()).resolves.toEqual(NEW)
  })
})

describe('catalog preload script', () => {
  beforeEach(() => {
    localStorage.clear()
    for (const link of document.head.querySelectorAll('link[rel=preload]')) link.remove()
  })

  it('preloads the catalog for visitors without a cached copy', () => {
    new Function(CATALOG_PRELOAD_INLINE_SCRIPT)()

    const link = document.head.querySelector('link[rel=preload]') as HTMLLinkElement
    expect(link.getAttribute('href')).toBe(CATALOG_URL)
    expect(link.getAttribute('as')).toBe('fetch')
    expect(link.getAttribute('crossorigin')).toBe('anonymous')
  })

  it('adds the preload once, though the router runs head scripts again when it hydrates', () => {
    new Function(CATALOG_PRELOAD_INLINE_SCRIPT)()
    new Function(CATALOG_PRELOAD_INLINE_SCRIPT)()

    expect(document.head.querySelectorAll('link[rel=preload]')).toHaveLength(1)
  })

  it('leaves the preload out when the catalog is cached', () => {
    localStorage.setItem(CATALOG_CACHED_MARKER_KEY, '1')
    new Function(CATALOG_PRELOAD_INLINE_SCRIPT)()

    expect(document.head.querySelector('link[rel=preload]')).toBeNull()
  })
})