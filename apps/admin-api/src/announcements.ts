import { audit } from './audit'
import {
  type AnnouncementCreateInput,
  type AnnouncementUpdateInput,
  ANNOUNCEMENT_SEVERITIES,
  LOCALE_FALLBACKS,
  resolveLocalized,
  SUPPORTED_LOCALES,
} from '@gekichumai/api-contract'
import { announcements } from '@gekichumai/backend/db-schema'
import { requestEdgeCache } from '@gekichumai/backend/edge-cache'
import { HttpClient } from '@gekichumai/backend/http-client'
import { desc, eq } from 'drizzle-orm'
import { Clock, Data, Effect } from 'effect'
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

/** The text each language would see, resolved exactly as the web and iOS clients do (shared resolveLocalized) */
export const resolveText = (text: Record<string, string>) =>
  Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => {
      const found = resolveLocalized(text, locale, LOCALE_FALLBACKS)
      return [locale, { text: found?.value ?? '', from: found?.locale ?? locale }]
    }),
  )

const severityRank = (severity: string) => ANNOUNCEMENT_SEVERITIES.indexOf(severity as never)

/**
 * A new revision makes clients show the notice again to people who dismissed it: when the text or link changes, or
 * when the severity rises (an info notice escalated to critical must reach those who dismissed the info one).
 */
export const needsNewRevision = (
  next: { severity: string; title: unknown; body: unknown; link_url: string | null; link_label: unknown },
  current: { severity: string; title: unknown; body: unknown; link_url: string | null; link_label: unknown },
) => contentOf(next) !== contentOf(current) || severityRank(next.severity) > severityRank(current.severity)

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

/** A write the API refuses as the caller's mistake (400) or because the row changed since they read it (409) */
export class AnnouncementRejected extends Data.TaggedError('AnnouncementRejected')<{
  readonly code: 'BAD_REQUEST' | 'CONFLICT'
  readonly message: string
}> {}

/** The schema checks the window as sent; this checks it as it will be stored (an empty start means now) */
const checkWindow = (columns: { starts_at: Date; ends_at: Date | null }) =>
  columns.ends_at && columns.ends_at <= columns.starts_at
    ? Effect.fail(
        new AnnouncementRejected({
          code: 'BAD_REQUEST',
          message: 'endsAt must be after the start (an empty start is now)',
        }),
      )
    : Effect.void

/**
 * The next updated_at: now, but always strictly after the stored value, so every write changes the ifUpdatedAt token
 * even when two writes land in the same millisecond.
 */
export const advance = (stored: Date, at: Date) => new Date(Math.max(at.getTime(), stored.getTime() + 1))

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
    yield* checkWindow(columns)
    if (dryRun) {
      yield* audit(principal, { action: 'announcements.create', dryRun: true, outcome: 'ok' })
      return { dryRun: true as const, preview: preview(columns), announcement: null, edgeCache: 'skipped' as const }
    }
    const db = yield* AdminDatabase
    const [row] = yield* db.use('create announcement', (d) =>
      d
        .insert(announcements)
        .values({ ...columns, created_by: principal.actor, updated_by: principal.actor })
        .returning(),
    )
    // Audited as soon as it is committed: a request cancelled during the edge purge below still leaves its entry
    yield* audit(principal, { action: 'announcements.create', target: row!.id, outcome: 'ok' })
    const edgeCache = yield* invalidateEdge
    return { dryRun: false as const, preview: preview(columns), announcement: toAdminAnnouncement(row!), edgeCache }
  })

export const updateAnnouncement = (
  principal: Principal,
  input: AnnouncementUpdateInput,
  dryRun: boolean,
  /** The `updatedAt` the caller last read; a different stored value means someone else saved since (409) */
  ifUpdatedAt?: string,
) =>
  Effect.gen(function* () {
    const db = yield* AdminDatabase
    const at = yield* now
    // One transaction with the row locked: two concurrent edits cannot both compute a revision from the same old row
    const outcome = yield* db.use('update announcement', (d) =>
      d.transaction(async (tx) => {
        const [current] = await tx.select().from(announcements).where(eq(announcements.id, input.id)).for('update')
        if (!current) return null
        if (ifUpdatedAt !== undefined && current.updated_at.toISOString() !== new Date(ifUpdatedAt).toISOString()) {
          return { conflict: true as const }
        }
        // An empty start means now: a live notice keeps its start, a scheduled one goes live now
        const columns = columnsFrom(input, current.starts_at < at ? current.starts_at : at)
        if (columns.ends_at && columns.ends_at <= columns.starts_at) return { invalidWindow: true as const }
        const revision = needsNewRevision(columns, current) ? current.revision + 1 : current.revision
        if (dryRun) return { columns, revision, row: null }
        const [row] = await tx
          .update(announcements)
          .set({ ...columns, revision, updated_by: principal.actor, updated_at: advance(current.updated_at, at) })
          .where(eq(announcements.id, input.id))
          .returning()
        return { columns, revision, row: row! }
      }),
    )
    if (!outcome) {
      yield* audit(principal, { action: 'announcements.update', target: input.id, dryRun, outcome: 'not_found' })
      return null
    }
    if ('conflict' in outcome) {
      return yield* new AnnouncementRejected({
        code: 'CONFLICT',
        message: 'Someone saved this announcement since you opened it; reload it',
      })
    }
    if ('invalidWindow' in outcome) return yield* checkWindow({ starts_at: new Date(1), ends_at: new Date(0) })
    const { columns, revision, row } = outcome
    yield* audit(principal, { action: 'announcements.update', target: input.id, dryRun, outcome: 'ok' })
    if (!row) {
      return {
        dryRun: true as const,
        preview: preview(columns),
        revision,
        announcement: null,
        edgeCache: 'skipped' as const,
      }
    }
    const edgeCache = yield* invalidateEdge
    return {
      dryRun: false as const,
      preview: preview(columns),
      revision,
      announcement: toAdminAnnouncement(row),
      edgeCache,
    }
  })

export const endAnnouncement = (principal: Principal, id: number) =>
  Effect.gen(function* () {
    const db = yield* AdminDatabase
    const at = yield* now
    const outcome = yield* db.use('end announcement', (d) =>
      d.transaction(async (tx) => {
        const [current] = await tx.select().from(announcements).where(eq(announcements.id, id)).for('update')
        if (!current) return null
        if (current.ends_at && current.ends_at <= at) return { row: current, changed: false }
        // ends_at must stay after starts_at (CHECK): a notice that has not started yet starts a moment before it ends
        const startsAt = current.starts_at < at ? current.starts_at : new Date(at.getTime() - 1)
        const [row] = await tx
          .update(announcements)
          .set({
            starts_at: startsAt,
            ends_at: at,
            updated_by: principal.actor,
            updated_at: advance(current.updated_at, at),
          })
          .where(eq(announcements.id, id))
          .returning()
        return { row: row!, changed: true }
      }),
    )
    yield* audit(principal, { action: 'announcements.end', target: id, outcome: outcome ? 'ok' : 'not_found' })
    if (!outcome) return null
    const edgeCache = outcome.changed ? yield* invalidateEdge : ('skipped' as const)
    return { announcement: toAdminAnnouncement(outcome.row), edgeCache }
  })

export type AnnouncementServices = AdminDatabase | AdminApiConfigService | HttpClient