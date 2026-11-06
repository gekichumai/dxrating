// Requests that end because the client left or the server is shutting down are expected and not reported to Sentry;
// any other interruption still is (DXRATING-BACKEND-1X).
import { Effect, Exit, Layer, ManagedRuntime, Scope } from 'effect'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }))
vi.mock('@sentry/node', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sentry/node')>()
  return { ...original, captureException }
})

import { app } from '../app'
import { isDraining, refuseWhileDraining, serve } from '../lifecycle'
import {
  ClientClosedRequestError,
  createRequestRunner,
  isExpectedRequestEnd,
  RequestRunnerClosedError,
} from '../request-runner'

describe('request runner endings', () => {
  const runner = () => createRequestRunner(ManagedRuntime.make(Layer.empty))

  it('a client that closes the connection ends the request with ClientClosedRequestError', async () => {
    const controller = new AbortController()
    const pending = runner().run(Effect.never, { signal: controller.signal })
    setTimeout(() => controller.abort('Client connection prematurely closed.'), 10)
    const error = await pending.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ClientClosedRequestError)
    expect(isExpectedRequestEnd(error)).toBe(true)
  })

  it('shutdown ends in-flight requests with RequestRunnerClosedError', async () => {
    const requests = runner()
    const pending = requests.run(Effect.never)
    await new Promise((resolve) => setTimeout(resolve, 10))
    void requests.shutdown()
    const error = await pending.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RequestRunnerClosedError)
    expect(isExpectedRequestEnd(error)).toBe(true)
  })

  it('any other interruption stays an unexpected error', async () => {
    const error = await runner()
      .run(Effect.interrupt)
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(isExpectedRequestEnd(error)).toBe(false)
  })

  it('failures keep their original error', async () => {
    const failure = new Error('synthetic failure')
    await expect(runner().run(Effect.fail(failure))).rejects.toBe(failure)
  })
})

describe('app error reporting', () => {
  const realFetch = globalThis.fetch

  beforeEach(() => {
    captureException.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not report a Sentry tunnel request whose client went away mid-forward', async () => {
    let upstreamCalled!: () => void
    const upstream = new Promise<void>((resolve) => (upstreamCalled = resolve))
    // The upstream Sentry ingest hangs until the request is interrupted
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input instanceof Request ? input.url : input).includes('ingest')) {
        upstreamCalled()
        return new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
        )
      }
      return realFetch(input, init)
    })
    const client = new AbortController()
    const envelope = `${JSON.stringify({ dsn: 'https://key@o4506648698683392.ingest.us.sentry.io/4511398317064192' })}\n{}`
    const response = app.request('/api/v1/monitoring/tunnel', { method: 'POST', body: envelope, signal: client.signal })
    await upstream
    client.abort('Client connection prematurely closed.')

    expect((await response).status).toBe(499)
    expect(captureException).not.toHaveBeenCalled()
  })
})

describe('draining', () => {
  it('refuses new requests with 503 while an in-flight request finishes', async () => {
    let finishSlow!: () => void
    const slowGate = new Promise<void>((resolve) => (finishSlow = resolve))
    const drainApp = new Hono()
    drainApp.use('*', refuseWhileDraining)
    drainApp.get('/health', (c) => c.json({ status: 'ok' }))
    drainApp.get('/slow', async (c) => {
      await slowGate
      return c.text('completed')
    })

    const scope = Scope.makeUnsafe()
    const server = await Effect.runPromise(
      serve({ fetch: drainApp.fetch, hostname: '127.0.0.1', port: 0 }).pipe(Scope.provide(scope)),
    )
    const { port } = server.address() as import('node:net').AddressInfo
    const slow = fetch(`http://127.0.0.1:${port}/slow`)
    await new Promise((resolve) => setTimeout(resolve, 50))

    const closing = Effect.runPromise(Scope.close(scope, Exit.void))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(isDraining()).toBe(true)
    // A request reaching the app now (say, on a connection the proxy kept alive) is refused, and readiness fails
    const refused = await drainApp.request('/health')
    expect(refused.status).toBe(503)
    expect(refused.headers.get('connection')).toBe('close')

    finishSlow()
    expect(await (await slow).text()).toBe('completed')
    await closing
  })
})