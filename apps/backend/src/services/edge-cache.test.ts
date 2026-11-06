import { Data, Duration, Effect, Exit, Fiber, Layer, ManagedRuntime } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { EDGE_CACHE_TAGS, requestEdgeCache, watchEdgeCache, type EdgeCacheAction } from './edge-cache'
import { HttpClientLive } from './http-client'

class FixtureError extends Data.TaggedError('FixtureError')<{ readonly step: string }> {}

/** Runs the watcher until it has read every given publication state, then stops it */
const runWatcher = async (shas: Array<string | undefined | 'fail'>, options?: { failRequests?: number }) => {
  const events: string[] = []
  const errors: unknown[] = []
  let reads = 0
  let failRequests = options?.failRequests ?? 0
  const done = Promise.withResolvers<void>()
  const fiber = Effect.runFork(
    watchEdgeCache({
      readPublishedSha256: Effect.suspend(() => {
        const sha = shas[reads++]
        if (reads >= shas.length) done.resolve()
        return sha === 'fail' ? Effect.fail(new FixtureError({ step: 'read' })) : Effect.succeed(sha)
      }),
      warmCatalog: Effect.sync(() => void events.push('warm')),
      request: (action: EdgeCacheAction, tags: readonly string[]) =>
        Effect.suspend(() => {
          if (failRequests > 0) {
            failRequests--
            return Effect.fail(new FixtureError({ step: action }))
          }
          events.push(`${action}:${tags.join(',')}`)
          return Effect.void
        }),
      reportError: (error) => Effect.sync(() => void errors.push(error)),
      interval: Duration.millis(1),
    }),
  )
  await done.promise
  await Effect.runPromise(Fiber.interrupt(fiber))
  return { events, errors }
}

describe('edge cache watcher', () => {
  it('warms the catalog and purges every public tag at startup, then stays quiet while nothing changes', async () => {
    const { events, errors } = await runWatcher(['a', 'a', 'a'])
    expect(events).toEqual(['warm', `purge_cache:${EDGE_CACHE_TAGS.join(',')}`])
    expect(errors).toEqual([])
  })

  it('warms and invalidates the catalog when a new body is published', async () => {
    const { events } = await runWatcher(['a', 'a', 'b', 'b'])
    expect(events).toEqual(['warm', `purge_cache:${EDGE_CACHE_TAGS.join(',')}`, 'warm', 'invalidate_cache:dxdata'])
  })

  it('reports a failed step and tries it again at the next check', async () => {
    const { events, errors } = await runWatcher(['a', 'fail', 'a', 'a'], { failRequests: 1 })
    expect(events).toEqual(['warm', 'warm', `purge_cache:${EDGE_CACHE_TAGS.join(',')}`])
    // Two failed checks in a row are one streak, reported once
    expect(errors).toHaveLength(1)
  })
})

describe('edge cache watcher failure reports', () => {
  it('reports the first failure of a streak, not every check', async () => {
    const { errors } = await runWatcher(['fail', 'fail', 'fail', 'fail', 'fail'])
    expect(errors).toHaveLength(1)
  })
})

describe('Cloudflare cache request', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const runtime = ManagedRuntime.make(
    HttpClientLive.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetchMock))),
  )
  afterAll(() => runtime.dispose())

  const credentials = { zoneId: 'zone123', token: 'secret-token' }

  it('posts the tags to the zone endpoint with the token', async () => {
    fetchMock
      .mockReset()
      .mockImplementation(async () => Response.json({ success: true, errors: [], result: { id: 'x' } }))

    await runtime.runPromise(requestEdgeCache(credentials, 'invalidate_cache', ['dxdata']))

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string | URL, RequestInit]
    expect(String(url)).toBe('https://api.cloudflare.com/client/v4/zones/zone123/invalidate_cache')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer secret-token')
    expect(JSON.parse(new TextDecoder().decode(init.body as Uint8Array))).toEqual({ tags: ['dxdata'] })
  })

  it('fails when Cloudflare does not report success', async () => {
    fetchMock
      .mockReset()
      .mockImplementation(async () =>
        Response.json({ success: false, errors: [{ code: 10000, message: 'auth' }] }, { status: 403 }),
      )

    const exit = await runtime.runPromiseExit(requestEdgeCache(credentials, 'purge_cache', ['dxdata']))
    expect(Exit.isFailure(exit)).toBe(true)
  })
})