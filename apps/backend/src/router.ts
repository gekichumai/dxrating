import * as Sentry from '@sentry/node'
import { ORPCError, implement } from '@orpc/server'
import { appContract } from './contract'
import { Database } from './db/index'
import { Clock, Data, Duration, Effect } from 'effect'
import { runApp } from './runtime'
import { ApplicationCache } from './services/cache'
import { HttpClient } from './services/http-client'
import {
  tags,
  tagGroups,
  tagSongs,
  comments,
  commentReports,
  userBlocks,
  profiles,
  songAliases,
  arcadeGames,
  arcadeChains,
  arcadeVenues,
  arcadeInstallationIdentities,
  arcadeInstallations,
} from './db/schema'
import { eq, and, desc, asc, exists, gte, ilike, inArray, isNull, lte, notExists, or, sql, type SQL } from 'drizzle-orm'
import type { BackendAuth } from './auth'
import { AppConfig } from './config'
import { renderChartOgImageOutputEffect } from './services/functions/chart-og-image/index'
import { CatalogIdentityError } from './services/catalog-identities'
import { CatalogIdentities } from './services/application'

type Context = {
  user?: BackendAuth['$Infer']['Session']['user']
  signal?: AbortSignal
}

class UnauthorizedError extends Data.TaggedError('UnauthorizedError')<{ readonly message: string }> {
  constructor() {
    super({ message: 'Unauthorized' })
  }
}

export const withCatalogIdentityErrors = <A, R>(effect: Effect.Effect<A, CatalogIdentityError, R>) =>
  effect.pipe(
    Effect.mapError((error) => {
      const code = {
        bad_request: 'BAD_REQUEST',
        not_found: 'NOT_FOUND',
        unavailable: 'SERVICE_UNAVAILABLE',
      }[error.code] as 'BAD_REQUEST' | 'NOT_FOUND' | 'SERVICE_UNAVAILABLE'
      return new ORPCError(code, { message: error.message, cause: error })
    }),
  )

type TagsListResult = {
  tags: Array<{
    id: number
    localized_name: Record<string, string>
    localized_description: Record<string, string>
    group_id: number | null
  }>
  tagGroups: Array<{ id: number; localized_name: Record<string, string>; color: string }>
  tagSongs: Array<{
    song_id: string
    sheet_type: string
    sheet_difficulty: string
    tag_id: number
  }>
}

type AliasListResult = Array<{ song_id: string; name: string }>
type TrendingCacheResult = {
  results: Array<{ songId: string; count: number }>
  dateFrom: string
  dateTo: string
}

const os = implement(appContract)

const tagsHandler = {
  list: os.tags.list.handler(({ input, context }) =>
    runApp(
      Effect.gen(function* () {
        const database = yield* Database
        const cache = yield* ApplicationCache
        const catalogIdentities = yield* CatalogIdentities
        const cached = yield* cache.get<TagsListResult>('tags:list')
        let result: TagsListResult
        if (cached) {
          yield* Effect.sync(() => Sentry.metrics.count('cache.hit', 1, { attributes: { key: 'tags:list' } }))
          result = cached
        } else {
          yield* Effect.sync(() => Sentry.metrics.count('cache.miss', 1, { attributes: { key: 'tags:list' } }))

          const [allTags, allGroups, allTagSongs] = yield* Effect.all(
            [
              database.query('Tags.list', (db) =>
                db
                  .select({
                    id: tags.id,
                    localized_name: tags.localized_name,
                    localized_description: tags.localized_description,
                    group_id: tags.group_id,
                  })
                  .from(tags),
              ),
              database.query('Tags.listGroups', (db) =>
                db
                  .select({
                    id: tagGroups.id,
                    localized_name: tagGroups.localized_name,
                    color: tagGroups.color,
                  })
                  .from(tagGroups),
              ),
              database.query('Tags.listSongTags', (db) =>
                db
                  .select({
                    song_id: tagSongs.song_id,
                    sheet_type: tagSongs.sheet_type,
                    sheet_difficulty: tagSongs.sheet_difficulty,
                    tag_id: tagSongs.tag_id,
                  })
                  .from(tagSongs),
              ),
            ],
            { concurrency: 'unbounded' },
          )

          result = {
            tags: allTags,
            tagGroups: allGroups,
            tagSongs: allTagSongs,
          }
          yield* cache.set('tags:list', result)
        }

        if (input?.idScheme === 'public') {
          const tagSongs = yield* withCatalogIdentityErrors(
            catalogIdentities.translateTagSongsToPublic(result.tagSongs),
          )
          return { ...result, tagSongs }
        }
        return result
      }).pipe(Effect.withSpan('api.tags.list')),
      { signal: (context as Context).signal },
    ),
  ),
  attach: os.tags.attach.handler(({ input, context }) =>
    runApp(
      Effect.gen(function* () {
        const database = yield* Database
        const cache = yield* ApplicationCache
        const catalogIdentities = yield* CatalogIdentities
        const user = (context as Context).user
        if (!user) return yield* Effect.fail(new UnauthorizedError())

        const identity = yield* withCatalogIdentityErrors(catalogIdentities.resolveSheetInput(input))

        const existing = yield* database.query('Tags.findAttachment', (db) =>
          db
            .select()
            .from(tagSongs)
            .where(
              and(
                inArray(tagSongs.song_id, identity.legacySongIds),
                eq(tagSongs.sheet_type, identity.sheetType),
                eq(tagSongs.sheet_difficulty, identity.sheetDifficulty),
                eq(tagSongs.tag_id, input.tagId),
              ),
            ),
        )

        if (existing.length > 0) return { id: existing[0].id }

        const res = yield* database
          .query('Tags.attach', (db) =>
            db
              .insert(tagSongs)
              .values({
                song_id: identity.legacySongId,
                sheet_type: identity.sheetType,
                sheet_difficulty: identity.sheetDifficulty,
                tag_id: input.tagId,
                created_by: user.id,
              })
              .returning({ id: tagSongs.id }),
          )
          .pipe(
            Effect.tap(() => cache.delete('tags:list')),
            Effect.uninterruptible,
          )

        return res[0]
      }).pipe(Effect.withSpan('api.tags.attach')),
      { signal: (context as Context).signal },
    ),
  ),
}

const moderateComment = Effect.fn('Comments.moderate')(function* (
  viewerId: string | undefined,
  commentId: number,
  action: 'report' | 'block',
) {
  if (!viewerId) return yield* Effect.fail(new ORPCError('UNAUTHORIZED'))
  const database = yield* Database
  return yield* database.transaction((tx) =>
    Effect.gen(function* () {
      const [comment] = yield* database.query('Comments.findAuthor', () =>
        tx.select({ authorId: comments.created_by }).from(comments).where(eq(comments.id, commentId)).for('share'),
      )
      if (!comment) return yield* Effect.fail(new ORPCError('NOT_FOUND', { message: 'Comment not found' }))
      if (comment.authorId === viewerId)
        return yield* Effect.fail(new ORPCError('BAD_REQUEST', { message: 'Cannot report or block yourself' }))
      yield* database.query('Comments.report', () =>
        tx
          .insert(commentReports)
          .values({ reporter_id: viewerId, comment_id: commentId, action })
          .onConflictDoNothing(),
      )
      if (action === 'block') {
        yield* database.query('Comments.blockAuthor', () =>
          tx.insert(userBlocks).values({ blocker_id: viewerId, blocked_id: comment.authorId }).onConflictDoNothing(),
        )
      }
      return { success: true, author_id: comment.authorId }
    }),
  )
})

const commentsHandler = {
  report: os.comments.report.handler(({ input, context }) =>
    runApp(moderateComment((context as Context).user?.id, input.commentId, 'report'), {
      signal: (context as Context).signal,
    }),
  ),
  blockAuthor: os.comments.blockAuthor.handler(({ input, context }) =>
    runApp(moderateComment((context as Context).user?.id, input.commentId, 'block'), {
      signal: (context as Context).signal,
    }),
  ),
  create: os.comments.create.handler(({ input, context }) =>
    runApp(
      Effect.gen(function* () {
        const database = yield* Database
        const catalogIdentities = yield* CatalogIdentities
        const user = (context as Context).user
        if (!user) {
          return yield* Effect.fail(new UnauthorizedError())
        }

        const identity = yield* withCatalogIdentityErrors(catalogIdentities.resolveSheetInput(input))

        const parentId = input.parentId
        if (parentId !== undefined) {
          const [parent] = yield* database.query('Comments.findParent', (db) =>
            db
              .select({
                song_id: comments.song_id,
                sheet_type: comments.sheet_type,
                sheet_difficulty: comments.sheet_difficulty,
              })
              .from(comments)
              .where(eq(comments.id, parentId))
              .limit(1),
          )
          if (!parent) {
            return yield* Effect.fail(new ORPCError('NOT_FOUND', { message: 'Parent comment not found' }))
          }
          if (
            !identity.legacySongIds.includes(parent.song_id) ||
            parent.sheet_type !== identity.sheetType ||
            parent.sheet_difficulty !== identity.sheetDifficulty
          ) {
            return yield* Effect.fail(
              new ORPCError('BAD_REQUEST', { message: 'Parent comment belongs to a different chart' }),
            )
          }
        }

        const newComment = yield* database.query('Comments.create', (db) =>
          db
            .insert(comments)
            .values({
              song_id: identity.legacySongId,
              sheet_type: identity.sheetType,
              sheet_difficulty: identity.sheetDifficulty,
              parent_id: input.parentId,
              content: input.content,
              created_by: user.id,
            })
            .returning({ id: comments.id, created_at: comments.created_at }),
        )

        return newComment[0]
      }).pipe(Effect.withSpan('api.comments.create')),
      { signal: (context as Context).signal },
    ),
  ),
  list: os.comments.list.handler(({ input, context }) =>
    runApp(
      Effect.gen(function* () {
        const database = yield* Database
        const catalogIdentities = yield* CatalogIdentities
        const viewerId = (context as Context).user?.id
        const identity = yield* withCatalogIdentityErrors(catalogIdentities.resolveSheetInput(input))
        const result = yield* database.query('Comments.list', (db) =>
          db
            .select({
              id: comments.id,
              author_id: comments.created_by,
              parent_id: comments.parent_id,
              created_at: comments.created_at,
              content: comments.content,
              display_name: profiles.display_name,
            })
            .from(comments)
            .leftJoin(profiles, eq(profiles.id, comments.created_by))
            .where(
              and(
                isNull(comments.removed_at),
                viewerId
                  ? notExists(
                      db
                        .select({ id: commentReports.id })
                        .from(commentReports)
                        .where(
                          and(eq(commentReports.reporter_id, viewerId), eq(commentReports.comment_id, comments.id)),
                        ),
                    )
                  : undefined,
                viewerId
                  ? notExists(
                      db
                        .select({ id: userBlocks.blocked_id })
                        .from(userBlocks)
                        .where(
                          and(eq(userBlocks.blocker_id, viewerId), eq(userBlocks.blocked_id, comments.created_by)),
                        ),
                    )
                  : undefined,
                inArray(comments.song_id, identity.legacySongIds),
                eq(comments.sheet_type, identity.sheetType),
                eq(comments.sheet_difficulty, identity.sheetDifficulty),
              ),
            )
            .orderBy(desc(comments.created_at)),
        )

        return result
      }).pipe(Effect.withSpan('api.comments.list')),
      { signal: (context as Context).signal },
    ),
  ),
}

const aliasesHandler = {
  list: os.aliases.list.handler(({ input, context }) =>
    runApp(
      Effect.gen(function* () {
        const database = yield* Database
        const cache = yield* ApplicationCache
        const catalogIdentities = yield* CatalogIdentities
        const cached = yield* cache.get<AliasListResult>('aliases:list')
        let result: AliasListResult
        if (cached) {
          yield* Effect.sync(() => Sentry.metrics.count('cache.hit', 1, { attributes: { key: 'aliases:list' } }))
          result = cached
        } else {
          yield* Effect.sync(() => Sentry.metrics.count('cache.miss', 1, { attributes: { key: 'aliases:list' } }))

          result = yield* database.query('Aliases.list', (db) =>
            db
              .select({
                song_id: songAliases.song_id,
                name: songAliases.name,
              })
              .from(songAliases),
          )

          yield* cache.set('aliases:list', result)
        }

        if (input?.idScheme === 'public') {
          const publicIds = yield* withCatalogIdentityErrors(
            catalogIdentities.translateSongIdsToPublic(result.map((alias) => alias.song_id)),
          )
          return result.flatMap((alias) => {
            const songId = publicIds.get(alias.song_id)
            return songId === undefined ? [] : [{ ...alias, song_id: songId }]
          })
        }
        return result
      }).pipe(Effect.withSpan('api.aliases.list')),
      { signal: (context as Context).signal },
    ),
  ),
  create: os.aliases.create.handler(({ input, context }) =>
    runApp(
      Effect.gen(function* () {
        const database = yield* Database
        const cache = yield* ApplicationCache
        const catalogIdentities = yield* CatalogIdentities
        const user = (context as Context).user
        if (!user) return yield* Effect.fail(new UnauthorizedError())

        const identity = yield* withCatalogIdentityErrors(catalogIdentities.resolveSongInput(input.songId))

        const res = yield* database
          .query('Aliases.create', (db) =>
            db
              .insert(songAliases)
              .values({
                song_id: identity.legacySongId,
                name: input.name,
                created_by: user.id,
              })
              .returning({ id: songAliases.id }),
          )
          .pipe(
            Effect.tap(() => cache.delete('aliases:list')),
            Effect.uninterruptible,
          )

        return res[0]
      }).pipe(Effect.withSpan('api.aliases.create')),
      { signal: (context as Context).signal },
    ),
  ),
}

import { withMaimaiNETClient } from './lib/functions/client'
import * as lxnsService from './services/lxns/index'

const analyticsHandler = {
  trending: os.analytics.trending.handler(({ input, context }) =>
    runApp(
      Effect.gen(function* () {
        const cache = yield* ApplicationCache
        const catalogIdentities = yield* CatalogIdentities
        const config = yield* AppConfig
        const http = yield* HttpClient
        const cacheKey = 'analytics:trending'
        const cached = yield* cache.get<TrendingCacheResult>(cacheKey)
        let result: TrendingCacheResult
        if (cached) {
          yield* Effect.sync(() => Sentry.metrics.count('cache.hit', 1, { attributes: { key: cacheKey } }))
          result = cached
        } else {
          yield* Effect.sync(() => Sentry.metrics.count('cache.miss', 1, { attributes: { key: cacheKey } }))

          const { projectId, apiKey } = config.posthog
          if (!projectId || !apiKey) {
            result = { results: [], dateFrom: '', dateTo: '' }
          } else {
            const response = yield* http.request(`https://us.posthog.com/api/projects/${projectId}/query/`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                query: {
                  kind: 'TrendsQuery',
                  series: [{ kind: 'EventsNode', event: 'sheet_content_viewed', math: 'total' }],
                  breakdownFilter: { breakdowns: [{ property: 'song_id', type: 'event' }] },
                  dateRange: { date_from: '-7d' },
                  interval: 'day',
                  filterTestAccounts: true,
                },
              }),
            })

            if (!response.ok) {
              yield* Effect.sync(() => Sentry.captureException(new Error(`PostHog query failed: ${response.status}`)))
              result = { results: [], dateFrom: '', dateTo: '' }
            } else {
              const data = yield* http.json<{ results: Array<Record<string, unknown>> }>(response)
              const series = (data.results as Array<Record<string, unknown>>).flat()

              const songCounts = new Map<string, number>()
              for (const s of series) {
                if (!s.breakdown_value) continue
                const songId = String(s.breakdown_value)
                if (songId === '$$_posthog_breakdown_other_$$') continue
                const total = (s.aggregated_value as number) ?? 0
                songCounts.set(songId, (songCounts.get(songId) ?? 0) + total)
              }

              const results = [...songCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([songId, count]) => ({ songId, count }))

              const now = new Date(yield* Clock.currentTimeMillis)
              const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
              result = {
                results,
                dateFrom: weekAgo.toISOString().split('T')[0],
                dateTo: now.toISOString().split('T')[0],
              }
              yield* cache.set(cacheKey, result, 60 * 60 * 1000) // 1 hour TTL
            }
          }
        }

        if (input?.idScheme === 'public') {
          const results = yield* withCatalogIdentityErrors(
            catalogIdentities.translateSongCountsToPublic(result.results),
          )
          return {
            ...result,
            results: results.map(({ songId }) => ({ songId })),
          }
        }
        return { ...result, results: result.results.map(({ songId }) => ({ songId })) }
      }).pipe(Effect.withSpan('api.analytics.trending')),
      { signal: (context as Context).signal },
    ),
  ),
}

type ArcadeInstallationResponse = {
  id: string
  gameId: string
  gameName: string
  machineCount?: number
  version?: string
  cabinetModel?: string
  status?: string
  region?: string
  network?: string
  price?: string
  condition?: string
  confidence?: number
  observedAt: string
}

function normalizeArcadeSearch(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function escapeArcadeSearch(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
}

const loadArcadeInstallations = Effect.fn('Arcades.loadInstallations')(function* (venueIds: bigint[]) {
  const database = yield* Database
  const grouped = new Map<string, ArcadeInstallationResponse[]>()
  if (venueIds.length === 0) return grouped

  const rows = yield* database.query('Arcades.loadInstallations', (db) =>
    db
      .select({
        id: arcadeInstallations.id,
        installationIdentityId: arcadeInstallations.installation_identity_id,
        publicId: arcadeInstallationIdentities.public_id,
        venueId: arcadeInstallations.venue_id,
        gameId: arcadeInstallations.game_id,
        gameName: arcadeGames.name,
        machineCount: arcadeInstallations.machine_count,
        version: arcadeInstallations.version,
        cabinetModel: arcadeInstallations.cabinet_model,
        status: arcadeInstallations.status,
        region: arcadeInstallations.region,
        network: arcadeInstallations.network,
        price: arcadeInstallations.price,
        condition: arcadeInstallations.condition,
        confidence: arcadeInstallations.confidence,
        observedAt: arcadeInstallations.observed_at,
        source: arcadeInstallations.source,
      })
      .from(arcadeInstallations)
      .innerJoin(
        arcadeInstallationIdentities,
        eq(arcadeInstallationIdentities.id, arcadeInstallations.installation_identity_id),
      )
      .innerJoin(arcadeGames, eq(arcadeGames.id, arcadeInstallations.game_id))
      .where(and(inArray(arcadeInstallations.venue_id, venueIds), isNull(arcadeInstallations.absent_since)))
      .orderBy(
        asc(arcadeInstallations.venue_id),
        asc(arcadeGames.name),
        asc(arcadeInstallations.game_id),
        asc(arcadeInstallations.region),
        asc(arcadeInstallations.network),
        asc(arcadeInstallations.version),
        asc(arcadeInstallations.cabinet_model),
        asc(arcadeInstallations.source),
        asc(arcadeInstallations.id),
      ),
  )

  const logicalInstallations = new Map<string, Array<(typeof rows)[number]>>()

  for (const row of rows) {
    const identity = row.installationIdentityId.toString()
    const existing = logicalInstallations.get(identity)
    if (!existing) {
      logicalInstallations.set(identity, [row])
      continue
    }
    existing.push(row)
  }

  type InstallationRow = (typeof rows)[number]
  const compareCandidates = (left: InstallationRow, right: InstallationRow) => {
    const confidence = (right.confidence ?? -1) - (left.confidence ?? -1)
    if (confidence !== 0) return confidence

    const observedAt = right.observedAt.getTime() - left.observedAt.getTime()
    if (observedAt !== 0) return observedAt

    const source = left.source.localeCompare(right.source)
    if (source !== 0) return source

    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  }
  const compareFreshness = (left: InstallationRow, right: InstallationRow) => {
    const observedAt = right.observedAt.getTime() - left.observedAt.getTime()
    if (observedAt !== 0) return observedAt

    const source = left.source.localeCompare(right.source)
    if (source !== 0) return source

    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  }
  const selectFact = <T>(
    candidates: InstallationRow[],
    read: (candidate: InstallationRow) => T | null,
  ): T | undefined => {
    const selected = candidates.filter((candidate) => read(candidate) !== null).sort(compareCandidates)[0]
    return selected ? (read(selected) ?? undefined) : undefined
  }

  for (const candidates of logicalInstallations.values()) {
    const winner = [...candidates].sort(compareCandidates)[0]
    const freshest = [...candidates].sort(compareFreshness)[0]
    const venueId = winner.venueId.toString()
    const installations = grouped.get(venueId) ?? []
    installations.push({
      id: winner.publicId,
      gameId: winner.gameId,
      gameName: winner.gameName,
      machineCount: selectFact(candidates, (candidate) => candidate.machineCount),
      version: winner.version ?? undefined,
      cabinetModel: winner.cabinetModel ?? undefined,
      status: selectFact(candidates, (candidate) => candidate.status),
      region: winner.region ?? undefined,
      network: winner.network ?? undefined,
      price: selectFact(candidates, (candidate) => candidate.price),
      condition: selectFact(candidates, (candidate) => candidate.condition),
      confidence: selectFact(candidates, (candidate) => candidate.confidence),
      observedAt: freshest.observedAt.toISOString(),
    })
    grouped.set(venueId, installations)
  }

  return grouped
})

function serializeArcadeVenue(
  venue: typeof arcadeVenues.$inferSelect,
  installations: Map<string, ArcadeInstallationResponse[]>,
) {
  const internalId = venue.id.toString()
  return {
    id: venue.public_id,
    name: venue.name,
    chainId: venue.chain_id ?? undefined,
    countryCode: venue.country_code ?? undefined,
    region: venue.region ?? undefined,
    city: venue.city ?? undefined,
    address: venue.address ?? undefined,
    postalCode: venue.postal_code ?? undefined,
    phone: venue.phone ?? undefined,
    websiteUrl: venue.website_url ?? undefined,
    timezone: venue.timezone ?? undefined,
    latitude: venue.latitude ?? undefined,
    longitude: venue.longitude ?? undefined,
    installations: installations.get(internalId) ?? [],
  }
}

const arcadesHandler = {
  games: os.arcades.games.handler(({ context }) =>
    runApp(
      Effect.gen(function* () {
        const database = yield* Database
        const items = yield* database.query('Arcades.listGames', (db) =>
          db
            .select({
              id: arcadeGames.id,
              name: arcadeGames.name,
              manufacturer: arcadeGames.manufacturer,
            })
            .from(arcadeGames)
            .where(eq(arcadeGames.active, true))
            .orderBy(asc(arcadeGames.name), asc(arcadeGames.id)),
        )

        return { items }
      }).pipe(Effect.withSpan('api.arcades.games')),
      { signal: (context as Context).signal },
    ),
  ),
  venues: os.arcades.venues.handler(({ input, context }) =>
    runApp(
      Effect.gen(function* () {
        const database = yield* Database
        const db = database.db
        const filters: SQL[] = []

        if (
          input.minLatitude !== undefined &&
          input.minLongitude !== undefined &&
          input.maxLatitude !== undefined &&
          input.maxLongitude !== undefined
        ) {
          filters.push(
            gte(arcadeVenues.latitude, input.minLatitude),
            lte(arcadeVenues.latitude, input.maxLatitude),
            gte(arcadeVenues.longitude, input.minLongitude),
            lte(arcadeVenues.longitude, input.maxLongitude),
          )
        }

        if (input.query) {
          const pattern = `%${escapeArcadeSearch(input.query)}%`
          const normalized = normalizeArcadeSearch(input.query)
          const normalizedPattern = normalized ? `%${escapeArcadeSearch(normalized)}%` : undefined
          filters.push(
            or(
              ilike(arcadeVenues.name, pattern),
              ilike(arcadeVenues.address, pattern),
              ilike(arcadeVenues.city, pattern),
              ilike(arcadeVenues.region, pattern),
              normalizedPattern ? ilike(arcadeVenues.normalized_name, normalizedPattern) : undefined,
              normalizedPattern ? ilike(arcadeVenues.normalized_address, normalizedPattern) : undefined,
            )!,
          )
        }

        if (input.chains) {
          filters.push(inArray(arcadeVenues.chain_id, input.chains))
        }

        if (input.games || input.status) {
          const installationFilters = [
            eq(arcadeInstallations.venue_id, arcadeVenues.id),
            isNull(arcadeInstallations.absent_since),
          ]
          if (input.games) installationFilters.push(inArray(arcadeInstallations.game_id, input.games))
          if (input.status) installationFilters.push(eq(arcadeInstallations.status, input.status))
          filters.push(
            exists(
              db
                .select({ value: sql`1` })
                .from(arcadeInstallations)
                .where(and(...installationFilters)),
            ),
          )
        }

        const [rows, chains] = yield* Effect.all(
          [
            database.query('Arcades.listVenues', (db) =>
              db
                .select()
                .from(arcadeVenues)
                .where(filters.length > 0 ? and(...filters) : undefined)
                .orderBy(asc(arcadeVenues.normalized_name), asc(arcadeVenues.id)),
            ),
            database.query('Arcades.listChains', (db) =>
              db
                .select({
                  id: arcadeChains.id,
                  name: arcadeChains.name,
                  countryCodes: arcadeChains.country_codes,
                })
                .from(arcadeChains)
                .where(
                  exists(
                    db
                      .select({ value: sql`1` })
                      .from(arcadeVenues)
                      .where(eq(arcadeVenues.chain_id, arcadeChains.id)),
                  ),
                )
                .orderBy(asc(arcadeChains.name), asc(arcadeChains.id)),
            ),
          ],
          { concurrency: 'unbounded' },
        )

        const installations = yield* loadArcadeInstallations(rows.map((venue) => venue.id))

        return {
          items: rows.map((venue) => serializeArcadeVenue(venue, installations)),
          chains,
        }
      }).pipe(Effect.withSpan('api.arcades.venues')),
      { signal: (context as Context).signal },
    ),
  ),
  venue: os.arcades.venue.handler(({ input, context }) =>
    runApp(
      Effect.gen(function* () {
        const database = yield* Database
        const [venue] = yield* database.query('Arcades.findVenue', (db) =>
          db.select().from(arcadeVenues).where(eq(arcadeVenues.public_id, input.id)).limit(1),
        )
        if (!venue) {
          return yield* Effect.fail(new ORPCError('NOT_FOUND', { message: 'Arcade venue not found' }))
        }

        const installations = yield* loadArcadeInstallations([venue.id])
        return serializeArcadeVenue(venue, installations)
      }).pipe(Effect.withSpan('api.arcades.venue')),
      { signal: (context as Context).signal },
    ),
  ),
}

const chartOgImageHandler = {
  render: os.chartOgImage.render.handler(({ input, context }) =>
    runApp(
      Effect.gen(function* () {
        const output = yield* renderChartOgImageOutputEffect(input)
        if (!output) {
          return yield* Effect.fail(new ORPCError('NOT_FOUND', { message: 'Chart not found' }))
        }

        return output
      }).pipe(Effect.withSpan('api.chartOgImage.render')),
      { signal: (context as Context).signal },
    ),
  ),
}

const maimaiHandler = {
  fetchRecords: os.maimai.fetchRecords.handler(({ input, context }) =>
    runApp(
      Effect.gen(function* () {
        const { id, password, region } = input
        return yield* withMaimaiNETClient(region, (client) =>
          Effect.gen(function* () {
            yield* client.loginEffect({ id, password })
            const [recentRecords, musicRecords] = yield* Effect.all(
              [client.fetchRecentRecordsEffect(), client.fetchMusicRecordsEffect()],
              { concurrency: 'unbounded' },
            )
            return { recentRecords, musicRecords }
          }),
        )
      }).pipe(Effect.withSpan('api.maimai.fetchRecords')),
      { signal: (context as Context).signal },
    ),
  ),
}

const lxnsHandler = {
  authorize: os.lxns.authorize.handler(({ context }) =>
    runApp(
      Effect.gen(function* () {
        const user = (context as Context).user
        if (!user) return yield* Effect.fail(new UnauthorizedError())
        const url = yield* lxnsService.generateAuthorizationUrl(user.id)
        return { url }
      }).pipe(Effect.withSpan('api.lxns.authorize')),
      { signal: (context as Context).signal },
    ),
  ),
  status: os.lxns.status.handler(({ context }) =>
    runApp(
      Effect.gen(function* () {
        const user = (context as Context).user
        if (!user) return yield* Effect.fail(new UnauthorizedError())
        return yield* lxnsService.getConnectionStatus(user.id)
      }).pipe(Effect.withSpan('api.lxns.status')),
      { signal: (context as Context).signal },
    ),
  ),
  start: os.lxns.start.handler(({ context }) =>
    runApp(
      Effect.gen(function* () {
        const user = (context as Context).user
        if (!user) return yield* Effect.fail(new UnauthorizedError())
        const [duration, rawScores] = yield* Effect.timed(lxnsService.fetchPlayerScores(user.id))
        yield* Effect.sync(() =>
          Sentry.metrics.distribution('lxns_fetch.duration', Duration.toMillis(duration), {
            unit: 'millisecond',
          }),
        )
        const scores = rawScores.map((s) => ({
          id: s.id,
          songName: s.song_name,
          level: s.level,
          levelIndex: s.level_index,
          achievements: s.achievements,
          fc: s.fc,
          fs: s.fs,
          type: s.type,
          dxScore: s.dx_score,
        }))
        yield* Effect.sync(() => Sentry.metrics.distribution('lxns_fetch.scores', scores.length, { unit: 'none' }))
        return { scores, count: scores.length }
      }).pipe(Effect.withSpan('api.lxns.start')),
      { signal: (context as Context).signal },
    ),
  ),
  disconnect: os.lxns.disconnect.handler(({ context }) =>
    runApp(
      Effect.gen(function* () {
        const user = (context as Context).user
        if (!user) return yield* Effect.fail(new UnauthorizedError())
        yield* lxnsService.disconnect(user.id)
        return { success: true }
      }).pipe(Effect.withSpan('api.lxns.disconnect')),
      { signal: (context as Context).signal },
    ),
  ),
}

export const appRouter = os.router({
  tags: tagsHandler,
  comments: commentsHandler,
  aliases: aliasesHandler,
  analytics: analyticsHandler,
  arcades: arcadesHandler,
  chartOgImage: chartOgImageHandler,
  maimai: maimaiHandler,
  lxns: lxnsHandler,
})