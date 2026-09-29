import { Effect } from 'effect'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NetImportError, NetRequestError } from '../lib/functions/client.js'
import { v0Handler, v1Handler } from '../services/functions/fetch-net-records/index.js'

const { login } = vi.hoisted(() => ({ login: vi.fn<() => Effect.Effect<void, NetImportError | NetRequestError>>() }))
vi.mock('../lib/functions/client.js', async (original) => {
  const actual = await original<typeof import('../lib/functions/client.js')>()
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

beforeEach(() => login.mockReset().mockReturnValue(Effect.void))

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
})