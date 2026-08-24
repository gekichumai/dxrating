import * as Sentry from '@sentry/node'
import { ORPCError, implement } from '@orpc/server'
import { appContract } from './contract.js'
import { db, pool } from './db/index.js'
import {
  tags,
  tagGroups,
  tagSongs,
  comments,
  profiles,
  songAliases,
  arcadeGames,
  arcadeChains,
  arcadeVenues,
  arcadeInstallationIdentities,
  arcadeInstallations,
} from './db/schema.js'
import { eq, and, desc, asc, exists, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import Keyv from 'keyv'
import { config } from './config.js'
import { renderChartOgImageOutput } from './services/functions/chart-og-image/index.js'
import { CatalogIdentityError, createCatalogIdentityService } from './services/catalog-identities.js'
import { auth } from './auth.js'
import { loadPostgresUserBanState } from './admin/user-ban-store.js'
import {
  createPublicAccessPolicy,
  PublicAccountBanned,
  PublicAuthenticationRequired,
  normalizePublicCanonicalSession,
  runPostgresPublicUserWriteLease,
  type PublicAuthenticatedUser,
} from './public-access-policy.js'

export type PublicRequestContext = {
  readonly headers?: Headers
  readonly user?: PublicAuthenticatedUser
}

const cache = new Keyv({ ttl: 30 * 60 * 1000 }) // 30 minute TTL
const catalogIdentities = createCatalogIdentityService(async (text, values) => pool.query(text, values))

export const withCatalogIdentityErrors = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    if (!(error instanceof CatalogIdentityError)) throw error
    const code = {
      bad_request: 'BAD_REQUEST',
      not_found: 'NOT_FOUND',
      unavailable: 'SERVICE_UNAVAILABLE',
    }[error.code] as 'BAD_REQUEST' | 'NOT_FOUND' | 'SERVICE_UNAVAILABLE'
    throw new ORPCError(code, { message: error.message, cause: error })
  }
}

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

const os = implement(appContract).$context<PublicRequestContext>()

const publicAccessPolicy = createPublicAccessPolicy({
  loadSession: async (headers) => {
    const authentication = await auth.api.getSession({
      headers,
      query: { disableCookieCache: true, disableRefresh: true },
    })
    // Better Auth hooks can short-circuit an HTTP session probe with a
    // Response. Internal callers never treat that transport object as an
    // authenticated principal.
    return normalizePublicCanonicalSession(authentication)
  },
  loadBanState: loadPostgresUserBanState,
  database: pool,
  runWriteLease: (identity, operation) => runPostgresPublicUserWriteLease(identity, operation, pool),
})

export const publicProcedureAccessMiddleware = os.middleware<{ readonly user?: PublicAuthenticatedUser }, unknown>(
  async ({ context, errors, next, path, procedure }) => {
    const access = procedure['~orpc'].meta.access
    try {
      return await publicAccessPolicy({
        access,
        headers: context.headers,
        operation: async (user) => next({ context: { user } }),
      })
    } catch (error) {
      if (error instanceof PublicAuthenticationRequired) {
        Sentry.metrics.count('public_api.access_denied', 1, {
          attributes: { access, code: 'UNAUTHORIZED', procedure: path.join('.') },
        })
        throw errors.UNAUTHORIZED()
      }
      if (error instanceof PublicAccountBanned) {
        Sentry.metrics.count('public_api.access_denied', 1, {
          attributes: { access, code: 'ACCOUNT_BANNED', procedure: path.join('.') },
        })
        throw errors.ACCOUNT_BANNED()
      }
      throw error
    }
  },
)

const guarded = os.use(publicProcedureAccessMiddleware)

const tagsHandler = {
  list: guarded.tags.list.handler(async ({ input }) => {
    const cached = await cache.get<TagsListResult>('tags:list')
    let result: TagsListResult
    if (cached) {
      Sentry.metrics.count('cache.hit', 1, { attributes: { key: 'tags:list' } })
      result = cached
    } else {
      Sentry.metrics.count('cache.miss', 1, { attributes: { key: 'tags:list' } })

      const [allTags, allGroups, allTagSongs] = await Promise.all([
        db
          .select({
            id: tags.id,
            localized_name: tags.localized_name,
            localized_description: tags.localized_description,
            group_id: tags.group_id,
          })
          .from(tags),
        db
          .select({
            id: tagGroups.id,
            localized_name: tagGroups.localized_name,
            color: tagGroups.color,
          })
          .from(tagGroups),
        db
          .select({
            song_id: tagSongs.song_id,
            sheet_type: tagSongs.sheet_type,
            sheet_difficulty: tagSongs.sheet_difficulty,
            tag_id: tagSongs.tag_id,
          })
          .from(tagSongs),
      ])

      result = {
        tags: allTags,
        tagGroups: allGroups,
        tagSongs: allTagSongs,
      }
      await cache.set('tags:list', result)
    }

    if (input?.idScheme === 'public') {
      const tagSongs = await withCatalogIdentityErrors(() =>
        catalogIdentities.translateTagSongsToPublic(result.tagSongs),
      )
      return { ...result, tagSongs }
    }
    return result
  }),
  attach: guarded.tags.attach.handler(async ({ input, context }) => {
    const user = context.user
    if (!user) throw new Error('Unauthorized')

    const identity = await withCatalogIdentityErrors(() => catalogIdentities.resolveSheetInput(input))

    const existing = await db
      .select()
      .from(tagSongs)
      .where(
        and(
          inArray(tagSongs.song_id, identity.legacySongIds),
          eq(tagSongs.sheet_type, identity.sheetType),
          eq(tagSongs.sheet_difficulty, identity.sheetDifficulty),
          eq(tagSongs.tag_id, input.tagId),
        ),
      )

    if (existing.length > 0) return { id: existing[0].id }

    const res = await db
      .insert(tagSongs)
      .values({
        song_id: identity.legacySongId,
        sheet_type: identity.sheetType,
        sheet_difficulty: identity.sheetDifficulty,
        tag_id: input.tagId,
        created_by: user.id,
      })
      .returning({ id: tagSongs.id })

    await cache.delete('tags:list')
    return res[0]
  }),
}

const commentsHandler = {
  create: guarded.comments.create.handler(async ({ input, context }) => {
    const user = context.user
    if (!user) {
      throw new Error('Unauthorized')
    }

    const identity = await withCatalogIdentityErrors(() => catalogIdentities.resolveSheetInput(input))

    if (input.parentId !== undefined) {
      const [parent] = await db
        .select({
          song_id: comments.song_id,
          sheet_type: comments.sheet_type,
          sheet_difficulty: comments.sheet_difficulty,
        })
        .from(comments)
        .where(eq(comments.id, input.parentId))
        .limit(1)
      if (!parent) {
        throw new ORPCError('NOT_FOUND', { message: 'Parent comment not found' })
      }
      if (
        !identity.legacySongIds.includes(parent.song_id) ||
        parent.sheet_type !== identity.sheetType ||
        parent.sheet_difficulty !== identity.sheetDifficulty
      ) {
        throw new ORPCError('BAD_REQUEST', { message: 'Parent comment belongs to a different chart' })
      }
    }

    const newComment = await db
      .insert(comments)
      .values({
        song_id: identity.legacySongId,
        sheet_type: identity.sheetType,
        sheet_difficulty: identity.sheetDifficulty,
        parent_id: input.parentId,
        content: input.content,
        created_by: user.id,
      })
      .returning({ id: comments.id, created_at: comments.created_at })

    return newComment[0]
  }),
  list: guarded.comments.list.handler(async ({ input }) => {
    const identity = await withCatalogIdentityErrors(() => catalogIdentities.resolveSheetInput(input))
    const result = await db
      .select({
        id: comments.id,
        parent_id: comments.parent_id,
        created_at: comments.created_at,
        content: comments.content,
        display_name: profiles.display_name,
      })
      .from(comments)
      .leftJoin(profiles, eq(profiles.id, comments.created_by))
      .where(
        and(
          inArray(comments.song_id, identity.legacySongIds),
          eq(comments.sheet_type, identity.sheetType),
          eq(comments.sheet_difficulty, identity.sheetDifficulty),
        ),
      )
      .orderBy(desc(comments.created_at))

    return result
  }),
}

const aliasesHandler = {
  list: guarded.aliases.list.handler(async ({ input }) => {
    const cached = await cache.get<AliasListResult>('aliases:list')
    let result: AliasListResult
    if (cached) {
      Sentry.metrics.count('cache.hit', 1, { attributes: { key: 'aliases:list' } })
      result = cached
    } else {
      Sentry.metrics.count('cache.miss', 1, { attributes: { key: 'aliases:list' } })

      result = await db
        .select({
          song_id: songAliases.song_id,
          name: songAliases.name,
        })
        .from(songAliases)

      await cache.set('aliases:list', result)
    }

    if (input?.idScheme === 'public') {
      const publicIds = await withCatalogIdentityErrors(() =>
        catalogIdentities.translateSongIdsToPublic(result.map((alias) => alias.song_id)),
      )
      return result.flatMap((alias) => {
        const songId = publicIds.get(alias.song_id)
        return songId === undefined ? [] : [{ ...alias, song_id: songId }]
      })
    }
    return result
  }),
  create: guarded.aliases.create.handler(async ({ input, context }) => {
    const user = context.user
    if (!user) throw new Error('Unauthorized')

    const identity = await withCatalogIdentityErrors(() => catalogIdentities.resolveSongInput(input.songId))

    const res = await db
      .insert(songAliases)
      .values({
        song_id: identity.legacySongId,
        name: input.name,
        created_by: user.id,
      })
      .returning({ id: songAliases.id })

    await cache.delete('aliases:list')
    return res[0]
  }),
}

import { MaimaiNETJpClient, MaimaiNETIntlClient } from './lib/functions/client.js'
import * as lxnsService from './services/lxns/index.js'

const analyticsHandler = {
  trending: guarded.analytics.trending.handler(async ({ input }) => {
    const cacheKey = 'analytics:trending'
    const cached = await cache.get<TrendingCacheResult>(cacheKey)
    let result: TrendingCacheResult
    if (cached) {
      Sentry.metrics.count('cache.hit', 1, { attributes: { key: cacheKey } })
      result = cached
    } else {
      Sentry.metrics.count('cache.miss', 1, { attributes: { key: cacheKey } })

      const { projectId, apiKey } = config.posthog
      if (!projectId || !apiKey) {
        result = { results: [], dateFrom: '', dateTo: '' }
      } else {
        const response = await fetch(`https://us.posthog.com/api/projects/${projectId}/query/`, {
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
          Sentry.captureException(new Error(`PostHog query failed: ${response.status}`))
          result = { results: [], dateFrom: '', dateTo: '' }
        } else {
          const data = await response.json()
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

          const now = new Date()
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          result = {
            results,
            dateFrom: weekAgo.toISOString().split('T')[0],
            dateTo: now.toISOString().split('T')[0],
          }
          await cache.set(cacheKey, result, 60 * 60 * 1000) // 1 hour TTL
        }
      }
    }

    if (input?.idScheme === 'public') {
      const results = await withCatalogIdentityErrors(() =>
        catalogIdentities.translateSongCountsToPublic(result.results),
      )
      return {
        ...result,
        results: results.map(({ songId }) => ({ songId })),
      }
    }
    return { ...result, results: result.results.map(({ songId }) => ({ songId })) }
  }),
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

async function loadArcadeInstallations(venueIds: bigint[]) {
  const grouped = new Map<string, ArcadeInstallationResponse[]>()
  if (venueIds.length === 0) return grouped

  const rows = await db
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
}

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
  games: guarded.arcades.games.handler(async () => {
    const items = await db
      .select({
        id: arcadeGames.id,
        name: arcadeGames.name,
        manufacturer: arcadeGames.manufacturer,
      })
      .from(arcadeGames)
      .where(eq(arcadeGames.active, true))
      .orderBy(asc(arcadeGames.name), asc(arcadeGames.id))

    return { items }
  }),
  venues: guarded.arcades.venues.handler(async ({ input }) => {
    const filters = []

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

    const [rows, chains] = await Promise.all([
      db
        .select()
        .from(arcadeVenues)
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(asc(arcadeVenues.normalized_name), asc(arcadeVenues.id)),
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
    ])

    const installations = await loadArcadeInstallations(rows.map((venue) => venue.id))

    return {
      items: rows.map((venue) => serializeArcadeVenue(venue, installations)),
      chains,
    }
  }),
  venue: guarded.arcades.venue.handler(async ({ input }) => {
    const [venue] = await db.select().from(arcadeVenues).where(eq(arcadeVenues.public_id, input.id)).limit(1)
    if (!venue) {
      throw new ORPCError('NOT_FOUND', { message: 'Arcade venue not found' })
    }

    const installations = await loadArcadeInstallations([venue.id])
    return serializeArcadeVenue(venue, installations)
  }),
}

const chartOgImageHandler = {
  render: guarded.chartOgImage.render.handler(async ({ input }) => {
    const output = await renderChartOgImageOutput(input)
    if (!output) {
      throw new ORPCError('NOT_FOUND', { message: 'Chart not found' })
    }

    return output
  }),
}

const maimaiHandler = {
  fetchRecords: guarded.maimai.fetchRecords.handler(async ({ input }) => {
    const { id, password, region } = input
    const client = {
      jp: new MaimaiNETJpClient(),
      intl: new MaimaiNETIntlClient(),
    }[region]

    await client.login({ id, password })
    const [recentRecords, musicRecords] = await Promise.all([client.fetchRecentRecords(), client.fetchMusicRecords()])

    return { recentRecords, musicRecords }
  }),
}

const lxnsHandler = {
  authorize: guarded.lxns.authorize.handler(async ({ context }) => {
    const user = context.user
    if (!user) throw new Error('Unauthorized')
    const url = await lxnsService.generateAuthorizationUrl(user.id)
    return { url }
  }),
  status: guarded.lxns.status.handler(async ({ context }) => {
    const user = context.user
    if (!user) throw new Error('Unauthorized')
    return await lxnsService.getConnectionStatus(user.id)
  }),
  start: guarded.lxns.start.handler(async ({ context }) => {
    const user = context.user
    if (!user) throw new Error('Unauthorized')
    // Token refresh can update or delete the account-linked credential, so the
    // write lease deliberately spans both LXNS requests. Each request has a
    // 30-second abort deadline, bounding the lock while preserving one
    // linearizable check across every possible mutation in this operation.
    const fetchStart = performance.now()
    const rawScores = await lxnsService.fetchPlayerScores(user.id)
    Sentry.metrics.distribution('lxns_fetch.duration', performance.now() - fetchStart, {
      unit: 'millisecond',
    })
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
    Sentry.metrics.distribution('lxns_fetch.scores', scores.length, { unit: 'none' })
    return { scores, count: scores.length }
  }),
  disconnect: guarded.lxns.disconnect.handler(async ({ context }) => {
    const user = context.user
    if (!user) throw new Error('Unauthorized')
    await lxnsService.disconnect(user.id)
    return { success: true }
  }),
}

export const appRouter = guarded.router({
  tags: tagsHandler,
  comments: commentsHandler,
  aliases: aliasesHandler,
  analytics: analyticsHandler,
  arcades: arcadesHandler,
  chartOgImage: chartOgImageHandler,
  maimai: maimaiHandler,
  lxns: lxnsHandler,
})