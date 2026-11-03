import { Clock, Data, Effect, Semaphore } from 'effect'
import type { PublishedDxdataMetadata } from '../dxdata'
import { PublishedDxdataCatalogSchema } from '../dxdata-openapi'
import { buildMcpCatalog, type McpCatalog } from './catalog'

export class McpCatalogError extends Data.TaggedError('McpCatalogError')<{
  readonly operation: string
  readonly cause: unknown
}> {}

/** How long the result of a check is served before the publication pointer is read again */
export const MCP_CATALOG_CHECK_INTERVAL_MS = 60_000

/**
 * Keeps the published catalog in memory for the MCP tools. The publication pointer (a small row) is read at most once
 * per check interval, and the body is read and indexed only when the pointer moved, one load at a time. A failed
 * check keeps serving the catalog loaded last, as the catalog is the same for everyone and a few minutes old is
 * better than none; before any catalog is loaded, it fails and the tools answer that the data is still loading, and a
 * check that found no catalog is not repeated before the interval either.
 */
export const createMcpCatalogLoader = <E, R>(
  store: {
    getPublishedMetadata: () => Effect.Effect<PublishedDxdataMetadata | undefined, E, R>
    getSnapshotBody: (catalogRunId: string, bodySha256: string) => Effect.Effect<string | undefined, E, R>
  },
  {
    checkIntervalMs = MCP_CATALOG_CHECK_INTERVAL_MS,
    reportError = () => {},
  }: { checkIntervalMs?: number; reportError?: (error: unknown) => void } = {},
) => {
  let loaded: { metadata: PublishedDxdataMetadata; catalog: McpCatalog } | undefined
  let checkedAt = Number.NEGATIVE_INFINITY
  // the body a check found invalid, which is not parsed again until the pointer moves
  let rejectedBodySha256: string | undefined
  const semaphore = Semaphore.makeUnsafe(1)

  const isFresh = (now: number) => now - checkedAt < checkIntervalMs
  const notLoaded = () =>
    new McpCatalogError({ operation: 'Load published catalog', cause: 'no published catalog is loaded' })
  // within the interval, the catalog checked last, or the failure of a check that found none: an outage before the
  // first load costs one check per interval, not one per request
  const lastChecked = Effect.suspend(() => (loaded ? Effect.succeed(loaded.catalog) : Effect.fail(notLoaded())))

  const check = Effect.gen(function* () {
    const metadata = yield* store.getPublishedMetadata()
    if (!metadata || metadata.bodySha256 === rejectedBodySha256) return loaded?.catalog
    if (loaded?.metadata.catalogRunId === metadata.catalogRunId && loaded.metadata.bodySha256 === metadata.bodySha256) {
      return loaded.catalog
    }
    const body = yield* store.getSnapshotBody(metadata.catalogRunId, metadata.bodySha256)
    // the pointer moved between the two reads: the next check reads it again
    if (body === undefined) return loaded?.catalog
    const catalog = yield* Effect.try({
      try: () => buildMcpCatalog(metadata.catalogRunId, PublishedDxdataCatalogSchema.parse(JSON.parse(body))),
      catch: (cause) => {
        rejectedBodySha256 = metadata.bodySha256
        return new McpCatalogError({ operation: 'Index published catalog', cause })
      },
    })
    loaded = { metadata, catalog }
    return catalog
  })

  const refresh = Effect.gen(function* () {
    // another caller may have refreshed while this one waited for the permit
    if (isFresh(yield* Clock.currentTimeMillis)) return yield* lastChecked
    yield* check.pipe(
      Effect.asVoid,
      Effect.catch((error) => Effect.sync(() => reportError(error))),
    )
    checkedAt = yield* Clock.currentTimeMillis
    return yield* lastChecked
  })

  return {
    /** The current catalog, or McpCatalogError before one is loaded */
    current: Effect.gen(function* () {
      if (isFresh(yield* Clock.currentTimeMillis)) return yield* lastChecked
      return yield* semaphore.withPermit(refresh)
    }),
  }
}