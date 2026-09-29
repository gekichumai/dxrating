import { Data, Effect } from 'effect'

export class DxdataDecodeError extends Data.TaggedError('DxdataDecodeError')<{
  readonly operation: string
  readonly cause: unknown
}> {}

import type { Context, Env } from 'hono'

const PRODUCTION_CHANNEL = 'production-v1'
const API_SCHEMA_VERSION = 1

export const DXDATA_PATH = '/api/v1/dxdata'
export const DXDATA_BROWSER_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=60, stale-if-error=86400'
export const DXDATA_CDN_CACHE_CONTROL = 'public, max-age=21600, stale-while-revalidate=86400, stale-if-error=604800'

export const DXDATA_CORS_OPTIONS = {
  origin: '*',
  allowHeaders: ['Content-Type', 'If-None-Match'],
  allowMethods: ['GET', 'HEAD', 'OPTIONS'],
  exposeHeaders: ['Content-Length', 'ETag', 'Cache-Control', 'CDN-Cache-Control', 'Cloudflare-CDN-Cache-Control'],
  maxAge: 86400,
}

interface PublishedDxdataMetadata {
  catalogRunId: string
  bodySha256: string
  byteLength: string
  contentType: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseMetadata = (value: unknown): PublishedDxdataMetadata => {
  if (
    !isRecord(value) ||
    typeof value.catalog_run_id !== 'string' ||
    !/^\d+$/.test(value.catalog_run_id) ||
    typeof value.body_sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.body_sha256) ||
    typeof value.byte_length !== 'string' ||
    !/^[1-9]\d*$/.test(value.byte_length) ||
    typeof value.content_type !== 'string' ||
    value.content_type.length === 0
  ) {
    throw new Error('Published DX data metadata is invalid')
  }

  return {
    catalogRunId: value.catalog_run_id,
    bodySha256: value.body_sha256,
    byteLength: value.byte_length,
    contentType: value.content_type,
  }
}

const parseBody = (value: unknown): string => {
  if (!isRecord(value) || typeof value.body_text !== 'string') {
    throw new Error('Published DX data body is invalid')
  }

  return value.body_text
}

export const createPostgresDxdataEffects = <E, R>(
  query: (text: string, values: unknown[]) => Effect.Effect<{ rows: unknown[] }, E, R>,
) => ({
  getPublishedMetadata: () =>
    Effect.gen(function* () {
      const result = yield* query(
        `
        SELECT
          publication.catalog_run_id::text AS catalog_run_id,
          snapshot.body_sha256,
          snapshot.byte_length::text AS byte_length,
          snapshot.content_type
        FROM dxdata.catalog_publications AS publication
        INNER JOIN dxdata.catalog_snapshots AS snapshot
          ON snapshot.catalog_run_id = publication.catalog_run_id
        INNER JOIN dxdata.catalog_build_runs AS catalog_run
          ON catalog_run.id = publication.catalog_run_id
        WHERE publication.channel = $1
          AND catalog_run.status = 'published'
          AND catalog_run.api_schema_version = $2
          AND snapshot.api_schema_version = $2
        LIMIT 1
      `,
        [PRODUCTION_CHANNEL, API_SCHEMA_VERSION],
      )

      const row = result.rows[0]
      return row === undefined
        ? undefined
        : yield* Effect.try({
            try: () => parseMetadata(row),
            catch: (cause) => new DxdataDecodeError({ operation: 'decode published catalog metadata', cause }),
          })
    }),

  getSnapshotBody: (catalogRunId: string, bodySha256: string) =>
    Effect.gen(function* () {
      const result = yield* query(
        `
        SELECT body_text
        FROM dxdata.catalog_snapshots
        WHERE catalog_run_id = $1::bigint
          AND body_sha256 = $2
          AND api_schema_version = $3
        LIMIT 1
      `,
        [catalogRunId, bodySha256, API_SCHEMA_VERSION],
      )

      const row = result.rows[0]
      return row === undefined
        ? undefined
        : yield* Effect.try({
            try: () => parseBody(row),
            catch: (cause) => new DxdataDecodeError({ operation: 'decode published catalog body', cause }),
          })
    }),
})

const weakEtagValue = (value: string) => (value.startsWith('W/') ? value.slice(2) : value)

export const ifNoneMatchMatches = (value: string | undefined, etag: string) =>
  value?.split(',').some((candidate) => {
    const trimmed = candidate.trim()
    return trimmed === '*' || weakEtagValue(trimmed) === etag
  }) === true

const successHeaders = (metadata: PublishedDxdataMetadata) =>
  new Headers({
    'Cache-Control': DXDATA_BROWSER_CACHE_CONTROL,
    'CDN-Cache-Control': DXDATA_CDN_CACHE_CONTROL,
    'Cloudflare-CDN-Cache-Control': DXDATA_CDN_CACHE_CONTROL,
    'Cache-Tag': 'dxdata',
    'Content-Length': metadata.byteLength,
    'Content-Type': metadata.contentType,
    ETag: `"${metadata.bodySha256}"`,
  })

const uncachedError = (c: Context, message: string, status: 500 | 503) => {
  c.header('Cache-Control', 'no-store')
  c.header('CDN-Cache-Control', 'no-store')
  c.header('Cloudflare-CDN-Cache-Control', 'no-store')
  return c.json({ error: message }, status)
}

export const createDxdataEffect =
  <E, R, H extends Env = Env>(
    store: {
      getPublishedMetadata: () => Effect.Effect<PublishedDxdataMetadata | undefined, E, R>
      getSnapshotBody: (catalogRunId: string, bodySha256: string) => Effect.Effect<string | undefined, E, R>
    },
    reportError: (error: unknown, context: Context<H>) => void = () => {},
  ) =>
  (c: Context<H>) =>
    Effect.gen(function* () {
      const metadata = yield* store.getPublishedMetadata()
      if (metadata === undefined || metadata === null) return uncachedError(c, 'DX data catalog is unavailable', 503)
      const headers = yield* Effect.try({
        try: () => successHeaders(metadata),
        catch: (cause) => new DxdataDecodeError({ operation: 'encode published catalog headers', cause }),
      })
      const etag = headers.get('ETag')!
      if (ifNoneMatchMatches(c.req.header('If-None-Match'), etag)) {
        return new Response(null, { status: 304, statusText: 'Not Modified', headers })
      }
      if (c.req.method === 'HEAD') return new Response(null, { status: 200, headers })
      const body = yield* store.getSnapshotBody(metadata.catalogRunId, metadata.bodySha256)
      if (body === undefined) return uncachedError(c, 'DX data catalog is unavailable', 503)
      return new Response(body, { status: 200, headers })
    }).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          try {
            reportError(error, c)
          } catch {
            /* Reporting must not replace a cache-safe endpoint failure. */
          }
          return uncachedError(c, 'Internal server error', 500)
        }),
      ),
    )