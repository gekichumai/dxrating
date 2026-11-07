import { createHash } from 'node:crypto'
import type { CatalogAlias, CatalogTag, CatalogTagGroup, CatalogTagSong } from '@gekichumai/dxdata'
import { toV2Community } from '@gekichumai/dxdata/v2'
import { Data, Deferred, Effect } from 'effect'
import type { Context, Env } from 'hono'
import { ifNoneMatchMatches } from './dxdata'

export class CommunityOverlayError extends Data.TaggedError('CommunityOverlayError')<{
  readonly operation: string
  readonly cause: unknown
}> {}

/** The v2 community overlay (gekichumai/meta#43): tags and aliases by public ID, visible associations only */
export const DXDATA_V2_COMMUNITY_PATH = '/api/v2/dxdata/community'
export const DXDATA_V2_COMMUNITY_CACHE_TAG = 'dxdata-community'

// The same policy as the v1 tag and alias lists (app.ts): browsers always revalidate, the edge keeps a copy for a
// minute and revalidates it in the background, so a new tag or alias reaches everyone within a few minutes
export const COMMUNITY_BROWSER_CACHE_CONTROL = 'public, no-cache'
export const COMMUNITY_CDN_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300, stale-if-error=86400'

/** How long a built overlay is reused before the lists are read again; mutations clear only the lists' own caches */
export const COMMUNITY_REUSE_MS = 10_000

export interface CommunityLists {
  readonly tags: {
    tagGroups: CatalogTagGroup[]
    tags: CatalogTag[]
    tagSongs: (Pick<CatalogTagSong, 'tag_id'> & Partial<CatalogTagSong>)[]
  }
  readonly aliases: CatalogAlias[]
}

/**
 * Serves the overlay built from the public v1 tag and alias lists (`?idScheme=public`), so it applies exactly their
 * rules, such as the tag-vote threshold, and keeps out what they keep out, such as the scores. It is rebuilt at most
 * once per {@link COMMUNITY_REUSE_MS}; its ETag is the sha256 of its body.
 */
export const createCommunityOverlayHandler = <E, R, H extends Env = Env>(
  readLists: Effect.Effect<CommunityLists, E, R>,
  reportError: (error: unknown, context: Context<H>) => void,
  now: () => number = Date.now,
) => {
  type Built = { at: number; body: string; etag: string }
  let built: Built | undefined
  // The rebuild in progress, shared by every request that arrives meanwhile: one pair of list reads, not one per request
  let building: Deferred.Deferred<Built, E | CommunityOverlayError> | undefined

  const rebuild = Effect.gen(function* () {
    const lists = yield* readLists
    const body = yield* Effect.try({
      try: () => JSON.stringify(toV2Community(lists.tags, lists.aliases)),
      catch: (cause) => new CommunityOverlayError({ operation: 'build the community overlay', cause }),
    })
    built = { at: now(), body, etag: `"${createHash('sha256').update(body).digest('hex')}"` }
    return built
  })

  const overlay = Effect.gen(function* () {
    if (built && now() - built.at < COMMUNITY_REUSE_MS) return built
    if (building) return yield* Deferred.await(building)
    const result = yield* Deferred.make<Built, E | CommunityOverlayError>()
    building = result
    // Finishes even if the request that started it goes away, so the others waiting on it are answered; a failure
    // reaches them all, and the next request rebuilds
    return yield* rebuild.pipe(
      Effect.onExit((exit) =>
        Effect.gen(function* () {
          yield* Deferred.done(result, exit)
          if (building === result) building = undefined
        }),
      ),
      Effect.uninterruptible,
    )
  })

  return (c: Context<H>) =>
    Effect.gen(function* () {
      const { body, etag } = yield* overlay
      const headers = new Headers({
        'Cache-Control': COMMUNITY_BROWSER_CACHE_CONTROL,
        'CDN-Cache-Control': COMMUNITY_CDN_CACHE_CONTROL,
        'Cloudflare-CDN-Cache-Control': COMMUNITY_CDN_CACHE_CONTROL,
        'Cache-Tag': DXDATA_V2_COMMUNITY_CACHE_TAG,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body).toString(),
        ETag: etag,
      })
      if (ifNoneMatchMatches(c.req.header('If-None-Match'), etag)) {
        return new Response(null, { status: 304, statusText: 'Not Modified', headers })
      }
      return new Response(c.req.method === 'HEAD' ? null : body, { status: 200, headers })
    }).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          try {
            reportError(error, c)
          } catch {
            /* Reporting must not replace a cache-safe endpoint failure. */
          }
          c.header('Cache-Control', 'no-store')
          c.header('CDN-Cache-Control', 'no-store')
          c.header('Cloudflare-CDN-Cache-Control', 'no-store')
          return c.json({ error: 'Community data is unavailable' }, 503)
        }),
      ),
    )
}

/** Reads the public v1 lists through the app itself, with every rule and cache their routes apply */
export const readListsThrough = (request: (path: string) => Response | Promise<Response>) =>
  Effect.gen(function* () {
    const read = (path: string) =>
      Effect.tryPromise({
        try: async () => {
          const response = await request(path)
          if (response.status !== 200) {
            await response.body?.cancel()
            throw new Error(`${path} answered ${response.status}`)
          }
          return (await response.json()) as unknown
        },
        catch: (cause) => new CommunityOverlayError({ operation: `read ${path}`, cause }),
      })
    const [tags, aliases] = yield* Effect.all(
      [read('/api/v1/tags?idScheme=public'), read('/api/v1/aliases?idScheme=public')],
      {
        concurrency: 2,
      },
    )
    return { tags, aliases } as CommunityLists
  })