import { CLOUD_SAVE_NET_IMPORT_ROUTE, type ImportResultDTO } from '@gekichumai/api-contract'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudImportHttpError, importInProgressJobId, isRetryableImportError } from '../cloudImports'
import { type NetImportRequest, type NetImportStreamEvent, netImportUrl, streamNetImport } from '../cloudNetImport'

/**
 * The real SSE adapter over the real `fetchEventSource`: only `fetch` is replaced, answering with the bytes the
 * route would send.
 */

const REQUEST: NetImportRequest = {
  saveId: 'dsav_one',
  body: { idempotencyKey: 'auto-net-dsav_one-1', trigger: 'auto', region: 'jp', id: 'sega', password: 'pw' },
}

const RESULT: ImportResultDTO = {
  job: {
    id: 'dimp_job1',
    saveId: 'dsav_one',
    source: 'maimai-net-jp',
    fetchedBy: 'server',
    trigger: 'auto',
    sourceAccountId: null,
    sourceAccountKind: null,
    status: 'succeeded',
    startedAt: '2026-11-03T00:00:00.000Z',
    fetchedAt: '2026-11-03T00:00:01.000Z',
    finishedAt: '2026-11-03T00:00:02.000Z',
    rawPayloadSha256: null,
    counts: {
      fetched: 1,
      inserted: 1,
      improved: 0,
      provenanceUpgraded: 0,
      unchanged: 0,
      keptUserEdit: 0,
      skippedDeleted: 0,
      skippedUnknownSheet: 0,
      rejected: 0,
    },
    errorCode: null,
  },
  revision: 7,
}

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function collect(): Promise<NetImportStreamEvent[]> {
  const events: NetImportStreamEvent[] = []
  for await (const event of streamNetImport(REQUEST)) events.push(event)
  return events
}

describe('netImportUrl', () => {
  it('builds the contract route with the save ID encoded', () => {
    expect(netImportUrl('dsav_one', 'https://api.example')).toBe(
      'https://api.example/api/v1/saves/dsav_one/imports/maimai-net',
    )
    expect(netImportUrl('dsav_a/b', '')).toBe(CLOUD_SAVE_NET_IMPORT_ROUTE.path.replace('{id}', 'dsav_a%2Fb'))
  })
})

describe('streamNetImport', () => {
  it('POSTs the body with the session cookie and yields progress, then done, then ends', async () => {
    fetchMock.mockResolvedValue(
      streamResponse([
        sse('progress', { state: 'auth:in-progress' }),
        sse('progress', { state: 'fetch' }),
        sse('done', RESULT),
      ]),
    )

    const events = await collect()

    expect(events).toEqual([
      { type: 'progress', state: 'auth:in-progress' },
      { type: 'progress', state: 'fetch' },
      { type: 'done', result: RESULT },
    ])
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/api/v1/saves/dsav_one/imports/maimai-net')
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', body: JSON.stringify(REQUEST.body) })
  })

  it('names the account the import is for in X-DXRating-Expected-User', async () => {
    fetchMock.mockResolvedValue(streamResponse([sse('done', RESULT)]))
    const events: NetImportStreamEvent[] = []
    for await (const event of streamNetImport({ ...REQUEST, expectedUserId: 'user-a' })) events.push(event)
    expect(events).toEqual([{ type: 'done', result: RESULT }])
    const [, init] = fetchMock.mock.calls[0]!
    expect(new Headers(init?.headers).get('X-DXRating-Expected-User')).toBe('user-a')
  })

  it('yields the error event as the last event', async () => {
    fetchMock.mockResolvedValue(
      streamResponse([sse('error', { code: 'INVALID_CREDENTIALS', message: 'Wrong password', jobId: 'dimp_job1' })]),
    )

    expect(await collect()).toEqual([
      { type: 'error', code: 'INVALID_CREDENTIALS', message: 'Wrong password', jobId: 'dimp_job1' },
    ])
  })

  it('reads a 409 without a stream as a CloudImportHttpError naming the running job', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'CONFLICT',
          message: 'busy',
          data: { reason: 'IMPORT_IN_PROGRESS', jobId: 'dimp_run' },
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const error = await collect().then(
      () => null,
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(CloudImportHttpError)
    expect(error).toMatchObject({ status: 409, code: 'CONFLICT' })
    expect(importInProgressJobId(error)).toBe('dimp_run')
    // Not sent again by fetchEventSource itself
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reads a 503 as retryable and a 400 as final', async () => {
    fetchMock.mockResolvedValueOnce(new Response('down', { status: 503 }))
    const unavailable = await collect().catch((caught: unknown) => caught)
    expect(unavailable).toMatchObject({ status: 503 })
    expect(isRetryableImportError(unavailable).retry).toBe(true)

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'BAD_REQUEST' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const invalid = await collect().catch((caught: unknown) => caught)
    expect(invalid).toMatchObject({ status: 400, code: 'BAD_REQUEST' })
    expect(isRetryableImportError(invalid).retry).toBe(false)
  })

  it('throws a retryable TypeError when the stream closes before done', async () => {
    fetchMock.mockResolvedValue(streamResponse([sse('progress', { state: 'fetch' })]))

    const events: NetImportStreamEvent[] = []
    const error = await (async () => {
      for await (const event of streamNetImport(REQUEST)) events.push(event)
    })().catch((caught: unknown) => caught)

    expect(events).toEqual([{ type: 'progress', state: 'fetch' }])
    expect(error).toBeInstanceOf(TypeError)
    expect(isRetryableImportError(error).retry).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws on an event that does not match the contract', async () => {
    fetchMock.mockResolvedValue(streamResponse([sse('done', { job: { id: 'not-a-job' } })]))

    const error = await collect().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(TypeError)
    expect(isRetryableImportError(error).retry).toBe(false)
  })

  it('treats a 200 that is not an event stream as a failed request', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }))

    const error = await collect().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(CloudImportHttpError)
    expect(error).toMatchObject({ status: 200 })
  })
})