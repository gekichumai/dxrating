import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { describe, expect, it, vi } from 'vitest'
import {
  createDxdataHandler,
  createPostgresDxdataStore,
  DXDATA_BROWSER_CACHE_CONTROL,
  DXDATA_CDN_CACHE_CONTROL,
  DXDATA_CORS_OPTIONS,
  DXDATA_PATH,
  type DxdataStore,
} from './dxdata.js'

const BODY = '{\n  "title": "でらっくす",\n  "songs": []\n}\n'
const BODY_SHA256 = 'a'.repeat(64)
const ETAG = `"${BODY_SHA256}"`

const metadata = {
  catalogRunId: '42',
  bodySha256: BODY_SHA256,
  byteLength: Buffer.byteLength(BODY).toString(),
  contentType: 'application/json; charset=utf-8',
}

const createStore = (options?: { metadata?: typeof metadata; body?: string }) => {
  const calls: string[] = []
  const store: DxdataStore = {
    async getPublishedMetadata() {
      calls.push('metadata')
      return options && 'metadata' in options ? options.metadata : metadata
    },
    async getSnapshotBody() {
      calls.push('body')
      return options && 'body' in options ? options.body : BODY
    },
  }
  return { calls, store }
}

const createApp = (store: DxdataStore, reportError: (error: unknown) => void = () => {}) => {
  const app = new Hono()
  app.use('*', cors(DXDATA_CORS_OPTIONS))
  app.on(['GET', 'HEAD'], DXDATA_PATH, createDxdataHandler(store, reportError))
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
    expect(calls).toEqual(['metadata'])
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
    const error = new Error('database unavailable')
    const reportError = vi.fn()
    const store: DxdataStore = {
      getPublishedMetadata: async () => Promise.reject(error),
      getSnapshotBody: async () => BODY,
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
    const store = createPostgresDxdataStore(async (text, values) => {
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
    })

    expect(await store.getPublishedMetadata()).toEqual(metadata)
    expect(await store.getSnapshotBody(metadata.catalogRunId, metadata.bodySha256)).toBe(BODY)

    expect(queries[0].text).toContain('dxdata.dcat_publications')
    expect(queries[0].text).toContain('dxdata.dcat_snapshots')
    expect(queries[0].text).toContain('dxdata.dcat_runs')
    expect(queries[0].text).toContain('catalog_run.api_schema_version = $2')
    expect(queries[0].text).toContain('snapshot.api_schema_version = $2')
    expect(queries[0].values).toEqual(['production-v1', 1])
    expect(queries[1].text).toContain('SELECT body_text')
    expect(queries[1].text).toContain('api_schema_version = $3')
    expect(queries[1].values).toEqual([metadata.catalogRunId, metadata.bodySha256, 1])
  })
})