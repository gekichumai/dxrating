import { Effect } from 'effect'
import { Response } from 'undici'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NetImportError, withMaimaiNETClient } from '../lib/functions/client'

const runTest = <A, E>(effect: Effect.Effect<A, E>, options?: { signal?: AbortSignal }) =>
  Effect.runPromise(effect, options)

const { request, destroy } = vi.hoisted(() => ({ request: vi.fn(), destroy: vi.fn() }))
vi.mock('undici', async (original) => ({
  ...(await original<typeof import('undici')>()),
  fetch: request,
  Agent: class {
    destroy = destroy
  },
}))

beforeEach(() => {
  request.mockReset()
  destroy.mockReset().mockResolvedValue(undefined)
})

describe('scoped NET imports', () => {
  it('aborts an in-flight request and destroys its dispatcher on interruption', async () => {
    let signal: AbortSignal | undefined
    let announceStart!: () => void
    const started = new Promise<void>((resolve) => {
      announceStart = resolve
    })
    request.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          signal = init.signal
          signal?.addEventListener('abort', () => reject(signal?.reason), { once: true })
          announceStart()
        }),
    )
    const controller = new AbortController()
    const result = runTest(
      withMaimaiNETClient('intl', (client) => client.fetchEffect('https://example.test/')),
      { signal: controller.signal },
    )
    const failure = expect(result).rejects.toBeDefined()
    await started
    expect(signal?.aborted).toBe(false)
    controller.abort()
    await failure
    expect(signal?.aborted).toBe(true)
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('releases connections while preserving a typed import failure', async () => {
    request.mockResolvedValue(new Response(null, { status: 200 }))
    const error = new NetImportError('INVALID_CREDENTIALS')
    const result = runTest(
      withMaimaiNETClient('jp', (client) =>
        Effect.gen(function* () {
          yield* client.fetchEffect('https://example.test/')
          return yield* Effect.fail(error)
        }),
      ),
    )
    await expect(result).rejects.toBe(error)
    expect(destroy).toHaveBeenCalledOnce()
  })
})

describe.each(['jp', 'intl'] as const)('%s NET record retries', (region) => {
  const base = region === 'jp' ? 'https://maimaidx.jp' : 'https://maimaidx-eng.com'
  const errorPage = `${base}/maimai-mobile/error/`
  const redirect = () =>
    new Response(null, {
      status: 302,
      headers: { location: errorPage },
    })
  // after a redirect to the error page the client reads it once, for its ERROR CODE (DXRATING-BACKEND-1W)
  const errorPageResponse = () => new Response('<html><body><div>ERROR CODE：100001</div></body></html>')
  const requestedURLs = () => request.mock.calls.map(([url]) => url as string)
  const recordRequests = () => requestedURLs().filter((url) => url !== errorPage)
  const errorPageRequests = () => requestedURLs().filter((url) => url === errorPage)

  it('retries only the rejected difficulty and completes the remaining pages', async () => {
    let remasterAttempts = 0
    request.mockImplementation(async (url: string) => {
      if (url === errorPage) return errorPageResponse()
      if (new URL(url).searchParams.get('diff') === '4' && ++remasterAttempts < 3) return redirect()
      return new Response('<html><body></body></html>')
    })
    const progress = vi.fn()
    await expect(
      runTest(withMaimaiNETClient(region, (client) => client.fetchMusicRecordsEffect(), progress)),
    ).resolves.toEqual([])
    expect(errorPageRequests()).toHaveLength(2)
    expect(recordRequests().map((url) => new URL(url).searchParams.get('diff'))).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '4',
      '4',
      '10',
    ])
    expect(progress.mock.calls.flat()).toEqual([
      'fetch:music:in-progress:basic',
      'fetch:music:in-progress:advanced',
      'fetch:music:in-progress:expert',
      'fetch:music:in-progress:master',
      'fetch:music:in-progress:remaster',
      'fetch:music:in-progress:utage',
      'fetch:music:completed',
    ])
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('preserves the failure after three attempts without publishing completion', async () => {
    request.mockImplementation(async (url: string) => (url === errorPage ? errorPageResponse() : redirect()))
    const progress = vi.fn()
    await expect(
      runTest(withMaimaiNETClient(region, (client) => client.fetchMusicRecordsEffect(), progress)),
    ).rejects.toMatchObject({ code: 'UNKNOWN_ERROR', step: 'record_music_basic', netErrorCode: '100001' })
    expect(recordRequests()).toHaveLength(3)
    expect(errorPageRequests()).toHaveLength(3)
    expect(progress).not.toHaveBeenCalled()
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('also recovers a rejected recent-record page', async () => {
    let attempts = 0
    request.mockImplementation(async (url: string) => {
      if (url === errorPage) return errorPageResponse()
      return ++attempts === 1 ? redirect() : new Response('<html><body></body></html>')
    })
    await expect(runTest(withMaimaiNETClient(region, (client) => client.fetchRecentRecordsEffect()))).resolves.toEqual(
      [],
    )
    expect(recordRequests()).toHaveLength(2)
    expect(errorPageRequests()).toHaveLength(1)
  })

  it('does not retry maintenance responses', async () => {
    request.mockResolvedValue(new Response('<html>Sorry, servers are under maintenance.</html>'))
    await expect(
      runTest(withMaimaiNETClient(region, (client) => client.fetchRecentRecordsEffect())),
    ).rejects.toMatchObject({ code: 'NET_MAINTENANCE' })
    expect(request).toHaveBeenCalledOnce()
  })

  it('stops during retry backoff when the caller disconnects', async () => {
    const controller = new AbortController()
    const released = Promise.withResolvers<void>()
    // A body lets the test observe when the rejected response has been released.
    request.mockImplementation(async () => {
      const response = new Response('redirect', { status: 302, headers: { location: `${base}/maimai-mobile/error/` } })
      vi.spyOn(response.body!, 'cancel').mockImplementation(async () => {
        released.resolve()
      })
      return response
    })
    const result = runTest(
      withMaimaiNETClient(region, (client) => client.fetchRecentRecordsEffect()),
      { signal: controller.signal },
    )
    const failure = expect(result).rejects.toBeDefined()
    await released.promise
    controller.abort()
    await failure
    expect(request).toHaveBeenCalledOnce()
    expect(destroy).toHaveBeenCalledOnce()
  })
})