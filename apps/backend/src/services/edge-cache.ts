import { Data, Duration, Effect, Schedule } from 'effect'
import { HttpBody } from 'effect/http'
import { HttpClient } from './http-client'

export class EdgeCacheError extends Data.TaggedError('EdgeCacheError')<{
  readonly operation: string
  readonly cause: unknown
}> {}

/** The `Cache-Tag` values of the public responses the Cloudflare edge stores (see app.ts and services/dxdata.ts) */
export const EDGE_CACHE_TAGS = [
  'dxdata',
  'dxdata-v2',
  'dxdata-community',
  'arcade-venues',
  'tags',
  'aliases',
  'announcements',
  'og-image',
] as const

/** How often the publication pointer is compared with the one the edge was last told about */
export const EDGE_CACHE_CHECK_INTERVAL = Duration.seconds(60)

/**
 * `purge_cache` drops the stored objects, so the next request is a miss. `invalidate_cache` only marks them stale:
 * the edge keeps serving them (stale-while-revalidate) while it revalidates with the ETag.
 */
/** While checks keep failing, every this many failures is reported (about hourly at the default interval) */
export const FAILURE_REPORT_EVERY = 60

export type EdgeCacheAction = 'purge_cache' | 'invalidate_cache'

export interface EdgeCacheCredentials {
  readonly zoneId: string
  /** A Cloudflare API token with only the Zone → Cache Purge → Purge permission, on the dxrating.net zone */
  readonly token: string
}

/** Purges or invalidates the edge objects carrying any of the given cache tags */
export const requestEdgeCache = Effect.fn('EdgeCache.request')(function* (
  credentials: EdgeCacheCredentials,
  action: EdgeCacheAction,
  tags: readonly string[],
) {
  const http = yield* HttpClient
  const response = yield* http
    .post(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(credentials.zoneId)}/${action}`, {
      headers: { Authorization: `Bearer ${credentials.token}`, 'Content-Type': 'application/json' },
      body: HttpBody.jsonUnsafe({ tags }),
    })
    .pipe(Effect.mapError((cause) => new EdgeCacheError({ operation: `Request ${action}`, cause })))
  const body = yield* response.json.pipe(
    Effect.mapError((cause) => new EdgeCacheError({ operation: `Read ${action} response`, cause })),
  )
  const success = typeof body === 'object' && body !== null && 'success' in body && body.success === true
  if (response.status < 200 || response.status >= 300 || !success) {
    return yield* new EdgeCacheError({
      operation: `${action} ${tags.join(',')}`,
      cause: { status: response.status, body },
    })
  }
}, Effect.scoped)

/**
 * Keeps the Cloudflare edge in step with the origin, since nothing else tells it about a change:
 *
 * - At startup (a deploy), it purges every public tag, so header and encoding changes reach the edge at once instead
 *   of after the old objects' TTL. It first warms the catalog, which starts its Brotli compression; the edge refills
 *   with the identity body and picks up the Brotli one at its next revalidation.
 * - When the published catalog changes, it warms the new body and invalidates `dxdata` and `dxdata-v2`. The edge keeps serving the
 *   previous catalog while it fetches the new one.
 *
 * A failed step is retried at the next check, without stopping the watcher. The first failure of a streak is reported,
 * then one in {@link FAILURE_REPORT_EVERY}.
 */
export const watchEdgeCache = <E1, R1, E2, R2, E3, R3>(options: {
  readonly readPublishedSha256: Effect.Effect<string | undefined, E1, R1>
  readonly warmCatalog: Effect.Effect<void, E2, R2>
  readonly request: (action: EdgeCacheAction, tags: readonly string[]) => Effect.Effect<void, E3, R3>
  readonly reportError: (error: E1 | E2 | E3) => Effect.Effect<void>
  readonly interval?: Duration.Input
}) =>
  Effect.gen(function* () {
    let purgedAtStartup = false
    let announcedSha256: string | undefined
    // A lasting failure (a revoked token, the database down) is reported when it starts and then about hourly
    let failedChecks = 0
    const check = Effect.gen(function* () {
      const sha256 = yield* options.readPublishedSha256
      if (purgedAtStartup && (sha256 === undefined || sha256 === announcedSha256)) return
      yield* options.warmCatalog
      if (!purgedAtStartup) {
        yield* options.request('purge_cache', EDGE_CACHE_TAGS)
        purgedAtStartup = true
      } else {
        yield* options.request('invalidate_cache', ['dxdata', 'dxdata-v2'])
      }
      announcedSha256 = sha256
    }).pipe(
      Effect.tap(() => Effect.sync(() => void (failedChecks = 0))),
      Effect.catch((error) => (failedChecks++ % FAILURE_REPORT_EVERY === 0 ? options.reportError(error) : Effect.void)),
    )
    yield* Effect.repeat(check, Schedule.spaced(options.interval ?? EDGE_CACHE_CHECK_INTERVAL))
  })