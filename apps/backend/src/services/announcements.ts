import {
  ANNOUNCEMENT_LOOKAHEAD_MS,
  announcementLocales,
  isSupportedLocale,
  type AnnouncementsListResponse,
  type PublicAnnouncement,
} from '@gekichumai/api-contract'
import { and, desc, gt, isNull, lte, or } from 'drizzle-orm'
import { Effect } from 'effect'
import { Database } from '../db/index'
import { announcements } from '../db/schema'

/**
 * The edge Cache-Tag of `GET /api/v1/announcements`. The admin API, the only writer, invalidates it after each
 * write; this backend purges it at deploy (EDGE_CACHE_TAGS). There is no in-process cache, so the edge copy is the
 * only one to refresh.
 */
export const ANNOUNCEMENTS_CACHE_TAG = 'announcements'

type AnnouncementRow = typeof announcements.$inferSelect

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 } as const

/** Keeps the languages of the shared list: a stored one that was dropped from it is not served */
const supportedOnly = (text: Record<string, string>) =>
  Object.fromEntries(Object.entries(text).filter(([locale]) => isSupportedLocale(locale)))

const toPublic = (row: AnnouncementRow): PublicAnnouncement => ({
  id: row.id,
  revision: row.revision,
  severity: row.severity,
  title: supportedOnly(row.title),
  body: supportedOnly(row.body),
  link: row.link_url ? { url: row.link_url, label: row.link_label ? supportedOnly(row.link_label) : null } : null,
  startsAt: row.starts_at.toISOString(),
  endsAt: row.ends_at?.toISOString() ?? null,
  platforms: row.platforms as PublicAnnouncement['platforms'],
  regions: row.regions as PublicAnnouncement['regions'],
  minAppVersion: row.min_app_version,
  maxAppVersion: row.max_app_version,
  dismissible: row.dismissible,
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