import { ORPCError } from '@orpc/server'
import { Context, Deferred, Effect, Exit, Fiber, Layer, ManagedRuntime } from 'effect'
import { describe, expect, it, vi } from '@effect/vitest'
import { createRequestRunner, RequestRunnerClosedError } from '../request-runner'

class Resource extends Context.Service<Resource, { readonly open: true }>()('test/RequestRunnerResource') {}

const resourceLayer = (events: string[]) =>
  Layer.effect(
    Resource,
    Effect.acquireRelease(Effect.succeed({ open: true as const }), () =>
      Effect.sync(() => {
        events.push('service closed')
      }),
    ),
  )

describe('supervised application requests', () => {
  it.effect('joins framework-owned fibers before disposing application services', () =>
    Effect.gen(function* () {
      const events: string[] = []
      const runtime = ManagedRuntime.make(resourceLayer(events))
      const runner = createRequestRunner(runtime)
      yield* Effect.promise(() => runtime.runPromise(Resource))
      const started = yield* Deferred.make<void>()
      const finishSdk = yield* Deferred.make<void>()
      const request = yield* Effect.forkChild(
        runner.supervise(
          Effect.scoped(
            Effect.gen(function* () {
              yield* Effect.acquireRelease(Deferred.succeed(started, undefined), () =>
                Effect.sync(() => {
                  events.push('framework request closed')
                }),
              )
              yield* Deferred.await(finishSdk).pipe(Effect.uninterruptible)
            }),
          ),
        ),
      )
      yield* Deferred.await(started)
      const stopped = runner.shutdown()
      yield* Effect.yieldNow
      yield* Deferred.succeed(finishSdk, undefined)
      yield* Effect.promise(() => stopped)
      expect(Exit.hasInterrupts(yield* Fiber.await(request))).toBe(true)
      expect(events).toEqual(['framework request closed', 'service closed'])
    }),
  )

  it.effect('does not dispatch a framework effect after shutdown', () =>
    Effect.gen(function* () {
      const runner = createRequestRunner(ManagedRuntime.make(Layer.empty))
      yield* Effect.promise(runner.shutdown)
      const execute = vi.fn()
      const exit = yield* Effect.exit(runner.supervise(Effect.sync(execute)))
      expect(Exit.hasInterrupts(exit)).toBe(true)
      expect(execute).not.toHaveBeenCalled()
    }),
  )

  it('joins masked SDK work and request finalizers before closing services', async () => {
    const events: string[] = []
    const started = await Effect.runPromise(Deferred.make<void>())
    const finishSdk = await Effect.runPromise(Deferred.make<void>())
    const runtime = ManagedRuntime.make(resourceLayer(events))
    const dispose = vi.spyOn(runtime, 'dispose')
    const runner = createRequestRunner(runtime)
    const response = runner.run(
      Effect.gen(function* () {
        yield* Resource
        yield* Effect.acquireRelease(Deferred.succeed(started, undefined), () =>
          Effect.sync(() => {
            events.push('request closed')
          }),
        )
        yield* Effect.gen(function* () {
          yield* Deferred.await(finishSdk)
          events.push('SDK finished')
        }).pipe(Effect.uninterruptible)
      }),
    )
    const settled = Promise.allSettled([response])
    await Effect.runPromise(Deferred.await(started))

    const stopped = runner.shutdown()
    expect(runner.shutdown()).toBe(stopped)
    await expect(runner.run(Effect.void)).rejects.toBeInstanceOf(RequestRunnerClosedError)
    expect(dispose).not.toHaveBeenCalled()
    expect(events).toEqual([])

    await Effect.runPromise(Deferred.succeed(finishSdk, undefined))
    await settled
    await stopped
    expect(events).toEqual(['SDK finished', 'request closed', 'service closed'])
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('interrupts every active request before service disposal', async () => {
    const events: string[] = []
    const runtime = ManagedRuntime.make(resourceLayer(events))
    const runner = createRequestRunner(runtime)
    const started = await Effect.runPromise(Deferred.make<void>())
    let running = 0
    const request = (name: string) =>
      Effect.gen(function* () {
        yield* Resource
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            running += 1
          }),
          () =>
            Effect.sync(() => {
              events.push(name)
            }),
        )
        if (running === 2) yield* Deferred.succeed(started, undefined)
        return yield* Effect.never
      })
    const responses = Promise.allSettled([runner.run(request('first')), runner.run(request('second'))])
    await Effect.runPromise(Deferred.await(started))
    await runner.shutdown()

    expect((await responses).every((response) => response.status === 'rejected')).toBe(true)
    expect(events.slice(0, 2).toSorted()).toEqual(['first', 'second'])
    expect(events[2]).toBe('service closed')
  })

  it('preserves framework failures and removes external signal listeners on completion', async () => {
    const runner = createRequestRunner(ManagedRuntime.make(Layer.empty))
    const controller = new AbortController()
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener')
    const failure = new ORPCError('BAD_REQUEST')
    try {
      await expect(
        runner.run(Effect.fail(failure), {
          signal: controller.signal,
        }),
      ).rejects.toBe(failure)
      expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function))
      await expect(runner.run(Effect.succeed('next request'))).resolves.toBe('next request')
    } finally {
      await runner.shutdown()
    }
  })

  it('preserves unexpected defect identity at the native Promise boundary', async () => {
    const runner = createRequestRunner(ManagedRuntime.make(Layer.empty))
    const defect = new Error('Unexpected application defect')
    try {
      const failure = await runner.run(Effect.die(defect)).catch((error: unknown) => error)
      expect(failure).toBe(defect)
    } finally {
      await runner.shutdown()
    }
  })

  it('propagates caller cancellation and completes request cleanup', async () => {
    const runner = createRequestRunner(ManagedRuntime.make(Layer.empty))
    const controller = new AbortController()
    const started = await Effect.runPromise(Deferred.make<void>())
    const cleaned = vi.fn()
    const response = runner.run(
      Effect.gen(function* () {
        yield* Effect.acquireRelease(Deferred.succeed(started, undefined), () => Effect.sync(cleaned))
        return yield* Effect.never
      }),
      { signal: controller.signal },
    )
    const settled = Promise.allSettled([response])
    try {
      await Effect.runPromise(Deferred.await(started))
      controller.abort()
      expect((await settled)[0].status).toBe('rejected')
      expect(cleaned).toHaveBeenCalledOnce()
    } finally {
      await runner.shutdown()
    }
  })

  it('never starts application work if aborted or shut down before dispatch', async () => {
    const runner = createRequestRunner(ManagedRuntime.make(Layer.empty))
    const execute = vi.fn()
    const controller = new AbortController()
    controller.abort()
    const aborted = runner.run(Effect.sync(execute), { signal: controller.signal })
    const scheduled = runner.run(Effect.sync(execute))
    const settled = Promise.allSettled([aborted, scheduled])
    const stopped = runner.shutdown()
    await stopped
    expect((await settled).every((response) => response.status === 'rejected')).toBe(true)
    expect(execute).not.toHaveBeenCalled()
  })
})