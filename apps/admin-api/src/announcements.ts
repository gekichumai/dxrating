import {
  type AnnouncementCreateInput,
  type AnnouncementUpdateInput,
  BASE_LOCALE,
  LOCALE_FALLBACKS,
  SUPPORTED_LOCALES,
} from '@gekichumai/api-contract'
import { announcements } from '@gekichumai/backend/db-schema'
import { requestEdgeCache } from '@gekichumai/backend/edge-cache'
import { HttpClient } from '@gekichumai/backend/http-client'
import { desc, eq } from 'drizzle-orm'
import { Clock, Effect } from 'effect'
import { AdminApiConfigService } from './config'
import { AdminDatabase } from './db'
import type { Principal } from './require-admin'

/**
 * Announcement writes (gekichumai/meta#49, meta#50 L4). The rules every writer follows, from the announcements design:
 * - `revision` goes up only when the text or link changes, compared with sorted keys (jsonb reorders them);
 * - ending sets `ends_at` to now, and moves a not-yet-started `starts_at` just before it (the window CHECK);
 * - every write invalidates the public list's `announcements` Cache-Tag.
 */
export const ANNOUNCEMENTS_CACHE_TAG = 'announcements'

type Row = typeof announcements.$inferSelect
type Fields = Omit<AnnouncementCreateInput, never>

/** A JSON string with object keys sorted at every level, so jsonb's key order never counts as a change */
export const stableJson = (value: unknown): string =>
  JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )

const contentOf = (row: { title: unknown; body: unknown; link_url: string | null; link_label: unknown }) =>
  stableJson([row.title, row.body, row.link_url, row.link_label ?? null])

/** The columns a create or update writes, from validated input */
export const columnsFrom = (fields: Fields, now: Date) => ({
  severity: fields.severity,
  title: fields.title as Record<string, string>,
  body: fields.body as Record<string, string>,
  link_url: fields.link?.url ?? null,
  link_label: (fields.link?.label as Record<string, string> | null | undefined) ?? null,
  starts_at: fields.startsAt ? new Date(fields.startsAt) : now,
  ends_at: fields.endsAt ? new Date(fields.endsAt) : null,
  platforms: [...fields.platforms],
  regions: [...fields.regions],
  min_app_version: fields.minAppVersion,
  max_app_version: fields.maxAppVersion,
  dismissible: fields.dismissible,
})

/** The text each language would see: its own, then its fallbacks, then English */
export const resolveText = (text: Record<string, string>) =>
  Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => {
      const chain = [locale, ...(LOCALE_FALLBACKS[locale] ?? []), BASE_LOCALE]
      const found = chain.find((tag) => typeof text[tag] === 'string')
      return [locale, { text: text[found ?? BASE_LOCALE] ?? '', from: found ?? BASE_LOCALE }]
    }),
  )

export const toAdminAnnouncement = (row: Row) => ({
  id: row.id,
  revision: row.revision,
  severity: row.severity,
  title: row.title,
  body: row.body,
  link: row.link_url ? { url: row.link_url, label: row.link_label ?? null } : null,
  startsAt: row.starts_at.toISOString(),
  endsAt: row.ends_at?.toISOString() ?? null,
  platforms: row.platforms,
  regions: row.regions,
  minAppVersion: row.min_app_version,
  maxAppVersion: row.max_app_version,
  dismissible: row.dismissible,
  createdBy: row.created_by,
  updatedBy: row.updated_by,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
})

const preview = (columns: ReturnType<typeof columnsFrom>) => ({
  title: resolveText(columns.title),
  body: resolveText(columns.body),
  linkLabel: columns.link_label ? resolveText(columns.link_label) : null,
})

/** Invalidates the public list at the edge. A failure is reported, not thrown: the write itself already succeeded. */
const invalidateEdge = Effect.gen(function* () {
  const config = yield* AdminApiConfigService
  if (!config.CLOUDFLARE_ZONE_ID || !config.CLOUDFLARE_CACHE_PURGE_TOKEN) return 'skipped' as const
  return yield* requestEdgeCache(
    { zoneId: config.CLOUDFLARE_ZONE_ID, token: config.CLOUDFLARE_CACHE_PURGE_TOKEN },
    'invalidate_cache',
    [ANNOUNCEMENTS_CACHE_TAG],
  ).pipe(
    Effect.as('invalidated' as const),
    Effect.catchTag('EdgeCacheError', (error) =>
      Effect.as(Effect.logWarning('announcements edge invalidation failed', error), 'failed' as const),
    ),
  )
})

const now = Effect.map(Clock.currentTimeMillis, (ms) => new Date(ms))

export const listAnnouncements = Effect.gen(function* () {
  const db = yield* AdminDatabase
  const rows = yield* db.use('list announcements', (d) =>
    d.select().from(announcements).orderBy(desc(announcements.id)).limit(200),
  )
  return rows.map(toAdminAnnouncement)
})

export const createAnnouncement = (principal: Principal, input: AnnouncementCreateInput, dryRun: boolean) =>
  Effect.gen(function* () {
    const columns = columnsFrom(input, yield* now)
    if (dryRun)
      return { dryRun: true as const, preview: preview(columns), announcement: null, edgeCache: 'skipped' as const }
    const db = yield* AdminDatabase
    const [row] = yield* db.use('create announcement', (d) =>
      d
        .insert(announcements)
        .values({ ...columns, created_by: principal.actor, updated_by: principal.actor })
        .returning(),
    )
    const edgeCache = yield* invalidateEdge
    return { dryRun: false as const, preview: preview(columns), announcement: toAdminAnnouncement(row!), edgeCache }
  })

export const updateAnnouncement = (principal: Principal, input: AnnouncementUpdateInput, dryRun: boolean) =>
  Effect.gen(function* () {
    const db = yield* AdminDatabase
    const [current] = yield* db.use('read announcement', (d) =>
      d.select().from(announcements).where(eq(announcements.id, input.id)).limit(1),
    )
    if (!current) return null
    const at = yield* now
    const columns = columnsFrom(input, input.startsAt ? at : current.starts_at)
    const revision = contentOf(columns) === contentOf(current) ? current.revision : current.revision + 1
    if (dryRun)
      return {
        dryRun: true as const,
        preview: preview(columns),
        revision,
        announcement: null,
        edgeCache: 'skipped' as const,
      }
    const [row] = yield* db.use('update announcement', (d) =>
      d
        .update(announcements)
        .set({ ...columns, revision, updated_by: principal.actor, updated_at: at })
        .where(eq(announcements.id, input.id))
        .returning(),
    )
    const edgeCache = yield* invalidateEdge
    return {
      dryRun: false as const,
      preview: preview(columns),
      revision,
      announcement: toAdminAnnouncement(row!),
      edgeCache,
    }
  })

export const endAnnouncement = (principal: Principal, id: number) =>
  Effect.gen(function* () {
    const db = yield* AdminDatabase
    const [current] = yield* db.use('read announcement', (d) =>
      d.select().from(announcements).where(eq(announcements.id, id)).limit(1),
    )
    if (!current) return null
    const at = yield* now
    if (current.ends_at && current.ends_at <= at)
      return { announcement: toAdminAnnouncement(current), edgeCache: 'skipped' as const }
    // ends_at must stay after starts_at (CHECK): a notice that has not started yet starts a moment before it ends
    const startsAt = current.starts_at < at ? current.starts_at : new Date(at.getTime() - 1)
    const [row] = yield* db.use('end announcement', (d) =>
      d
        .update(announcements)
        .set({ starts_at: startsAt, ends_at: at, updated_by: principal.actor, updated_at: at })
        .where(eq(announcements.id, id))
        .returning(),
    )
    const edgeCache = yield* invalidateEdge
    return { announcement: toAdminAnnouncement(row!), edgeCache }
  })

export type AnnouncementServices = AdminDatabase | AdminApiConfigService | HttpClient