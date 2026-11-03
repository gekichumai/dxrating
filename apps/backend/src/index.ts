import { initSentry } from './lib/functions/sentry'
initSentry()

import './logger'
import { Effect } from 'effect'
import { runMain } from '@effect/platform-node/NodeRuntime'
import { app } from './app'
import { config } from './config'
import { serve } from './lifecycle'
import { appRuntime, runApp, shutdownApp } from './runtime'
import { cloudSaveCleanupLoop, sweepAbandonedImportJobsAtStartup } from './services/cloud-save/cleanup'

runMain(
  Effect.scoped(
    Effect.gen(function* () {
      // Register the runtime first: the HTTP listener drains before its services close.
      yield* Effect.addFinalizer(() => Effect.promise(shutdownApp))
      yield* appRuntime.contextEffect
      const server = yield* serve({ fetch: app.fetch, port: config.port })
      // The daily cloud save cleanup runs under the request runner, so shutdown interrupts it and waits for it to
      // roll back; it only runs while cloud save is not switched off.
      if (config.featureFlags.cloudSaveMode !== 'off') {
        // Jobs a previous process left running are failed first (design §7.1); a failure only delays them to the
        // daily cleanup
        void runApp(sweepAbandonedImportJobsAtStartup)
          .catch(() => undefined)
          .then(() => runApp(cloudSaveCleanupLoop))
          .catch(() => undefined)
      }
      const address = server.address()
      yield* Effect.logInfo(`Server is running on port ${typeof address === 'object' ? address?.port : config.port}`)
      return yield* Effect.never
    }),
  ),
)