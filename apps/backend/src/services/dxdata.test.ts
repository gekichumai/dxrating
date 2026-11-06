import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { Data, Effect } from 'effect'
import { brotliDecompressSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import {
  acceptsBrotli,
  createDxdataEffect,
  createPostgresDxdataEffects,
  DXDATA_BROWSER_CACHE_CONTROL,
  DXDATA_CDN_CACHE_CONTROL,
  DXDATA_CORS_OPTIONS,
  DXDATA_PATH,
} from './dxdata'

const BODY = '{\n  "title": "でらっくす",\n  "songs": []\n}\n'
const BODY_SHA256 = 'a'.repeat(64)
const ETAG = `"${BODY_SHA256}"`

const metadata = {
  catalogRunId: '42',
  bodySha256: BODY_SHA256,
  byteLength: Buffer.byteLength(BODY).toString(),
  contentType: 'application/json; charset=utf-8',
}

class StoreError extends Data.TaggedError('StoreError')<{ readonly message: string }> {}

type FixtureStore = {
  getPublishedMetadata: () => Effect.Effect<typeof metadata | undefined, StoreError>
  getSnapshotBody: (catalogRunId: string, bodySha256: string) => Effect.Effect<string | undefined, StoreError>
}

const createStore = (options?: { metadata?: typeof metadata; body?: string }) => {
  const calls: string[] = []
  const store: FixtureStore = {
    getPublishedMetadata: () =>
      Effect.sync(() => {
        calls.push('metadata')
        return options && 'metadata' in options ? options.metadata : metadata
      }),
    getSnapshotBody: () =>
      Effect.sync(() => {
        calls.push('body')
        return options && 'body' in options ? options.body : BODY
      }),
  }
  return { calls, store }
}

const createApp = (store: FixtureStore, reportError: (error: unknown) => void = () => {}) => {
  const app = new Hono()
  app.use('*', cors(DXDATA_CORS_OPTIONS))
  // One handler for the app's lifetime, as in app.ts: it keeps the compressed body between requests
  const handler = createDxdataEffect(store, reportError)
  app.on(['GET', 'HEAD'], DXDATA_PATH, (context) => Effect.runPromise(handler(context)))
  return app
}

const expectUncached = (response: Response) => {
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(response.headers.get('cdn-cache-control')).toBe('no-store')
  expect(response.headers.get('cloudflare-cdn-cache-control')).toBe('no-store')
  expect(response.headers.has('etag')).toBe(false)
}

describe('DX data catalog endpoint', () => {
  it('reads metadata before the body and returns the stored body unchanged', async () => {
    const { calls, store } = createStore()
    const response = await createApp(store).request(DXDATA_PATH, {
      headers: { Origin: 'https://example.app' },
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe(BODY)
    expect(calls).toEqual(['metadata', 'body'])
    expect(response.headers.get('etag')).toBe(ETAG)
    expect(response.headers.get('content-length')).toBe(Buffer.byteLength(BODY).toString())
    expect(response.headers.get('content-type')).toBe(metadata.contentType)
    expect(response.headers.get('cache-control')).toBe(DXDATA_BROWSER_CACHE_CONTROL)
    expect(response.headers.get('cdn-cache-control')).toBe(DXDATA_CDN_CACHE_CONTROL)
    expect(response.headers.get('cloudflare-cdn-cache-control')).toBe(DXDATA_CDN_CACHE_CONTROL)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.has('access-control-allow-credentials')).toBe(false)
    expect(response.headers.get('vary') ?? '').not.toContain('Origin')
  })

  it.each([
    ['an exact validator', ETAG],
    ['a weak validator', `W/${ETAG}`],
    ['an exact validator in a list', `"${'b'.repeat(64)}", ${ETAG}`],
    ['a weak validator in a list', `"${'b'.repeat(64)}", W/${ETAG}`],
    ['the wildcard', '*'],
  ])('returns 304 for %s without querying the body', async (_description, ifNoneMatch) => {
    const { calls, store } = createStore()
    const response = await createApp(store).request(DXDATA_PATH, {
      headers: { 'If-None-Match': ifNoneMatch },
    })

    expect(response.status).toBe(304)
    expect(await response.text()).toBe('')
    expect(response.headers.get('etag')).toBe(ETAG)
    expect(response.headers.get('cache-control')).toBe(DXDATA_BROWSER_CACHE_CONTROL)
    expect(response.headers.get('cdn-cache-control')).toBe(DXDATA_CDN_CACHE_CONTROL)
    expect(response.headers.get('cache-tag')).toBe('dxdata')
    expect(calls).toEqual(['metadata'])
  })

  const BROTLI = { 'Accept-Encoding': 'gzip, br' }
  const BR_ETAG = `"${BODY_SHA256}.br"`

  /** Requests until the Brotli body is served: the first GET only starts the compression */
  const untilBrotli = async (app: Hono) => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const response = await app.request(DXDATA_PATH, { headers: BROTLI })
      if (response.headers.get('content-encoding') === 'br') return response
      await response.arrayBuffer()
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    throw new Error('the Brotli body was never served')
  }

  it('serves the identity body at once and the Brotli body, under its own ETag, once compressed', async () => {
    const { calls, store } = createStore()
    const app = createApp(store)
    const first = await app.request(DXDATA_PATH, { headers: BROTLI })
    expect(first.headers.has('content-encoding')).toBe(false)
    expect(first.headers.get('etag')).toBe(ETAG)
    expect(await first.text()).toBe(BODY)

    const brotli = await untilBrotli(app)
    expect(brotli.status).toBe(200)
    expect(brotli.headers.get('etag')).toBe(BR_ETAG)
    expect(brotli.headers.get('vary')).toBe('Accept-Encoding')
    const encoded = Buffer.from(await brotli.arrayBuffer())
    expect(brotli.headers.get('content-length')).toBe(encoded.byteLength.toString())
    expect(brotliDecompressSync(encoded).toString()).toBe(BODY)
    // Once compressed, Brotli responses no longer read the stored body
    const bodyReads = calls.filter((call) => call === 'body').length
    await (await app.request(DXDATA_PATH, { headers: BROTLI })).arrayBuffer()
    expect(calls.filter((call) => call === 'body')).toHaveLength(bodyReads)

    const identity = await app.request(DXDATA_PATH)
    expect(identity.headers.has('content-encoding')).toBe(false)
    expect(identity.headers.get('etag')).toBe(ETAG)
    expect(await identity.text()).toBe(BODY)
  })

  it('answers HEAD and 304 for the representation a GET would send, never relabelling a cached identity body', async () => {
    const { calls, store } = createStore()
    const app = createApp(store)

    const headBefore = await app.request(DXDATA_PATH, { method: 'HEAD', headers: BROTLI })
    expect(headBefore.headers.has('content-encoding')).toBe(false)
    expect(headBefore.headers.get('content-length')).toBe(Buffer.byteLength(BODY).toString())
    expect(calls).toEqual(['metadata'])

    const encodedLength = (await (await untilBrotli(app)).arrayBuffer()).byteLength.toString()

    const head = await app.request(DXDATA_PATH, { method: 'HEAD', headers: BROTLI })
    const notModified = await app.request(DXDATA_PATH, { headers: { ...BROTLI, 'If-None-Match': BR_ETAG } })
    expect(notModified.status).toBe(304)
    for (const response of [head, notModified]) {
      expect(response.headers.get('etag')).toBe(BR_ETAG)
      expect(response.headers.get('content-encoding')).toBe('br')
      expect(response.headers.get('content-length')).toBe(encodedLength)
    }

    // A cache holding the identity body revalidates with its ETag and gets the Brotli body, not a 304
    const upgraded = await app.request(DXDATA_PATH, { headers: { ...BROTLI, 'If-None-Match': ETAG } })
    expect(upgraded.status).toBe(200)
    expect(upgraded.headers.get('content-encoding')).toBe('br')
    expect(brotliDecompressSync(Buffer.from(await upgraded.arrayBuffer())).toString()).toBe(BODY)

    const identityNotModified = await app.request(DXDATA_PATH, { headers: { 'If-None-Match': ETAG } })
    expect(identityNotModified.status).toBe(304)
    expect(identityNotModified.headers.has('content-encoding')).toBe(false)
  })

  it('compresses again once a new body is published', async () => {
    const calls: string[] = []
    let current = { metadata, body: BODY }
    const store: FixtureStore = {
      getPublishedMetadata: () => Effect.sync(() => (calls.push('metadata'), current.metadata)),
      getSnapshotBody: () => Effect.sync(() => (calls.push('body'), current.body)),
    }
    const app = createApp(store)
    await (await untilBrotli(app)).arrayBuffer()

    const next = '{"songs":[1]}'
    current = { metadata: { ...metadata, bodySha256: 'c'.repeat(64), byteLength: next.length.toString() }, body: next }
    const first = await app.request(DXDATA_PATH, { headers: BROTLI })
    expect(first.headers.has('content-encoding')).toBe(false)
    expect(await first.text()).toBe(next)
    const response = await untilBrotli(app)
    expect(response.headers.get('etag')).toBe(`"${'c'.repeat(64)}.br"`)
    expect(brotliDecompressSync(Buffer.from(await response.arrayBuffer())).toString()).toBe(next)
  })

  it.each([
    ['gzip, br', true],
    ['br;q=0.5', true],
    ['*', true],
    ['gzip', false],
    ['br;q=0', false],
    ['br;q=0, *', false],
    ['*, br;q=0', false],
    ['*;q=0', false],
    ['gzip, *', true],
    ['identity', false],
    [undefined, false],
  ])('reads Accept-Encoding %j as accepting Brotli: %s', (header, expected) => {
    expect(acceptsBrotli(header)).toBe(expected)
  })

  it('lets the edge revalidate within a minute, since nothing purges it on publish', () => {
    const maxAge = Number(/(?:^|,\s*)max-age=(\d+)/.exec(DXDATA_CDN_CACHE_CONTROL)?.[1])
    expect(maxAge).toBeLessThanOrEqual(60)
    expect(DXDATA_CDN_CACHE_CONTROL).toMatch(/stale-while-revalidate=\d+/)
  })

  it('answers HEAD from metadata without querying the body', async () => {
    const { calls, store } = createStore()
    const response = await createApp(store).request(DXDATA_PATH, { method: 'HEAD' })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')
    expect(response.headers.get('etag')).toBe(ETAG)
    expect(response.headers.get('content-length')).toBe(Buffer.byteLength(BODY).toString())
    expect(calls).toEqual(['metadata'])
  })

  it('queries the body for a non-matching validator', async () => {
    const { calls, store } = createStore()
    const response = await createApp(store).request(DXDATA_PATH, {
      headers: { 'If-None-Match': `"${'b'.repeat(64)}"` },
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe(BODY)
    expect(calls).toEqual(['metadata', 'body'])
  })

  it('does not cache an unavailable publication or missing snapshot body', async () => {
    const unavailable = createStore({ metadata: undefined })
    const unavailableResponse = await createApp(unavailable.store).request(DXDATA_PATH)

    expect(unavailableResponse.status).toBe(503)
    expectUncached(unavailableResponse)
    expect(unavailable.calls).toEqual(['metadata'])

    const missingBody = createStore({ body: undefined })
    const missingBodyResponse = await createApp(missingBody.store).request(DXDATA_PATH)

    expect(missingBodyResponse.status).toBe(503)
    expectUncached(missingBodyResponse)
    expect(missingBody.calls).toEqual(['metadata', 'body'])
  })

  it('reports database failures and returns an uncached error', async () => {
    const error = new StoreError({ message: 'database unavailable' })
    const reportError = vi.fn()
    const store: FixtureStore = {
      getPublishedMetadata: () => Effect.fail(error),
      getSnapshotBody: () => Effect.succeed(BODY),
    }

    const response = await createApp(store, reportError).request(DXDATA_PATH)

    expect(response.status).toBe(500)
    expectUncached(response)
    expect(reportError).toHaveBeenCalledOnce()
    expect(reportError).toHaveBeenCalledWith(error, expect.anything())
  })

  it('handles public CORS preflight without touching the database', async () => {
    const { calls, store } = createStore()
    const response = await createApp(store).request(DXDATA_PATH, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.app',
        'Access-Control-Request-Method': 'HEAD',
        'Access-Control-Request-Headers': 'If-None-Match',
      },
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('access-control-allow-methods')).toContain('HEAD')
    expect(response.headers.get('access-control-allow-headers')).toContain('If-None-Match')
    expect(calls).toEqual([])
  })
})

describe('PostgreSQL DX data store', () => {
  it('reads publication metadata from the producer tables and then fetches the selected snapshot body', async () => {
    const queries: Array<{ text: string; values: unknown[] }> = []
    const store = createPostgresDxdataEffects((text, values) =>
      Effect.sync(() => {
        queries.push({ text, values })
        if (queries.length === 1) {
          return {
            rows: [
              {
                catalog_run_id: metadata.catalogRunId,
                body_sha256: metadata.bodySha256,
                byte_length: metadata.byteLength,
                content_type: metadata.contentType,
              },
            ],
          }
        }
        return { rows: [{ body_text: BODY }] }
      }),
    )

    expect(await Effect.runPromise(store.getPublishedMetadata())).toEqual(metadata)
    expect(await Effect.runPromise(store.getSnapshotBody(metadata.catalogRunId, metadata.bodySha256))).toBe(BODY)

    expect(queries[0].text).toContain('dxdata.catalog_publications')
    expect(queries[0].text).toContain('dxdata.catalog_snapshots')
    expect(queries[0].text).toContain('dxdata.catalog_build_runs')
    expect(queries[0].text).toContain('catalog_run.api_schema_version = $2')
    expect(queries[0].text).toContain('snapshot.api_schema_version = $2')
    expect(queries[0].values).toEqual(['production-v1', 1])
    expect(queries[1].text).toContain('SELECT body_text')
    expect(queries[1].text).toContain('api_schema_version = $3')
    expect(queries[1].values).toEqual([metadata.catalogRunId, metadata.bodySha256, 1])
  })
})