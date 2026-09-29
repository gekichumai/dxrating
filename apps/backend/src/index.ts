import { initSentry } from './lib/functions/sentry.js'
initSentry()

import './logger.js'
import { Effect } from 'effect'
import { runMain } from '@effect/platform-node/NodeRuntime'
import { app } from './app.js'
import { config } from './config.js'
import { serve } from './lifecycle.js'
import { appRuntime, shutdownApp } from './runtime.js'

runMain(
  Effect.scoped(
    Effect.gen(function* () {
      // Register the runtime first: the HTTP listener drains before its services close.
      yield* Effect.addFinalizer(() => Effect.promise(shutdownApp))
      yield* appRuntime.runtimeEffect
      const server = yield* serve({ fetch: app.fetch, port: config.port })
      const address = server.address()
      yield* Effect.logInfo(`Server is running on port ${typeof address === 'object' ? address?.port : config.port}`)
      return yield* Effect.never
    }),
  ),
)