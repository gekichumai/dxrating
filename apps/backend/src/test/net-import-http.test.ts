import { Effect, Layer, ManagedRuntime } from 'effect'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NetImportError, NetRequestError } from '../lib/functions/client'
import { createRequestRunner } from '../request-runner'
import { v0Handler, v1Handler } from '../services/functions/fetch-net-records/index'

const { login, runApp } = vi.hoisted(() => ({
  login: vi.fn<() => Effect.Effect<void, NetImportError | NetRequestError>>(),
  runApp: vi.fn(),
}))
vi.mock('../runtime', () => ({ runApp }))
vi.mock('../lib/functions/client', async (original) => {
  const actual = await original<typeof import('../lib/functions/client')>()
  const { Effect } = await import('effect')
  return {
    ...actual,
    withMaimaiNETClient: (
      _region: string,
      use: (client: {
        loginEffect: () => Effect.Effect<void, NetImportError | NetRequestError>
        fetchRecentRecordsEffect: () => Effect.Effect<unknown[]>
        fetchMusicRecordsEffect: () => Effect.Effect<unknown[]>
      }) => Effect.Effect<unknown, NetImportError | NetRequestError>,
      progress?: (state: string) => void | Promise<void>,
    ) =>
      use({
        loginEffect: () =>
          Effect.gen(function* () {
            yield* Effect.promise(async () => {
              await progress?.('auth:in-progress')
            })
            yield* login()
            yield* Effect.promise(async () => {
              await progress?.('auth:succeeded')
            })
          }),
        fetchRecentRecordsEffect: () => Effect.succeed([{ id: 'recent-record' }]),
        fetchMusicRecordsEffect: () => Effect.succeed([{ id: 'music-record' }]),
      }),
  }
})

const app = new Hono<{ Variables: { region: 'intl'; authParams: { id: string; password: string } } }>()
app.use('*', (c, next) => {
  c.set('region', 'intl')
  c.set('authParams', { id: 'fixture', password: 'fixture' })
  return next()
})
app.post('/v0', v0Handler)
app.post('/v1', v1Handler)

let requests: ReturnType<typeof createRequestRunner<never, never>>
beforeEach(() => {
  login.mockReset().mockReturnValue(Effect.void)
  requests = createRequestRunner(ManagedRuntime.make(Layer.empty))
  runApp.mockReset().mockImplementation(requests.run)
})
afterEach(() => requests.shutdown())

const readEvents = async (response: Response) =>
  (await response.text())
    .trim()
    .split('\n\n')
    .map((event) => {
      const lines = Object.fromEntries(
        event.split('\n').map((line) => {
          const separator = line.indexOf(': ')
          return [line.slice(0, separator), line.slice(separator + 2)]
        }),
      )
      return { event: lines.event, data: JSON.parse(lines.data) }
    })

describe('NET import HTTP compatibility', () => {
  it('preserves the v0 JSON response field names', async () => {
    const response = await app.request('/v0', { method: 'POST' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      recentRecords: [{ id: 'recent-record' }],
      musicRecords: [{ id: 'music-record' }],
    })
  })

  it('publishes ordered progress followed by the v1 records payload', async () => {
    const response = await app.request('/v1', { method: 'POST' })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(await readEvents(response)).toEqual([
      { event: 'progress', data: { state: 'auth:in-progress' } },
      { event: 'progress', data: { state: 'auth:succeeded' } },
      { event: 'progress', data: { state: 'concluded' } },
      { event: 'data', data: { recent: [{ id: 'recent-record' }], music: [{ id: 'music-record' }] } },
    ])
  })

  it('preserves typed NET failure codes and emits no success events', async () => {
    login.mockReturnValue(Effect.fail(new NetImportError('AIME_CARD_UNAVAILABLE', 'Aime card unavailable')))
    const events = await readEvents(await app.request('/v1', { method: 'POST' }))
    expect(events).toEqual([
      { event: 'progress', data: { state: 'auth:in-progress' } },
      { event: 'error', data: { code: 'AIME_CARD_UNAVAILABLE', error: 'Aime card unavailable' } },
    ])
  })

  it('preserves an upstream failure message with the unknown error code', async () => {
    login.mockReturnValue(
      Effect.fail(
        new NetRequestError({ operation: 'request maimai NET', cause: new Error('upstream connection reset') }),
      ),
    )
    const events = await readEvents(await app.request('/v1', { method: 'POST' }))
    expect(events.at(-1)).toEqual({
      event: 'error',
      data: { code: 'UNKNOWN_ERROR', error: 'upstream connection reset' },
    })
  })

  it('joins an active SSE producer and its resource finalizer during application shutdown', async () => {
    const started = Promise.withResolvers<void>()
    const finalizing = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    let finalized = false
    login.mockReturnValue(
      Effect.scoped(
        Effect.acquireRelease(
          Effect.sync(() => started.resolve()),
          () =>
            Effect.promise(async () => {
              finalizing.resolve()
              await release.promise
              finalized = true
            }),
        ).pipe(Effect.andThen(Effect.never)),
      ),
    )

    const response = await app.request('/v1', { method: 'POST' })
    const events = readEvents(response)
    await started.promise
    let stopped = false
    const shutdown = requests.shutdown().then(() => {
      stopped = true
    })
    try {
      await finalizing.promise
      expect(stopped).toBe(false)
      expect(finalized).toBe(false)
    } finally {
      release.resolve()
      await shutdown
    }
    expect(finalized).toBe(true)
    expect(await events).toEqual([{ event: 'progress', data: { state: 'auth:in-progress' } }])
  })
})