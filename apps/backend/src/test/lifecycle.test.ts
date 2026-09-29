import { Cause, Deferred, Effect, Exit, Fiber, Option } from 'effect'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { serve, ServerError } from '../lifecycle'

const getTcpPort = (address: AddressInfo | string | null) => {
  expect.assert(address !== null && typeof address === 'object')
  return address.port
}

describe('Effect HTTP server lifetime', () => {
  it('serves HTTP requests and releases the listener when its scope closes', async () => {
    let port = 0
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const server = yield* serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('healthy') })
          port = getTcpPort(server.address())
          const response = yield* Effect.promise(() => fetch(`http://127.0.0.1:${port}`))
          expect(response.status).toBe(200)
          expect(yield* Effect.promise(() => response.text())).toBe('healthy')
        }),
      ),
    )

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const replacement = yield* serve({ hostname: '127.0.0.1', port, fetch: () => new Response('replacement') })
          expect(getTcpPort(replacement.address())).toBe(port)
        }),
      ),
    )
  })

  it('reports bind failures without disturbing the owner and permits a subsequent bind', async () => {
    const owner = createServer((_req, res) => res.end('original owner'))
    await new Promise<void>((resolve) => owner.listen(0, '127.0.0.1', resolve))
    const port = getTcpPort(owner.address())
    try {
      const exit = await Effect.runPromiseExit(
        Effect.scoped(
          serve({
            hostname: '127.0.0.1',
            port,
            fetch: () => new Response('unexpected'),
          }),
        ),
      )
      expect(Exit.isFailure(exit)).toBe(true)
      if (!Exit.isFailure(exit)) throw new Error('Expected address-in-use failure')
      const failure = Option.getOrThrow(Cause.findErrorOption(exit.cause))
      expect(failure).toBeInstanceOf(ServerError)
      expect(failure.cause).toMatchObject({ code: 'EADDRINUSE' })
      expect(await (await fetch(`http://127.0.0.1:${port}`)).text()).toBe('original owner')
    } finally {
      await new Promise<void>((resolve, reject) =>
        owner.close((error) => (error !== undefined && error !== null ? reject(error) : resolve())),
      )
    }

    await Effect.runPromise(Effect.scoped(serve({ hostname: '127.0.0.1', port, fetch: () => new Response('rebound') })))
  })

  it('drains an in-flight HTTP request before completing interrupted server cleanup', async () => {
    let reportStarted!: () => void
    const started = new Promise<void>((resolve) => {
      reportStarted = resolve
    })
    const port = await Effect.runPromise(Deferred.make<number>())
    let finishRequest!: () => void
    const requestGate = new Promise<void>((resolve) => {
      finishRequest = resolve
    })
    const fiber = Effect.runFork(
      Effect.scoped(
        Effect.gen(function* () {
          const server = yield* serve({
            hostname: '127.0.0.1',
            port: 0,
            fetch: async () => {
              reportStarted()
              await requestGate
              return new Response('drained')
            },
          })
          yield* Deferred.succeed(port, getTcpPort(server.address()))
          return yield* Effect.never
        }),
      ),
    )
    const address = await Effect.runPromise(Deferred.await(port))
    const response = fetch(`http://127.0.0.1:${address}`)
    await started
    const shutdown = Effect.runPromise(Fiber.interrupt(fiber))
    finishRequest()

    expect(await (await response).text()).toBe('drained')
    await shutdown
    expect(Exit.hasInterrupts(await Effect.runPromise(Fiber.await(fiber)))).toBe(true)
    await Effect.runPromise(
      Effect.scoped(serve({ hostname: '127.0.0.1', port: address, fetch: () => new Response('rebound') })),
    )
  })
})