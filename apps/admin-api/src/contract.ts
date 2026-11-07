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

const sha256 = z.string().regex(/^[0-9a-f]{64}$/)

export const PublicationSchema = z.object({
  revision: z.number().int().describe('The channel’s publication number'),
  fingerprint: sha256.describe('Publication fingerprint, unique within the channel'),
  publishedAt: z.string(),
  catalogRunId: z.string().describe('The assembly-line build run whose snapshot this publishes'),
  legacyGitCommitSha: z.string().nullable().describe('The dxrating commit that carried this dxdata.json, if any'),
  pipelineVersion: z.string(),
  apiSchemaVersion: z.number().int(),
  inputFingerprint: sha256,
  sourceUpdatedAt: z.string(),
  generatedAt: z.string(),
  songCount: z.number().int(),
  sheetCount: z.number().int(),
  bodySha256: sha256,
  byteLength: z.number().int(),
  hasProvenanceManifest: z.boolean(),
  current: z.boolean().describe('The publication the channel serves now'),
})

/** dxdata publications and provenance, read-only (gekichumai/meta#50 Phase 3). Scope catalog:read. */
export const adminCatalogContract = {
  publications: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/catalog/publications',
        summary: 'dxdata publications of a channel, newest first (scope catalog:read)',
        tags: ['catalog'],
      }),
    )
    .input(
      z
        .object({
          channel: z
            .string()
            .regex(/^[a-z][a-z0-9_-]*$/)
            .default('production-v1'),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          before: z.coerce.number().int().positive().optional().describe('Continue below this revision'),
        })
        .strict(),
    )
    .output(
      z.object({
        channel: z.string(),
        channels: z.array(z.string()),
        publications: z.array(PublicationSchema),
        nextBefore: z.number().int().nullable(),
      }),
    ),
}

export const adminApiContract = {
  me: oc
    .meta(openapi({ method: 'GET', path: '/me', summary: 'The calling principal', tags: ['admin'] }))
    .output(PrincipalSchema),
  announcements: adminAnnouncementsContract,
  catalog: adminCatalogContract,
}