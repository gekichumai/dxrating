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
  /**
   * Whether the catalog differs from the previous revision's, ignoring the top-level `updatedAt` (`updateTime` in the
   * legacy shape) the assembly line stamps on every build. `null` for the channel's first publication.
   */
  changedFromPrevious: boolean | null
}

/**
 * The assembly line serializes a catalog deterministically but stamps `updatedAt` with the build time, so the body hash
 * differs on every hourly publication even when nothing else did. The content hash is the body's MD5 with that first
 * top-level stamp cut out, computed in Postgres so the ~9 MB bodies never leave the database. It is only compared for
 * equality. A snapshot is immutable, so its content hash is kept, keyed by body hash.
 */
const BUILD_STAMP = String.raw`"(updatedAt|updateTime)"\s*:\s*"[^"]*"`
const CONTENT_HASH_CACHE_SIZE = 5000
const contentHashes = new Map<string, string>()

/** Test-only: forget computed content hashes */
export const clearContentHashCache = () => contentHashes.clear()

const contentHashesOf = (bodySha256s: string[]) =>
  Effect.gen(function* () {
    const missing = [...new Set(bodySha256s)].filter((sha) => !contentHashes.has(sha))
    if (missing.length > 0) {
      const db = yield* AdminDatabase
      const rows = yield* db.use('hash publication contents', (d) =>
        d.execute(sql`
          SELECT DISTINCT ON (body_sha256) body_sha256,
            md5(regexp_replace(body_text, ${BUILD_STAMP}, '')) AS content_hash
          FROM dxdata.catalog_snapshots
          WHERE body_sha256 IN (${sql.join(
            missing.map((sha) => sql`${sha}`),
            sql`, `,
          )})
        `),
      )
      for (const row of rows.rows) contentHashes.set(String(row.body_sha256), String(row.content_hash))
      while (contentHashes.size > CONTENT_HASH_CACHE_SIZE) contentHashes.delete(contentHashes.keys().next().value!)
    }
    return (sha: string) => contentHashes.get(sha)
  })

const iso = (value: unknown) => (value instanceof Date ? value : new Date(String(value))).toISOString()

export const toPublication = (row: Record<string, unknown>): Omit<PublicationRow, 'changedFromPrevious'> => ({
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
    // The query reads one row past the page: it says whether there is an older page, and it is the previous revision
    // of the page's last row, so that row's changedFromPrevious needs no extra lookup.
    const all = rows.rows.map(toPublication)
    const contentHash = yield* contentHashesOf(all.map((p) => p.bodySha256))
    const publications: PublicationRow[] = all.slice(0, input.limit).map((p, index) => {
      const previous = all[index + 1]
      const [mine, theirs] = previous ? [contentHash(p.bodySha256), contentHash(previous.bodySha256)] : []
      return {
        ...p,
        changedFromPrevious: !previous
          ? null
          : p.bodySha256 === previous.bodySha256
            ? false
            : mine === undefined || theirs === undefined
              ? true
              : mine !== theirs,
      }
    })
    return {
      channel: input.channel,
      channels: channels.rows.map((row) => String(row.channel)),
      publications,
      nextBefore: rows.rows.length > input.limit ? (publications.at(-1)?.revision ?? null) : null,
    }
  })