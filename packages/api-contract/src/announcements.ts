import { oc as contractBuilder } from '@orpc/contract'
import { openapi } from '@orpc/openapi'
import { z } from 'zod'
import { BASE_LOCALE, LOCALE_FALLBACKS, SUPPORTED_LOCALES } from './locales.ts'

const oc = contractBuilder.errors({})

/**
 * Global announcements (gekichumai/meta#49): notices the owner publishes to the web and the iOS app without a deploy.
 *
 * The public list is the same for every viewer, so the edge keeps one copy: it carries every language and every
 * target, and each client picks what applies to it (platform, region, app version, start time) and the viewer's
 * language through {@link AnnouncementsListResponseSchema}'s `locales` table.
 */

export const ANNOUNCEMENT_SEVERITIES = ['info', 'warning', 'critical'] as const
export const ANNOUNCEMENT_PLATFORMS = ['web', 'ios'] as const
export const ANNOUNCEMENT_REGIONS = ['jp', 'intl', 'cn'] as const

export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 80
export const ANNOUNCEMENT_BODY_MAX_LENGTH = 500
export const ANNOUNCEMENT_LINK_LABEL_MAX_LENGTH = 40
export const ANNOUNCEMENT_LINK_MAX_LENGTH = 2048

/** How far ahead the public list includes scheduled announcements, so clients show them on time without a purge */
export const ANNOUNCEMENT_LOOKAHEAD_MS = 24 * 60 * 60 * 1000

export const AnnouncementSeveritySchema = z.enum(ANNOUNCEMENT_SEVERITIES)
export const AnnouncementPlatformSchema = z.enum(ANNOUNCEMENT_PLATFORMS)
export const AnnouncementRegionSchema = z.enum(ANNOUNCEMENT_REGIONS)

/** Text per language as served: keys are tags of `locales.supported`, and `en` is always present */
export const AnnouncementTextSchema = z
  .record(z.string(), z.string())
  .describe(`Text per language tag (see \`locales.supported\`). "${BASE_LOCALE}" is always present.`)

const SemverSchema = z
  .string()
  .regex(/^\d+(\.\d+){0,2}$/, 'Use a version like 1.2 or 1.2.3')
  .describe('An app version, compared numerically part by part (1.10 > 1.9)')

export const PublicAnnouncementSchema = z.object({
  id: z.number().int(),
  /** Bumped when the text or link changes: a dismissal remembers `id` and `revision`, so a changed notice shows again */
  revision: z.number().int(),
  severity: AnnouncementSeveritySchema,
  title: AnnouncementTextSchema,
  body: AnnouncementTextSchema,
  link: z
    .object({
      url: z.string().describe('An https URL, or a path on dxrating.net such as /songs/…'),
      label: AnnouncementTextSchema.nullable(),
    })
    .nullable(),
  startsAt: z.string().describe('ISO 8601. Clients hide the announcement until then.'),
  endsAt: z.string().nullable().describe('ISO 8601, or null for no end'),
  platforms: z.array(AnnouncementPlatformSchema).describe('Empty: every platform'),
  regions: z
    .array(AnnouncementRegionSchema)
    .describe('Empty: every region. Matched against the viewer’s chosen region.'),
  minAppVersion: SemverSchema.nullable().describe('iOS only, inclusive'),
  maxAppVersion: SemverSchema.nullable().describe('iOS only, inclusive'),
  dismissible: z.boolean(),
})
export type PublicAnnouncement = z.infer<typeof PublicAnnouncementSchema>

export const AnnouncementLocalesSchema = z.object({
  supported: z.array(z.string()),
  /** Tried in order after the viewer's language and before `en` */
  fallbacks: z.record(z.string(), z.array(z.string())),
})

export const AnnouncementsListResponseSchema = z.object({
  locales: AnnouncementLocalesSchema,
  announcements: z.array(PublicAnnouncementSchema),
})
export type AnnouncementsListResponse = z.infer<typeof AnnouncementsListResponseSchema>

/** The `locales` block of the public list: the shared list and fallbacks, so the iOS app needs no update for one */
export const announcementLocales = (): z.infer<typeof AnnouncementLocalesSchema> => ({
  supported: [...SUPPORTED_LOCALES],
  fallbacks: Object.fromEntries(
    Object.entries(LOCALE_FALLBACKS).map(([locale, chain]) => [locale, [...(chain ?? [])]]),
  ),
})

export const announcementsContract = {
  list: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/announcements',
        summary: 'List current and upcoming announcements',
        description:
          'Every announcement that has not ended and starts within the next 24 hours, in every language and for every target. The response is the same for every caller and is cached at the edge for about a minute; revalidate with If-None-Match. Clients choose the ones that apply to them (platform, region, app version, start time) and the viewer’s language with `locales`: the viewer’s tag, then `locales.fallbacks[tag]`, then `en`.',
        tags: ['Announcements'],
        spec: (spec) => ({ ...spec, security: [] }),
      }),
    )
    .output(AnnouncementsListResponseSchema),
}

// --- Writes (admin only) ---

const localizedTextInput = (maxLength: number) =>
  z
    .partialRecord(z.enum(SUPPORTED_LOCALES), z.string().trim().max(maxLength))
    .transform((text) => Object.fromEntries(Object.entries(text).filter(([, value]) => value && value !== '')))
    .refine((text) => typeof text[BASE_LOCALE] === 'string', { message: `"${BASE_LOCALE}" is required` })

const isAllowedLink = (value: string) => {
  if (value.startsWith('/') && !value.startsWith('//')) return true
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

const AnnouncementLinkInputSchema = z
  .object({
    url: z
      .string()
      .trim()
      .max(ANNOUNCEMENT_LINK_MAX_LENGTH)
      .refine(isAllowedLink, { message: 'Use an https URL or a path starting with /' }),
    label: localizedTextInput(ANNOUNCEMENT_LINK_LABEL_MAX_LENGTH).nullable().optional(),
  })
  .strict()

const compareVersions = (a: string, b: string) => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const difference = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

const AnnouncementFieldsSchema = z
  .object({
    severity: AnnouncementSeveritySchema,
    title: localizedTextInput(ANNOUNCEMENT_TITLE_MAX_LENGTH),
    body: localizedTextInput(ANNOUNCEMENT_BODY_MAX_LENGTH),
    link: AnnouncementLinkInputSchema.nullable(),
    startsAt: z.iso.datetime({ offset: true }).nullable().describe('null: now'),
    endsAt: z.iso.datetime({ offset: true }).nullable(),
    platforms: z.array(AnnouncementPlatformSchema).max(ANNOUNCEMENT_PLATFORMS.length),
    regions: z.array(AnnouncementRegionSchema).max(ANNOUNCEMENT_REGIONS.length),
    minAppVersion: SemverSchema.nullable(),
    maxAppVersion: SemverSchema.nullable(),
    dismissible: z.boolean(),
  })
  .strict()

const withConsistentBounds = <T extends z.ZodType<z.infer<typeof AnnouncementFieldsSchema>>>(schema: T) =>
  schema
    .refine((fields) => !fields.startsAt || !fields.endsAt || Date.parse(fields.startsAt) < Date.parse(fields.endsAt), {
      message: 'endsAt must be after startsAt',
      path: ['endsAt'],
    })
    .refine(
      (fields) =>
        !fields.minAppVersion ||
        !fields.maxAppVersion ||
        compareVersions(fields.minAppVersion, fields.maxAppVersion) <= 0,
      { message: 'maxAppVersion must not be below minAppVersion', path: ['maxAppVersion'] },
    )

export const AnnouncementCreateInputSchema = withConsistentBounds(AnnouncementFieldsSchema)
export type AnnouncementCreateInput = z.infer<typeof AnnouncementCreateInputSchema>

export const AnnouncementUpdateInputSchema = withConsistentBounds(
  AnnouncementFieldsSchema.extend({ id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER) }),
)
export type AnnouncementUpdateInput = z.infer<typeof AnnouncementUpdateInputSchema>

export const AdminAnnouncementSchema = PublicAnnouncementSchema.extend({
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  /** Stored languages that are no longer supported; ignored on read and dropped on the next save */
  unsupportedLocales: z.array(z.string()),
})
export type AdminAnnouncement = z.infer<typeof AdminAnnouncementSchema>

/** Every admin route carries these tags; `internal` keeps it out of `/spec.json` */
export const ADMIN_ROUTE_TAGS = ['internal', 'admin']

const AnnouncementIdInputSchema = z.object({ id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER) })

export const adminAnnouncementsContract = {
  list: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/admin/announcements',
        summary: 'List every announcement',
        tags: ADMIN_ROUTE_TAGS,
      }),
    )
    .output(z.object({ announcements: z.array(AdminAnnouncementSchema) })),
  create: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/admin/announcements',
        summary: 'Create an announcement',
        tags: ADMIN_ROUTE_TAGS,
      }),
    )
    .input(AnnouncementCreateInputSchema)
    .output(AdminAnnouncementSchema),
  update: oc
    .meta(
      openapi({
        // POST rather than PUT: the API's CORS policy allows GET and POST only
        method: 'POST',
        path: '/admin/announcements/{id}',
        summary: 'Replace an announcement',
        tags: ADMIN_ROUTE_TAGS,
      }),
    )
    .input(AnnouncementUpdateInputSchema)
    .output(AdminAnnouncementSchema),
  end: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/admin/announcements/{id}/end',
        summary: 'End an announcement now',
        tags: ADMIN_ROUTE_TAGS,
      }),
    )
    .input(AnnouncementIdInputSchema)
    .output(AdminAnnouncementSchema),
}