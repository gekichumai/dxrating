import type { SongCatalogDocument } from '@gekichumai/dxdata'
import snapshotAssetUrl from '@gekichumai/dxdata/snapshot.json?url'
import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { toV2Catalog } from '@gekichumai/dxdata/v2'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CATALOG_REQUEST_URL,
  CATALOG_URL,
  getLoadedCatalogDocument,
  isLoadedCatalogUnverified,
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

  it('requests the API under the build snapshot, so a stale edge copy of the plain URL is not served', async () => {
    const url = new URL(CATALOG_REQUEST_URL, 'https://dxrating.test')
    expect(url.pathname).toBe(new URL(CATALOG_URL, 'https://dxrating.test').pathname)
    expect(url.searchParams.get('build')).toBe(catalogSnapshot.updatedAt)

    cacheCatalog(cacheStorage.entries, OLD, 'W/"old"')
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }))
    await expect(loadClientCatalogDocument()).resolves.toEqual(OLD)
    // Revalidation uses the same URL; the copy stays under the plain URL, so one from an earlier build is still found
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(String(fetchMock.mock.calls[0]![0])).toBe(CATALOG_REQUEST_URL)
    expect(cacheStorage.entries.has(CATALOG_URL)).toBe(true)
  })

  it('does not fetch the snapshot when the API serves a catalog as new as the build', async () => {
    fetchMock.mockImplementation(async (input) => {
      if (String(input) === CATALOG_REQUEST_URL) return jsonResponse(BUILD, { headers: { etag: 'W/"build"' } })
      throw new Error(`unexpected request ${String(input)}`)
    })

    await expect(loadClientCatalogDocument()).resolves.toEqual(BUILD)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalledWith(snapshotAssetUrl)
    await vi.waitFor(() =>
      expect(cacheStorage.entries.get(CATALOG_URL)!.headers.get('x-dxrating-catalog-etag')).toBe('W/"build"'),
    )
  })

  it('loads the API document on a first visit and keeps it with its ETag', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(NEW, { headers: { etag: 'W/"new"' } }))

    await expect(loadClientCatalogDocument()).resolves.toEqual(NEW)

    expect(fetchMock).toHaveBeenCalledWith(CATALOG_REQUEST_URL)
    expect(getLoadedCatalogDocument()).toEqual(NEW)
    await vi.waitFor(() => expect(cacheStorage.entries.has(CATALOG_URL)).toBe(true))
    const cached = cacheStorage.entries.get(CATALOG_URL)!
    expect(cached.headers.get('x-dxrating-catalog-etag')).toBe('W/"new"')
    await expect(cached.clone().json()).resolves.toEqual(NEW)
  })

  it('loads the v2 API document as the v1 catalog shape, without tags and aliases, and caches it', async () => {
    const { tagGroups: _g, tags: _t, tagSongs: _s, aliases: _a, ...catalog } = NEW
    fetchMock.mockResolvedValueOnce(jsonResponse(toV2Catalog(NEW), { headers: { etag: '"v2"' } }))

    const expected = { ...catalog, tagGroups: [], tags: [], tagSongs: [], aliases: [] }
    await expect(loadClientCatalogDocument()).resolves.toEqual(expected)
    await vi.waitFor(() => expect(cacheStorage.entries.has(CATALOG_URL)).toBe(true))

    // A later visit renders from the cached v2 text
    setLoadedCatalogDocumentForTests(null)
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }))
    await expect(loadClientCatalogDocument()).resolves.toEqual(expected)
  })

  it('deletes the v1 copy an earlier build kept', async () => {
    const v1Url = CATALOG_URL.replace('/api/v2/dxdata', '/api/v1/dxdata')
    cacheStorage.entries.set(v1Url, jsonResponse(OLD))
    fetchMock.mockResolvedValueOnce(jsonResponse(toV2Catalog(NEW)))

    await loadClientCatalogDocument()
    await vi.waitFor(() => expect(cacheStorage.entries.has(v1Url)).toBe(false))
  })

  it('renders a returning visit from the cached copy, then revalidates with its ETag', async () => {
    cacheCatalog(cacheStorage.entries, OLD, 'W/"old"')
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }))

    await expect(loadClientCatalogDocument()).resolves.toEqual(OLD)

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith(CATALOG_REQUEST_URL, {
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
      if (String(input) === CATALOG_REQUEST_URL) throw new TypeError('Failed to fetch')
      if (String(input) === snapshotAssetUrl) return jsonResponse(OLD)
      throw new Error(`unexpected request ${String(input)}`)
    })

    await expect(loadClientCatalogDocument()).resolves.toEqual(OLD)

    // not an API ETag: the next visit fetches the API document in full
    await vi.waitFor(() => expect(cacheStorage.entries.has(CATALOG_URL)).toBe(true))
    expect(cacheStorage.entries.get(CATALOG_URL)!.headers.get('x-dxrating-catalog-etag')).toBe('')
  })

  describe('whether the API vouched for the catalog', () => {
    const apiDown = (snapshot: SongCatalogDocument) =>
      fetchMock.mockImplementation(async (input) => {
        if (String(input) === CATALOG_REQUEST_URL) throw new TypeError('Failed to fetch')
        if (String(input) === snapshotAssetUrl) return jsonResponse(snapshot)
        throw new Error(`unexpected request ${String(input)}`)
      })
    const cacheUnverified = (document: SongCatalogDocument) =>
      cacheStorage.entries.set(
        CATALOG_URL,
        jsonResponse(document, {
          headers: { 'x-dxrating-catalog-etag': '', 'x-dxrating-catalog-source': 'unverified' },
        }),
      )

    it('is vouched for when the API serves it', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(NEW, { headers: { etag: 'W/"new"' } }))
      await loadClientCatalogDocument()
      expect(isLoadedCatalogUnverified()).toBe(false)
    })

    it('is unverified on the snapshot after an outage, and the cached copy says so', async () => {
      apiDown(BUILD)
      await loadClientCatalogDocument()
      expect(isLoadedCatalogUnverified()).toBe(true)
      await vi.waitFor(() =>
        expect(cacheStorage.entries.get(CATALOG_URL)?.headers.get('x-dxrating-catalog-source')).toBe('unverified'),
      )
    })

    it('is vouched for on the snapshot when the API answers with an older catalog', async () => {
      fetchMock.mockImplementation(async (input) => {
        if (String(input) === CATALOG_REQUEST_URL) return jsonResponse(PRE_BUILD)
        if (String(input) === snapshotAssetUrl) return jsonResponse(BUILD)
        throw new Error(`unexpected request ${String(input)}`)
      })
      await loadClientCatalogDocument()
      expect(isLoadedCatalogUnverified()).toBe(false)
    })

    it('is unverified on an older copy when neither the API nor the snapshot loads', async () => {
      cacheCatalog(cacheStorage.entries, PRE_BUILD, 'W/"pre-build"')
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
      await loadClientCatalogDocument()
      expect(isLoadedCatalogUnverified()).toBe(true)
    })

    it('stays unverified on a cached outage copy while the API is still down', async () => {
      cacheUnverified(BUILD)
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
      await loadClientCatalogDocument()
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      expect(isLoadedCatalogUnverified()).toBe(true)
    })

    it('clears once revalidation reaches the API, and tells subscribers', async () => {
      cacheUnverified(BUILD)
      fetchMock.mockResolvedValueOnce(jsonResponse(BUILD, { headers: { etag: 'W/"build"' } }))
      const listener = vi.fn()
      const unsubscribe = subscribeToCatalog(listener)
      await loadClientCatalogDocument()
      expect(isLoadedCatalogUnverified()).toBe(true)
      await vi.waitFor(() => expect(isLoadedCatalogUnverified()).toBe(false))
      expect(listener).toHaveBeenCalledTimes(2)
      unsubscribe()
    })
  })

  it('drops a cached copy of another schema and loads the API document', async () => {
    cacheCatalog(cacheStorage.entries, { schemaVersion: 2, songs: [] }, 'W/"v2"')
    fetchMock.mockResolvedValueOnce(jsonResponse(NEW, { headers: { etag: 'W/"new"' } }))

    await expect(loadClientCatalogDocument()).resolves.toEqual(NEW)
    expect(fetchMock).toHaveBeenCalledWith(CATALOG_REQUEST_URL)
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
      if (String(input) === CATALOG_REQUEST_URL) throw new TypeError('Failed to fetch')
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
      if (String(input) === CATALOG_REQUEST_URL) return jsonResponse(PRE_BUILD, { headers: { etag: 'W/"pre-build"' } })
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
        if (String(input) === CATALOG_REQUEST_URL) return stalledFetch(stall)()
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
  })

  it('retries after a failed load', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(loadClientCatalogDocument()).rejects.toThrow()

    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce(jsonResponse(NEW, { headers: { etag: 'W/"new"' } }))
    await expect(loadClientCatalogDocument()).resolves.toEqual(NEW)
  })
})