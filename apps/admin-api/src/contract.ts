import { oc as contractBuilder } from '@orpc/contract'
import { openapi } from '@orpc/openapi'
import { AnnouncementCreateInputSchema, AnnouncementUpdateInputSchema } from '@gekichumai/api-contract'
import { z } from 'zod'

const oc = contractBuilder.errors({})

/**
 * The admin API contract (gekichumai/meta#50, Revision 2). It is served only by apps/admin-api at
 * admin.dxrating.net/api, behind Cloudflare Access, and its OpenAPI document is private to that host.
 */
export const PrincipalSchema = z.object({
  type: z.enum(['human', 'agent']),
  id: z.string(),
  /** `type:id`, the form written to `created_by` / `updated_by` and the audit log */
  actor: z.string(),
  scopes: z.array(z.string()),
})

const LocalizedSchema = z.record(z.string(), z.string())
const ResolvedSchema = z.record(z.string(), z.object({ text: z.string(), from: z.string() }))

export const AdminAnnouncementSchema = z.object({
  id: z.number().int(),
  revision: z.number().int(),
  severity: z.string(),
  title: LocalizedSchema,
  body: LocalizedSchema,
  link: z.object({ url: z.string(), label: LocalizedSchema.nullable() }).nullable(),
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  platforms: z.array(z.string()),
  regions: z.array(z.string()),
  minAppVersion: z.string().nullable(),
  maxAppVersion: z.string().nullable(),
  dismissible: z.boolean(),
  createdBy: z.string(),
  updatedBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const WriteResultSchema = z.object({
  dryRun: z.boolean(),
  /** What each language would see: its own text or the fallback it lands on */
  preview: z.object({ title: ResolvedSchema, body: ResolvedSchema, linkLabel: ResolvedSchema.nullable() }),
  /** null on a dry run */
  announcement: AdminAnnouncementSchema.nullable(),
  /** The revision the write has (update only); it goes up only when the text or link changes */
  revision: z.number().int().optional(),
  edgeCache: z.enum(['invalidated', 'skipped', 'failed']),
})

const dryRun = z.boolean().default(false).describe('Validate and preview without saving')

export const adminAnnouncementsContract = {
  list: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/announcements',
        summary: 'All announcements, newest first (scope announcements:read)',
        tags: ['announcements'],
      }),
    )
    .output(z.object({ announcements: z.array(AdminAnnouncementSchema) })),
  create: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/announcements',
        summary: 'Create an announcement (scope announcements:write)',
        tags: ['announcements'],
      }),
    )
    .input(z.object({ announcement: AnnouncementCreateInputSchema, dryRun }).strict())
    .output(WriteResultSchema),
  update: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/announcements/update',
        summary: 'Replace an announcement’s fields (scope announcements:write)',
        tags: ['announcements'],
      }),
    )
    .input(
      z
        .object({
          announcement: AnnouncementUpdateInputSchema,
          dryRun,
          ifUpdatedAt: z.iso
            .datetime({ offset: true })
            .optional()
            .describe('Refuse with CONFLICT if the stored updatedAt differs'),
        })
        .strict(),
    )
    .output(WriteResultSchema),
  end: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/announcements/end',
        summary: 'End an announcement now (scope announcements:write)',
        tags: ['announcements'],
      }),
    )
    .input(z.object({ id: z.number().int().positive() }).strict())
    .output(
      z.object({ announcement: AdminAnnouncementSchema, edgeCache: z.enum(['invalidated', 'skipped', 'failed']) }),
    ),
}

export const adminApiContract = {
  me: oc
    .meta(openapi({ method: 'GET', path: '/me', summary: 'The calling principal', tags: ['admin'] }))
    .output(PrincipalSchema),
  announcements: adminAnnouncementsContract,
}