import { Effect, Either, ManagedRuntime, type Scope } from 'effect'

export class RequestRunnerClosedError extends Error {
  constructor() {
    super('Application is shutting down')
    this.name = 'RequestRunnerClosedError'
  }
}

/** Own foreign request entry points independently of the runtime's service scope. */
export const createRequestRunner = <R, ER>(runtime: ManagedRuntime.ManagedRuntime<R, ER>) => {
  const active = new Map<AbortController, Promise<unknown>>()
  let accepting = true
  let shutdownPromise: Promise<void> | undefined

  const run = <A, E>(
    effect: Effect.Effect<A, E, R | Scope.Scope>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<A> => {
    if (!accepting) return Promise.reject(new RequestRunnerClosedError())

    const controller = new AbortController()
    const externalSignal = options?.signal
    const forwardAbort = () => controller.abort(externalSignal?.reason)
    if (externalSignal?.aborted) forwardAbort()
    else externalSignal?.addEventListener('abort', forwardAbort, { once: true })

    // Register before the runtime can execute user code or initiate a nested request.
    const pending = Promise.resolve()
      .then(() =>
        runtime.runPromise(
          Effect.either(
            Effect.suspend(() => (!accepting || controller.signal.aborted ? Effect.interrupt : Effect.scoped(effect))),
          ),
          { signal: controller.signal },
        ),
      )
      .then(Either.getOrThrowWith((error) => error))
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
      return Promise.allSettled(active.values()).then(() => runtime.dispose())
    })
    return shutdownPromise
  }

  return { run, shutdown }
}