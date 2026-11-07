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

const FieldChangeSchema = z.object({
  path: z.string(),
  before: z.json().optional().describe('Absent when the field is absent on the older side'),
  after: z.json().optional().describe('Absent when the field is absent on the newer side'),
})
const DiffSideSchema = z.object({
  revision: z.number().int(),
  fingerprint: sha256,
  publishedAt: z.string(),
  bodySha256: sha256,
})

export const CatalogDiffSchema = z.object({
  channel: z.string(),
  from: DiffSideSchema,
  to: DiffSideSchema,
  summary: z.object({
    songsAdded: z.number().int(),
    songsRemoved: z.number().int(),
    songsChanged: z.number().int(),
    sheetsAdded: z.number().int(),
    sheetsRemoved: z.number().int(),
    sheetsChanged: z.number().int(),
    fieldChanges: z.number().int(),
  }),
  pathCounts: z
    .array(z.object({ path: z.string(), count: z.number().int() }))
    .describe('Changes per path pattern, most first; a pattern is a valid `path` filter'),
  lists: z.array(
    z.object({
      key: z.string(),
      beforeCount: z.number().int(),
      afterCount: z.number().int(),
      added: z.array(z.json()),
      removed: z.array(z.json()),
    }),
  ),
  updateTime: z.object({ before: z.json().optional(), after: z.json().optional() }),
  path: z.string().nullable(),
  songsTotal: z.number().int(),
  songs: z.array(
    z.object({
      songId: z.string().describe('The song’s public ID (dsng_…), or songId in the legacy shape'),
      title: z.string(),
      kind: z.enum(['added', 'removed', 'changed']),
      fields: z.array(FieldChangeSchema),
      sheets: z.array(
        z.object({
          id: z.string().describe('The sheet’s public ID, or type:difficulty in the legacy shape'),
          type: z.string(),
          difficulty: z.string(),
          kind: z.enum(['added', 'removed', 'changed']),
          fields: z.array(FieldChangeSchema),
        }),
      ),
    }),
  ),
  nextOffset: z.number().int().nullable(),
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
  diff: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/catalog/diff',
        summary: 'Field-level changes between two publications of a channel (scope catalog:read)',
        description:
          'Published snapshots (song-catalog v1) match songs and sheets by public `id`, so a changed type or difficulty is a field change, not a removal plus an addition. Legacy dxdata.json bodies fall back to songId, and type + difficulty for sheets. Without `to`, the latest publication; without `from`, the one before `to`. Paged by song.',
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
          from: z.coerce.number().int().positive().optional(),
          to: z.coerce.number().int().positive().optional(),
          path: z.string().max(200).optional().describe('Only changes of this path pattern, from `pathCounts`'),
          offset: z.coerce.number().int().min(0).default(0),
          limit: z.coerce.number().int().min(1).max(200).default(50),
        })
        .strict(),
    )
    .output(CatalogDiffSchema),
}

export const adminApiContract = {
  me: oc
    .meta(openapi({ method: 'GET', path: '/me', summary: 'The calling principal', tags: ['admin'] }))
    .output(PrincipalSchema),
  announcements: adminAnnouncementsContract,
  catalog: adminCatalogContract,
}