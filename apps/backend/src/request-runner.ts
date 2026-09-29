import { Effect, Exit, FiberSet, ManagedRuntime, Scope } from 'effect'

export class RequestRunnerClosedError extends Error {
  constructor() {
    super('Application is shutting down')
    this.name = 'RequestRunnerClosedError'
  }
}

/** Own foreign request entry points independently of the runtime's service scope. */
export const createRequestRunner = <R, ER>(runtime: ManagedRuntime.ManagedRuntime<R, ER>) => {
  const active = new Map<AbortController, Promise<unknown>>()
  const requestScope = Scope.makeUnsafe()
  const foreignFibers = Effect.runSync(FiberSet.make().pipe(Scope.provide(requestScope)))
  let accepting = true
  let shutdownPromise: Promise<void> | undefined

  // Official framework integrations execute their own fibers. Register those
  // fibers so shutdown also joins their masked operations and finalizers.
  const supervise = <A, E, R2>(effect: Effect.Effect<A, E, R2>): Effect.Effect<A, E, R2> =>
    Effect.withFiber((fiber) =>
      accepting ? FiberSet.add(foreignFibers, fiber).pipe(Effect.andThen(effect)) : Effect.interrupt,
    )

  const run = <A, E>(
    effect: Effect.Effect<A, E, R | Scope.Scope>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<A> => {
    if (!accepting) return Promise.reject(new RequestRunnerClosedError())

    const controller = new AbortController()
    const externalSignal = options?.signal
    const forwardAbort = () => controller.abort(externalSignal?.reason)
    if (externalSignal?.aborted === true) forwardAbort()
    else externalSignal?.addEventListener('abort', forwardAbort, { once: true })

    // Register before the runtime can execute user code or initiate a nested request.
    const pending = Promise.resolve().then(() =>
      runtime.runPromise(
        Effect.suspend(() => (!accepting || controller.signal.aborted ? Effect.interrupt : Effect.scoped(effect))),
        { signal: controller.signal },
      ),
    )
    active.set(controller, pending)
    const finished = () => {
      active.delete(controller)
      externalSignal?.removeEventListener('abort', forwardAbort)
    }
    void pending.then(finished, finished)
    return pending
  }

  const shutdown = (): Promise<void> => {
    accepting = false
    shutdownPromise ??= Promise.resolve().then(() => {
      for (const controller of active.keys()) controller.abort()
      // Interrupting a fiber waits for its finalizers and any masked SDK calls.
      // ManagedRuntime.dispose alone only closes layers; it does not join requests.
      const closeForeignRequests = Effect.runPromise(Scope.close(requestScope, Exit.void))
      return Promise.allSettled([...active.values(), closeForeignRequests]).then(() => runtime.dispose())
    })
    return shutdownPromise
  }

  return { run, supervise, shutdown }
}