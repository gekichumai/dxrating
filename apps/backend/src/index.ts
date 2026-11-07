import { initSentry, Sentry } from './lib/functions/sentry'
initSentry()

import './logger'
import { Effect } from 'effect'
import { runMain } from '@effect/platform-node/NodeRuntime'
import { app, dxdataStore } from './app'
import { config } from './config'
import { serve } from './lifecycle'
import { appRuntime, runApp, shutdownApp } from './runtime'
import { cloudSaveCleanupLoop } from './services/cloud-save/cleanup'
import { API_CLIENT_HEADER } from './services/api-usage'
import { DXDATA_PATH } from './services/dxdata'
import { DXDATA_V2_PATH } from './services/dxdata-v2'
import { EdgeCacheError, requestEdgeCache, watchEdgeCache } from './services/edge-cache'
import { HttpClientLive } from './services/http-client'

runMain(
  Effect.scoped(
    Effect.gen(function* () {
      // Finalizers run in reverse: the HTTP listener drains (bounded by DRAIN_TIMEOUT_MS), then the runtime joins the
      // remaining requests and closes its services (database pools), then Sentry sends what it buffered.
      yield* Effect.addFinalizer(() => Effect.promise(() => Sentry.close(2000)))
      yield* Effect.addFinalizer(() => Effect.promise(shutdownApp))
      yield* appRuntime.contextEffect
      const server = yield* serve({ fetch: app.fetch, port: config.port })
      // The daily cloud save cleanup runs under the request runner, so shutdown interrupts it and waits for it to
      // roll back; it only runs while cloud save is not switched off.
      if (config.featureFlags.cloudSaveMode !== 'off') {
        void runApp(cloudSaveCleanupLoop).catch(() => undefined)
      }
      const address = server.address()
      yield* Effect.logInfo(`Server is running on port ${typeof address === 'object' ? address?.port : config.port}`)
      const edgeCache = config.edgeCache
      if (edgeCache) {
        const context = yield* appRuntime.contextEffect
        yield* Effect.forkScoped(
          watchEdgeCache({
            readPublishedSha256: Effect.map(dxdataStore.getPublishedMetadata(), (metadata) => metadata?.bodySha256),
            // The same requests the edge makes: they build the v2 catalog and start both Brotli compressions before
            // the edge refills
            warmCatalog: Effect.tryPromise({
              try: async () => {
                for (const path of [DXDATA_PATH, DXDATA_V2_PATH]) {
                  const response = await app.request(path, {
                    headers: { 'Accept-Encoding': 'gzip, br', [API_CLIENT_HEADER]: 'dxrating-edge-cache' },
                  })
                  await response.arrayBuffer()
                  if (response.status !== 200) throw new Error(`Catalog warm-up of ${path} answered ${response.status}`)
                }
              },
              catch: (cause) => new EdgeCacheError({ operation: 'Warm the catalog', cause }),
            }),
            request: (action, tags) =>
              requestEdgeCache(edgeCache, action, tags).pipe(
                // The entry point owns this client; it is not part of the request runtime
                // @effect-diagnostics-next-line strictEffectProvide:off
                Effect.provide(HttpClientLive),
              ),
            reportError: (error) =>
              Effect.sync(() => {
                Sentry.captureException(error, { tags: { component: 'edge-cache' } })
              }),
          }).pipe(Effect.provideContext(context)),
        )
      }
      return yield* Effect.never
    }),
  ),
)