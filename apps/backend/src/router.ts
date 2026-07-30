import * as Sentry from '@sentry/node'
import { ORPCError, implement } from '@orpc/server'
import { appContract } from './contract.js'
import { db } from './db/index.js'
import {
  tags,
  tagGroups,
  tagSongs,
  comments,
  profiles,
  songAliases,
  arcadeGames,
  arcadeVenues,
  arcadeInstallations,
} from './db/schema.js'
import { eq, and, desc, asc, exists, gt, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import Keyv from 'keyv'
import type { auth } from './auth.js'
import { config } from './config.js'
import { renderChartOgImageOutput } from './services/functions/chart-og-image/index.js'

type Context = {
  user?: typeof auth.$Infer.Session.user
}

const cache = new Keyv({ ttl: 30 * 60 * 1000 }) // 30 minute TTL

const os = implement(appContract)

const tagsHandler = {
  list: os.tags.list.handler(async () => {
    const cached = await cache.get('tags:list')
    if (cached) {
      Sentry.metrics.count('cache.hit', 1, { attributes: { key: 'tags:list' } })
      return cached
    }
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

    const result = {
      tags: allTags,
      tagGroups: allGroups,
      tagSongs: allTagSongs,
    }
    await cache.set('tags:list', result)
    return result
  }),
  attach: os.tags.attach.handler(async ({ input, context }) => {
    const user = (context as Context).user
    if (!user) throw new Error('Unauthorized')

    const existing = await db
      .select()
      .from(tagSongs)
      .where(
        and(
          eq(tagSongs.song_id, input.songId),
          eq(tagSongs.sheet_type, input.sheetType),
          eq(tagSongs.sheet_difficulty, input.sheetDifficulty),
          eq(tagSongs.tag_id, input.tagId),
        ),
      )

    if (existing.length > 0) return { id: existing[0].id }

    const res = await db
      .insert(tagSongs)
      .values({
        song_id: input.songId,
        sheet_type: input.sheetType,
        sheet_difficulty: input.sheetDifficulty,
        tag_id: input.tagId,
        created_by: user.id,
      })
      .returning({ id: tagSongs.id })

    await cache.delete('tags:list')
    return res[0]
  }),
}

const commentsHandler = {
  create: os.comments.create.handler(async ({ input, context }) => {
    const user = (context as Context).user
    if (!user) {
      throw new Error('Unauthorized')
    }

    if (input.parentId) {
      const parent = await db.select().from(comments).where(eq(comments.id, input.parentId)).limit(1)
      if (parent.length === 0) {
        throw new Error('Parent comment not found')
      }
    }

    const newComment = await db
      .insert(comments)
      .values({
        song_id: input.songId,
        sheet_type: input.sheetType,
        sheet_difficulty: input.sheetDifficulty,
        parent_id: input.parentId,
        content: input.content,
        created_by: user.id,
      })
      .returning({ id: comments.id, created_at: comments.created_at })

    return newComment[0]
  }),
  list: os.comments.list.handler(async ({ input }) => {
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
          eq(comments.song_id, input.songId),
          eq(comments.sheet_type, input.sheetType),
          eq(comments.sheet_difficulty, input.sheetDifficulty),
        ),
      )
      .orderBy(desc(comments.created_at))

    return result
  }),
}

const aliasesHandler = {
  list: os.aliases.list.handler(async () => {
    const cached = await cache.get('aliases:list')
    if (cached) {
      Sentry.metrics.count('cache.hit', 1, { attributes: { key: 'aliases:list' } })
      return cached
    }
    Sentry.metrics.count('cache.miss', 1, { attributes: { key: 'aliases:list' } })

    const result = await db
      .select({
        song_id: songAliases.song_id,
        name: songAliases.name,
      })
      .from(songAliases)

    await cache.set('aliases:list', result)
    return result
  }),
  create: os.aliases.create.handler(async ({ input, context }) => {
    const user = (context as Context).user
    if (!user) throw new Error('Unauthorized')

    const res = await db
      .insert(songAliases)
      .values({
        song_id: input.songId,
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
  trending: os.analytics.trending.handler(async () => {
    const cacheKey = 'analytics:trending'
    const cached = await cache.get(cacheKey)
    if (cached) {
      Sentry.metrics.count('cache.hit', 1, { attributes: { key: cacheKey } })
      return cached
    }
    Sentry.metrics.count('cache.miss', 1, { attributes: { key: cacheKey } })

    const { projectId, apiKey } = config.posthog
    if (!projectId || !apiKey) {
      return { results: [], dateFrom: '', dateTo: '' }
    }

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
      return { results: [], dateFrom: '', dateTo: '' }
    }

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

    const results = [...songCounts.entries()].sort((a, b) => b[1] - a[1]).map(([songId]) => ({ songId }))

    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const result = {
      results,
      dateFrom: weekAgo.toISOString().split('T')[0],
      dateTo: now.toISOString().split('T')[0],
    }

    await cache.set(cacheKey, result, 60 * 60 * 1000) // 1 hour TTL
    return result
  }),
}

type ArcadeVenueCursor = {
  normalizedName: string
  id: string
}

type ArcadeInstallationProvenance = {
  source: string
  observedAt: string
  sourceUrl: string | null
}

type ArcadeInstallationResponse = {
  id: string
  gameId: string
  gameName: string
  machineCount: number | null
  version: string | null
  cabinetModel: string | null
  status: string | null
  region: string | null
  network: string | null
  price: string | null
  condition: string | null
  confidence: number | null
  observedAt: string
  provenance: ArcadeInstallationProvenance[]
}

function encodeArcadeVenueCursor(cursor: ArcadeVenueCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

function decodeArcadeVenueCursor(cursor: string): { normalizedName: string; id: bigint } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('normalizedName' in parsed) ||
      typeof parsed.normalizedName !== 'string' ||
      !('id' in parsed) ||
      typeof parsed.id !== 'string' ||
      !/^[1-9]\d*$/.test(parsed.id)
    ) {
      throw new Error('Invalid cursor payload')
    }
    return { normalizedName: parsed.normalizedName, id: BigInt(parsed.id) }
  } catch {
    throw new ORPCError('BAD_REQUEST', { message: 'Invalid venue cursor' })
  }
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

function normalizeArcadeProvenance(
  value: Array<Record<string, unknown>>,
  fallback: { source: string; observedAt: Date; sourceUrl: string | null },
): ArcadeInstallationProvenance[] {
  const provenance = value.flatMap((item) => {
    const source = item.source
    const rawObservedAt = item.observedAt ?? item.observed_at
    const sourceUrl = item.sourceUrl ?? item.source_url
    const observedAt =
      rawObservedAt instanceof Date
        ? rawObservedAt
        : typeof rawObservedAt === 'string' && !Number.isNaN(Date.parse(rawObservedAt))
          ? new Date(rawObservedAt)
          : undefined

    if (typeof source !== 'string' || !observedAt) return []
    return [
      {
        source,
        observedAt: observedAt.toISOString(),
        sourceUrl: typeof sourceUrl === 'string' ? sourceUrl : null,
      },
    ]
  })

  if (provenance.length === 0) {
    provenance.push({
      source: fallback.source,
      observedAt: fallback.observedAt.toISOString(),
      sourceUrl: fallback.sourceUrl,
    })
  }

  const unique = new Map<string, ArcadeInstallationProvenance>()
  for (const item of provenance) {
    unique.set(`${item.source}\u0000${item.observedAt}\u0000${item.sourceUrl ?? ''}`, item)
  }

  return [...unique.values()].sort(
    (left, right) => left.source.localeCompare(right.source) || left.observedAt.localeCompare(right.observedAt),
  )
}

async function loadArcadeInstallations(venueIds: bigint[]) {
  const grouped = new Map<string, ArcadeInstallationResponse[]>()
  if (venueIds.length === 0) return grouped

  const rows = await db
    .select({
      id: arcadeInstallations.id,
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
      sourceUrl: arcadeInstallations.source_url,
      provenance: arcadeInstallations.provenance,
    })
    .from(arcadeInstallations)
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

  const logicalInstallations = new Map<
    string,
    {
      rows: Array<(typeof rows)[number]>
      provenance: ArcadeInstallationProvenance[]
    }
  >()

  for (const row of rows) {
    const identity = JSON.stringify([
      row.venueId.toString(),
      row.gameId,
      row.region,
      row.network,
      row.version,
      row.cabinetModel,
    ])
    const provenance = normalizeArcadeProvenance(row.provenance, {
      source: row.source,
      observedAt: row.observedAt,
      sourceUrl: row.sourceUrl,
    })
    const existing = logicalInstallations.get(identity)
    if (!existing) {
      logicalInstallations.set(identity, { rows: [row], provenance })
      continue
    }

    const merged = new Map<string, ArcadeInstallationProvenance>()
    for (const item of [...existing.provenance, ...provenance]) {
      merged.set(`${item.source}\u0000${item.observedAt}\u0000${item.sourceUrl ?? ''}`, item)
    }
    existing.provenance = [...merged.values()].sort(
      (left, right) => left.source.localeCompare(right.source) || left.observedAt.localeCompare(right.observedAt),
    )
    existing.rows.push(row)
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
  const selectFact = <T>(candidates: InstallationRow[], read: (candidate: InstallationRow) => T | null): T | null => {
    const selected = candidates.filter((candidate) => read(candidate) !== null).sort(compareCandidates)[0]
    return selected ? read(selected) : null
  }

  for (const { rows: candidates, provenance } of logicalInstallations.values()) {
    const winner = [...candidates].sort(compareCandidates)[0]
    const freshest = [...candidates].sort(compareFreshness)[0]
    const venueId = winner.venueId.toString()
    const installations = grouped.get(venueId) ?? []
    installations.push({
      id: winner.id.toString(),
      gameId: winner.gameId,
      gameName: winner.gameName,
      machineCount: selectFact(candidates, (candidate) => candidate.machineCount),
      version: winner.version,
      cabinetModel: winner.cabinetModel,
      status: selectFact(candidates, (candidate) => candidate.status),
      region: winner.region,
      network: winner.network,
      price: selectFact(candidates, (candidate) => candidate.price),
      condition: selectFact(candidates, (candidate) => candidate.condition),
      confidence: selectFact(candidates, (candidate) => candidate.confidence),
      observedAt: freshest.observedAt.toISOString(),
      provenance,
    })
    grouped.set(venueId, installations)
  }

  return grouped
}

function serializeArcadeVenue(
  venue: typeof arcadeVenues.$inferSelect,
  installations: Map<string, ArcadeInstallationResponse[]>,
) {
  const id = venue.id.toString()
  return {
    id,
    name: venue.name,
    countryCode: venue.country_code,
    region: venue.region,
    city: venue.city,
    address: venue.address,
    postalCode: venue.postal_code,
    phone: venue.phone,
    websiteUrl: venue.website_url,
    timezone: venue.timezone,
    latitude: venue.latitude,
    longitude: venue.longitude,
    installations: installations.get(id) ?? [],
  }
}

const arcadesHandler = {
  games: os.arcades.games.handler(async () => {
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
  venues: os.arcades.venues.handler(async ({ input }) => {
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

    if (input.cursor) {
      const cursor = decodeArcadeVenueCursor(input.cursor)
      filters.push(
        or(
          gt(arcadeVenues.normalized_name, cursor.normalizedName),
          and(eq(arcadeVenues.normalized_name, cursor.normalizedName), gt(arcadeVenues.id, cursor.id)),
        )!,
      )
    }

    const rows = await db
      .select()
      .from(arcadeVenues)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(asc(arcadeVenues.normalized_name), asc(arcadeVenues.id))
      .limit(input.limit + 1)

    const hasMore = rows.length > input.limit
    const page = hasMore ? rows.slice(0, input.limit) : rows
    const installations = await loadArcadeInstallations(page.map((venue) => venue.id))
    const last = page.at(-1)

    return {
      items: page.map((venue) => serializeArcadeVenue(venue, installations)),
      nextCursor:
        hasMore && last
          ? encodeArcadeVenueCursor({
              normalizedName: last.normalized_name,
              id: last.id.toString(),
            })
          : null,
    }
  }),
  venue: os.arcades.venue.handler(async ({ input }) => {
    const [venue] = await db
      .select()
      .from(arcadeVenues)
      .where(eq(arcadeVenues.id, BigInt(input.id)))
      .limit(1)
    if (!venue) {
      throw new ORPCError('NOT_FOUND', { message: 'Arcade venue not found' })
    }

    const installations = await loadArcadeInstallations([venue.id])
    return serializeArcadeVenue(venue, installations)
  }),
}

const chartOgImageHandler = {
  render: os.chartOgImage.render.handler(async ({ input }) => {
    const output = await renderChartOgImageOutput(input)
    if (!output) {
      throw new ORPCError('NOT_FOUND', { message: 'Chart not found' })
    }

    return output
  }),
}

const maimaiHandler = {
  fetchRecords: os.maimai.fetchRecords.handler(async ({ input }) => {
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
  authorize: os.lxns.authorize.handler(async ({ context }) => {
    const user = (context as Context).user
    if (!user) throw new Error('Unauthorized')
    const url = await lxnsService.generateAuthorizationUrl(user.id)
    return { url }
  }),
  status: os.lxns.status.handler(async ({ context }) => {
    const user = (context as Context).user
    if (!user) throw new Error('Unauthorized')
    return await lxnsService.getConnectionStatus(user.id)
  }),
  start: os.lxns.start.handler(async ({ context }) => {
    const user = (context as Context).user
    if (!user) throw new Error('Unauthorized')
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
  disconnect: os.lxns.disconnect.handler(async ({ context }) => {
    const user = (context as Context).user
    if (!user) throw new Error('Unauthorized')
    await lxnsService.disconnect(user.id)
    return { success: true }
  }),
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