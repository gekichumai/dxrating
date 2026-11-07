import { sql } from 'drizzle-orm'
import { Effect } from 'effect'
import { AdminDatabase } from '../db'

/**
 * dxdata publications, read-only (gekichumai/meta#50, Phase 3 slice 1). The assembly line owns and writes the
 * `dxdata` schema; the admin API only SELECTs from it. A publication is a receipt: a numbered revision on a channel,
 * pointing at an immutable snapshot of the catalog body and the build run that produced it.
 */
export const DEFAULT_CHANNEL = 'production-v1'

export interface PublicationRow {
  revision: number
  fingerprint: string
  publishedAt: string
  catalogRunId: string
  legacyGitCommitSha: string | null
  pipelineVersion: string
  apiSchemaVersion: number
  inputFingerprint: string
  sourceUpdatedAt: string
  generatedAt: string
  songCount: number
  sheetCount: number
  bodySha256: string
  byteLength: number
  hasProvenanceManifest: boolean
  /** The channel's current publication: its highest revision, and the snapshot the channel serves */
  current: boolean
}

const iso = (value: unknown) => (value instanceof Date ? value : new Date(String(value))).toISOString()

export const toPublication = (row: Record<string, unknown>): PublicationRow => ({
  revision: Number(row.revision),
  fingerprint: String(row.fingerprint),
  publishedAt: iso(row.published_at),
  catalogRunId: String(row.catalog_run_id),
  legacyGitCommitSha: row.legacy_git_commit_sha == null ? null : String(row.legacy_git_commit_sha),
  pipelineVersion: String(row.pipeline_version),
  apiSchemaVersion: Number(row.api_schema_version),
  inputFingerprint: String(row.input_fingerprint_sha256),
  sourceUpdatedAt: iso(row.source_updated_at),
  generatedAt: iso(row.generated_at),
  songCount: Number(row.song_count),
  sheetCount: Number(row.sheet_count),
  bodySha256: String(row.body_sha256),
  byteLength: Number(row.byte_length),
  hasProvenanceManifest: row.has_manifest === true,
  current: row.current === true,
})

/** Newest first, `limit` at a time; `before` is the revision to continue below (the previous page's `nextBefore`) */
export const listPublications = (input: { channel: string; limit: number; before?: number | undefined }) =>
  Effect.gen(function* () {
    const db = yield* AdminDatabase
    const [channels, rows] = yield* Effect.all([
      db.use('list publication channels', (d) =>
        d.execute(sql`SELECT DISTINCT channel FROM dxdata.catalog_publication_receipts ORDER BY channel`),
      ),
      db.use('list publications', (d) =>
        d.execute(sql`
          SELECT
            receipt.revision::text AS revision,
            receipt.publication_fingerprint_sha256 AS fingerprint,
            receipt.published_at,
            receipt.catalog_run_id::text AS catalog_run_id,
            receipt.legacy_git_commit_sha,
            run.pipeline_version,
            run.api_schema_version,
            run.input_fingerprint_sha256,
            run.source_updated_at,
            run.generated_at,
            run.song_count,
            run.sheet_count,
            snapshot.body_sha256,
            snapshot.byte_length::text AS byte_length,
            EXISTS (
              SELECT 1 FROM dxdata.catalog_publication_provenance_manifests AS manifest
              WHERE manifest.channel = receipt.channel
                AND manifest.publication_fingerprint_sha256 = receipt.publication_fingerprint_sha256
            ) AS has_manifest,
            (
              receipt.catalog_run_id = publication.catalog_run_id
              AND receipt.revision = (
                SELECT max(latest.revision) FROM dxdata.catalog_publication_receipts AS latest
                WHERE latest.channel = receipt.channel
              )
            ) IS TRUE AS current
          FROM dxdata.catalog_publication_receipts AS receipt
          INNER JOIN dxdata.catalog_build_runs AS run ON run.id = receipt.catalog_run_id
          INNER JOIN dxdata.catalog_snapshots AS snapshot ON snapshot.catalog_run_id = receipt.catalog_run_id
          LEFT JOIN dxdata.catalog_publications AS publication ON publication.channel = receipt.channel
          WHERE receipt.channel = ${input.channel}
            AND (${input.before ?? null}::bigint IS NULL OR receipt.revision < ${input.before ?? null}::bigint)
          ORDER BY receipt.revision DESC
          LIMIT ${input.limit + 1}
        `),
      ),
    ])
    const publications = rows.rows.slice(0, input.limit).map(toPublication)
    return {
      channel: input.channel,
      channels: channels.rows.map((row) => String(row.channel)),
      publications,
      nextBefore: rows.rows.length > input.limit ? (publications.at(-1)?.revision ?? null) : null,
    }
  })