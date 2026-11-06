import { initSentry, Sentry } from './lib/functions/sentry'
initSentry()

import './logger'
import { Effect } from 'effect'
import { runMain } from '@effect/platform-node/NodeRuntime'
import { app } from './app'
import { config } from './config'
import { serve } from './lifecycle'
import { appRuntime, shutdownApp } from './runtime'

runMain(
  Effect.scoped(
    Effect.gen(function* () {
      // Finalizers run in reverse: the HTTP listener drains (bounded by DRAIN_TIMEOUT_MS), then the runtime joins the
      // remaining requests and closes its services (database pools), then Sentry sends what it buffered.
      yield* Effect.addFinalizer(() => Effect.promise(() => Sentry.close(2000)))
      yield* Effect.addFinalizer(() => Effect.promise(shutdownApp))
      yield* appRuntime.contextEffect
      const server = yield* serve({ fetch: app.fetch, port: config.port })
      const address = server.address()
      yield* Effect.logInfo(`Server is running on port ${typeof address === 'object' ? address?.port : config.port}`)
      return yield* Effect.never
    }),
  ),
)