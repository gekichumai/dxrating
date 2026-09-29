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