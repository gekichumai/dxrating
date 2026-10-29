import type { SongCatalogDocument } from '@gekichumai/dxdata'
import snapshotAssetUrl from '@gekichumai/dxdata/snapshot.json?url'
import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CATALOG_CACHED_MARKER_KEY,
  CATALOG_EARLY_FETCH_INLINE_SCRIPT,
  CATALOG_URL,
  getLoadedCatalogDocument,
  loadClientCatalogDocument,
  setLoadedCatalogDocumentForTests,
  subscribeToCatalog,
} from '../clientCatalog'

const catalogOf = (updatedAt: string): SongCatalogDocument => ({ ...catalogSnapshot, updatedAt })
// Both newer than the snapshot the build renders with; PRE_BUILD is older and may lack the page's songs
const OLD = catalogOf('2099-01-01T00:00:00Z')
const NEW = catalogOf('2099-01-02T00:00:00Z')
// 君の知らない物語, as a page of this build server-renders it, is missing from PRE_BUILD
const PAGE_SONG_ID = 'dsng_kkx38yfx4t'
const PRE_BUILD = {
  ...catalogOf('2020-01-01T00:00:00Z'),
  songs: catalogSnapshot.songs.filter((song) => song.id !== PAGE_SONG_ID),
}
const BUILD = catalogOf(catalogSnapshot.updatedAt)

// An API that never answers, or answers and never sends the body
const stalledFetch = (stall: 'response' | 'body') => () =>
  stall === 'response'
    ? new Promise<Response>(() => {})
    : Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => new Promise<string>(() => {}),
      } as Response)

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

    // without a request from the head script, the loader starts its own
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

  it('does not render from a copy older than the build, and loads the API document instead', async () => {
    cacheCatalog(cacheStorage.entries, PRE_BUILD, 'W/"pre-build"')
    fetchMock.mockResolvedValueOnce(jsonResponse(NEW, { headers: { etag: 'W/"new"' } }))
    const listener = vi.fn()
    const unsubscribe = subscribeToCatalog(listener)

    await expect(loadClientCatalogDocument()).resolves.toEqual(NEW)

    // the older copy is never published: it may lack songs the server-rendered page shows
    expect(listener).toHaveBeenCalledTimes(1)
    await vi.waitFor(() =>
      expect(cacheStorage.entries.get(CATALOG_URL)!.headers.get('x-dxrating-catalog-etag')).toBe('W/"new"'),
    )
    unsubscribe()
  })

  it('replaces a copy older than the build with the build snapshot when the API is down', async () => {
    cacheCatalog(cacheStorage.entries, PRE_BUILD, 'W/"pre-build"')
    fetchMock.mockImplementation(async (input) => {
      if (String(input) === CATALOG_URL) throw new TypeError('Failed to fetch')
      if (String(input) === snapshotAssetUrl) return jsonResponse(BUILD)
      throw new Error(`unexpected request ${String(input)}`)
    })

    await expect(loadClientCatalogDocument()).resolves.toEqual(BUILD)
    expect(getLoadedCatalogDocument()!.songs.some((song) => song.id === PAGE_SONG_ID)).toBe(true)
  })

  it('still renders a copy older than the build when neither the API nor the snapshot loads', async () => {
    cacheCatalog(cacheStorage.entries, PRE_BUILD, 'W/"pre-build"')
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(loadClientCatalogDocument()).resolves.toEqual(PRE_BUILD)
  })

  it('uses the build snapshot when the API serves a catalog older than the build', async () => {
    fetchMock.mockImplementation(async (input) => {
      if (String(input) === CATALOG_URL) return jsonResponse(PRE_BUILD, { headers: { etag: 'W/"pre-build"' } })
      if (String(input) === snapshotAssetUrl) return jsonResponse(BUILD)
      throw new Error(`unexpected request ${String(input)}`)
    })

    await expect(loadClientCatalogDocument()).resolves.toEqual(BUILD)
  })

  it('never swaps in a catalog older than the build found by revalidation', async () => {
    cacheCatalog(cacheStorage.entries, OLD, 'W/"old"')
    fetchMock.mockResolvedValueOnce(jsonResponse(PRE_BUILD, { headers: { etag: 'W/"pre-build"' } }))

    await expect(loadClientCatalogDocument()).resolves.toEqual(OLD)

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(getLoadedCatalogDocument()).toEqual(OLD)
    expect(cacheStorage.entries.get(CATALOG_URL)!.headers.get('x-dxrating-catalog-etag')).toBe('W/"old"')
  })

  it.each([
    ['does not respond', 'response', 10_000],
    // the body deadline starts once the response is in, here at once
    ['stalls in the body', 'body', 60_000],
  ] as const)('falls back to the build snapshot when the API %s', async (_case, stall, deadlineMs) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      vi.stubGlobal('caches', undefined)
      fetchMock.mockImplementation(async (input) => {
        if (String(input) === CATALOG_URL) return stalledFetch(stall)()
        if (String(input) === snapshotAssetUrl) return jsonResponse(BUILD)
        throw new Error(`unexpected request ${String(input)}`)
      })

      const load = loadClientCatalogDocument()
      await vi.advanceTimersByTimeAsync(deadlineMs - 1_000)
      expect(getLoadedCatalogDocument()).toBeNull()
      await vi.advanceTimersByTimeAsync(1_000)

      await expect(load).resolves.toEqual(BUILD)
    } finally {
      vi.useRealTimers()
    }
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

describe('catalog early fetch script', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    localStorage.clear()
    window.__dxratingCatalogRequest = undefined
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(jsonResponse(NEW, { headers: { etag: 'W/"new"' } }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.__dxratingCatalogRequest = undefined
    setLoadedCatalogDocumentForTests(catalogSnapshot)
  })

  it('starts the download for visitors without a cached copy, and the first load takes it over', async () => {
    new Function(CATALOG_EARLY_FETCH_INLINE_SCRIPT)()
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(CATALOG_URL)

    setLoadedCatalogDocumentForTests(null)
    vi.stubGlobal('caches', undefined)
    await expect(loadClientCatalogDocument()).resolves.toEqual(NEW)

    // no second request, also when the router runs the head script again after the load took the request over
    new Function(CATALOG_EARLY_FETCH_INLINE_SCRIPT)()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('starts one download, though the router runs head scripts again when it hydrates', () => {
    new Function(CATALOG_EARLY_FETCH_INLINE_SCRIPT)()
    new Function(CATALOG_EARLY_FETCH_INLINE_SCRIPT)()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('downloads nothing when the catalog is cached', () => {
    localStorage.setItem(CATALOG_CACHED_MARKER_KEY, '1')
    new Function(CATALOG_EARLY_FETCH_INLINE_SCRIPT)()

    expect(fetchMock).not.toHaveBeenCalled()
  })
})