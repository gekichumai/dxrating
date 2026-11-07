import {
  ANNOUNCEMENT_LOOKAHEAD_MS,
  announcementLocales,
  isSupportedLocale,
  type AdminAnnouncement,
  type AnnouncementCreateInput,
  type AnnouncementsListResponse,
  type AnnouncementUpdateInput,
  type PublicAnnouncement,
} from '@gekichumai/api-contract'
import { ORPCError } from '@orpc/server'
import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm'
import { Effect } from 'effect'
import type { AdminViewer } from '../admin/require-admin'
import { AppConfig } from '../config'
import { Database } from '../db/index'
import { announcements } from '../db/schema'
import * as Sentry from '@sentry/node'
import { requestEdgeCache } from './edge-cache'

/** The edge Cache-Tag of `GET /api/v1/announcements`; every write invalidates it */
export const ANNOUNCEMENTS_CACHE_TAG = 'announcements'

type AnnouncementRow = typeof announcements.$inferSelect

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 } as const

/** Keeps the languages of the shared list; the others are reported, not served */
const splitLocales = (text: Record<string, string>) => {
  const supported: Record<string, string> = {}
  const unsupported: string[] = []
  for (const [locale, value] of Object.entries(text)) {
    if (isSupportedLocale(locale)) supported[locale] = value
    else unsupported.push(locale)
  }
  return { supported, unsupported }
}

const toPublic = (row: AnnouncementRow): PublicAnnouncement => ({
  id: row.id,
  revision: row.revision,
  severity: row.severity,
  title: splitLocales(row.title).supported,
  body: splitLocales(row.body).supported,
  link: row.link_url
    ? { url: row.link_url, label: row.link_label ? splitLocales(row.link_label).supported : null }
    : null,
  startsAt: row.starts_at.toISOString(),
  endsAt: row.ends_at?.toISOString() ?? null,
  platforms: row.platforms as PublicAnnouncement['platforms'],
  regions: row.regions as PublicAnnouncement['regions'],
  minAppVersion: row.min_app_version,
  maxAppVersion: row.max_app_version,
  dismissible: row.dismissible,
})

const toAdmin = (row: AnnouncementRow): AdminAnnouncement => ({
  ...toPublic(row),
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  createdBy: row.created_by,
  updatedBy: row.updated_by,
  unsupportedLocales: [
    ...new Set([
      ...splitLocales(row.title).unsupported,
      ...splitLocales(row.body).unsupported,
      ...(row.link_label ? splitLocales(row.link_label).unsupported : []),
    ]),
  ],
})

/** Every announcement that has not ended and starts within the lookahead, most severe and newest first */
export const listPublicAnnouncements = Effect.fn('Announcements.listPublic')(function* (now: Date = new Date()) {
  const database = yield* Database
  const rows = yield* database.query('Announcements.listPublic', (db) =>
    db
      .select()
      .from(announcements)
      .where(
        and(
          or(isNull(announcements.ends_at), gt(announcements.ends_at, now)),
          lte(announcements.starts_at, new Date(now.getTime() + ANNOUNCEMENT_LOOKAHEAD_MS)),
        ),
      )
      .orderBy(desc(announcements.starts_at), desc(announcements.id)),
  )
  const sorted = rows.toSorted((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  const response: AnnouncementsListResponse = { locales: announcementLocales(), announcements: sorted.map(toPublic) }
  return response
})

export const listAdminAnnouncements = Effect.fn('Announcements.listAdmin')(function* () {
  const database = yield* Database
  const rows = yield* database.query('Announcements.listAdmin', (db) =>
    db.select().from(announcements).orderBy(desc(announcements.created_at), desc(announcements.id)),
  )
  return { announcements: rows.map(toAdmin) }
})

const columnsOf = (input: AnnouncementCreateInput) => ({
  severity: input.severity,
  title: input.title,
  body: input.body,
  link_url: input.link?.url ?? null,
  link_label: input.link?.label && Object.keys(input.link.label).length > 0 ? input.link.label : null,
  ends_at: input.endsAt ? new Date(input.endsAt) : null,
  platforms: [...new Set(input.platforms)],
  regions: [...new Set(input.regions)],
  min_app_version: input.minAppVersion,
  max_app_version: input.maxAppVersion,
  dismissible: input.dismissible,
})

const badWindow = () =>
  new ORPCError('BAD_REQUEST', { message: 'endsAt must be after startsAt', data: { reason: 'invalid_window' } })

/**
 * Tells the edge the public list changed. A failure is reported and does not fail the write: the edge refreshes its
 * copy within its TTL anyway.
 */
const invalidateEdgeCopy = Effect.fn('Announcements.invalidateEdge')(function* () {
  const { edgeCache } = yield* AppConfig
  if (!edgeCache) return
  yield* requestEdgeCache(edgeCache, 'invalidate_cache', [ANNOUNCEMENTS_CACHE_TAG]).pipe(
    Effect.timeout('5 seconds'),
    Effect.catch((error) => Effect.sync(() => Sentry.captureException(error))),
  )
})

export const createAnnouncement = Effect.fn('Announcements.create')(function* (
  admin: AdminViewer,
  input: AnnouncementCreateInput,
) {
  const database = yield* Database
  const startsAt = input.startsAt ? new Date(input.startsAt) : new Date()
  const columns = columnsOf(input)
  if (columns.ends_at && columns.ends_at <= startsAt) return yield* Effect.fail(badWindow())
  const [row] = yield* database.query('Announcements.create', (db) =>
    db
      .insert(announcements)
      .values({ ...columns, starts_at: startsAt, created_by: admin.id, updated_by: admin.id })
      .returning(),
  )
  yield* invalidateEdgeCopy()
  return toAdmin(row)
})

const notFound = () => new ORPCError('NOT_FOUND', { message: 'Announcement not found' })

/** What a viewer reads: a change here shows a dismissed announcement again */
const contentKey = (row: Pick<AnnouncementRow, 'title' | 'body' | 'link_url' | 'link_label'>) =>
  JSON.stringify([row.title, row.body, row.link_url, row.link_label])

/** Replaces an announcement's fields. `startsAt: null` keeps its start. */
export const updateAnnouncement = Effect.fn('Announcements.update')(function* (
  admin: AdminViewer,
  input: AnnouncementUpdateInput,
) {
  const database = yield* Database
  const row = yield* database.transaction(() =>
    Effect.gen(function* () {
      const [current] = yield* database.query('Announcements.lockForUpdate', (db) =>
        db.select().from(announcements).where(eq(announcements.id, input.id)).for('update'),
      )
      if (!current) return yield* Effect.fail(notFound())
      const columns = columnsOf(input)
      const startsAt = input.startsAt ? new Date(input.startsAt) : current.starts_at
      if (columns.ends_at && columns.ends_at <= startsAt) return yield* Effect.fail(badWindow())
      const changed = contentKey(current) !== contentKey(columns)
      const [updated] = yield* database.query('Announcements.update', (db) =>
        db
          .update(announcements)
          .set({
            ...columns,
            starts_at: startsAt,
            revision: changed ? current.revision + 1 : current.revision,
            updated_by: admin.id,
            updated_at: new Date(),
          })
          .where(eq(announcements.id, input.id))
          .returning(),
      )
      return updated
    }),
  )
  yield* invalidateEdgeCopy()
  return toAdmin(row)
})

/** Ends an announcement now. One that has not started yet is moved into the past, so it never shows. */
export const endAnnouncement = Effect.fn('Announcements.end')(function* (admin: AdminViewer, id: number) {
  const database = yield* Database
  const row = yield* database.transaction(() =>
    Effect.gen(function* () {
      const [current] = yield* database.query('Announcements.lockForEnd', (db) =>
        db.select().from(announcements).where(eq(announcements.id, id)).for('update'),
      )
      if (!current) return yield* Effect.fail(notFound())
      const now = new Date()
      if (current.ends_at && current.ends_at <= now) return current
      const startsAt = current.starts_at < now ? current.starts_at : new Date(now.getTime() - 1000)
      const [ended] = yield* database.query('Announcements.end', (db) =>
        db
          .update(announcements)
          .set({ starts_at: startsAt, ends_at: now, updated_by: admin.id, updated_at: now })
          .where(eq(announcements.id, id))
          .returning(),
      )
      return ended
    }),
  )
  yield* invalidateEdgeCopy()
  return toAdmin(row)
})