import { resolveLocalized, type PublicAnnouncement } from '@gekichumai/api-contract'

/** Dismissed announcements, as `{ [id]: revision }`: an edit that bumps the revision shows the notice again */
export const DISMISSED_ANNOUNCEMENTS_STORAGE_KEY = 'dxrating.announcements.dismissed'

/** At most this many show at once, most severe first */
export const MAX_VISIBLE_ANNOUNCEMENTS = 2

export type DismissedAnnouncements = Readonly<Record<string, number>>

export interface AnnouncementViewer {
  readonly platform: 'web' | 'ios'
  readonly region: string
  readonly now: number
  readonly dismissed: DismissedAnnouncements
}

/** Whether an announcement is meant for this viewer now, before dismissal */
export function appliesTo(announcement: PublicAnnouncement, viewer: Omit<AnnouncementViewer, 'dismissed'>): boolean {
  if (Date.parse(announcement.startsAt) > viewer.now) return false
  if (announcement.endsAt && Date.parse(announcement.endsAt) <= viewer.now) return false
  if (announcement.platforms.length > 0 && !announcement.platforms.includes(viewer.platform)) return false
  if (announcement.regions.length > 0 && !(announcement.regions as readonly string[]).includes(viewer.region)) {
    return false
  }
  return true
}

export const isDismissed = (announcement: PublicAnnouncement, dismissed: DismissedAnnouncements) =>
  announcement.dismissible && dismissed[announcement.id] === announcement.revision

/** The announcements to show, in the server's order (most severe, then newest, first) */
export function visibleAnnouncements(
  announcements: readonly PublicAnnouncement[],
  viewer: AnnouncementViewer,
): PublicAnnouncement[] {
  return announcements
    .filter((announcement) => appliesTo(announcement, viewer) && !isDismissed(announcement, viewer.dismissed))
    .slice(0, MAX_VISIBLE_ANNOUNCEMENTS)
}

/** An announcement's text in the viewer's language, or a fallback's, with the language it is in */
export function localizeAnnouncement(
  announcement: PublicAnnouncement,
  locale: string,
  fallbacks?: Readonly<Partial<Record<string, readonly string[]>>>,
) {
  const title = resolveLocalized(announcement.title, locale, fallbacks)
  const body = resolveLocalized(announcement.body, locale, fallbacks)
  const linkLabel = announcement.link?.label ? resolveLocalized(announcement.link.label, locale, fallbacks) : null
  return { title, body, linkLabel }
}

export function readDismissed(storage: Pick<Storage, 'getItem'> | undefined): DismissedAnnouncements {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(DISMISSED_ANNOUNCEMENTS_STORAGE_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => Number.isInteger(entry[1])),
    )
  } catch {
    return {}
  }
}

/**
 * Remembers a dismissal, and forgets the ones of announcements the server no longer serves, so the stored map stays
 * as small as the list.
 */
export function writeDismissed(
  storage: Pick<Storage, 'setItem'> | undefined,
  dismissed: DismissedAnnouncements,
  served: readonly PublicAnnouncement[],
): DismissedAnnouncements {
  const servedIds = new Set(served.map((announcement) => String(announcement.id)))
  const pruned = Object.fromEntries(Object.entries(dismissed).filter(([id]) => servedIds.has(id)))
  try {
    storage?.setItem(DISMISSED_ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(pruned))
  } catch {
    // private mode or a full quota: the dismissal lasts for this visit
  }
  return pruned
}

/** Whether a link stays on the site (a path), so it opens in place rather than in a new tab */
export const isSiteLink = (url: string) => url.startsWith('/') && !url.startsWith('//')