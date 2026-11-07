import { sql } from 'drizzle-orm'
import { Clock, Effect } from 'effect'
import { AdminDatabase } from '../db'
import { diffPublications } from './publication-diff'

/**
 * The data overview (gekichumai/meta#50 Phase 3, slice 5): the channel's current publication and its age, when each
 * source last fed the catalog, and what the latest publication changed. Read-only, no new storage. Failed source
 * attempts are not recorded by the assembly line (door D3), so the overview says so instead of showing zero failures.
 */
const iso = (value: unknown) => (value instanceof Date ? value : new Date(String(value))).toISOString()

export const catalogOverview = (input: { channel: string }) =>
  Effect.gen(function* () {
    const db = yield* AdminDatabase
    const now = yield* Clock.currentTimeMillis
    const [currentRows, sourceRows] = yield* Effect.all([
      db.use('read current publication', (d) =>
        d.execute(sql`
          SELECT receipt.revision::text AS revision, receipt.published_at, run.pipeline_version,
            run.song_count, run.sheet_count,
            EXISTS (
              SELECT 1 FROM dxdata.catalog_publication_provenance_manifests AS manifest
              WHERE manifest.channel = receipt.channel
                AND manifest.publication_fingerprint_sha256 = receipt.publication_fingerprint_sha256
            ) AS has_manifest,
            (SELECT count(*) FROM dxdata.catalog_publication_receipts AS other WHERE other.channel = receipt.channel)::int
              AS publication_count
          FROM dxdata.catalog_publication_receipts AS receipt
          INNER JOIN dxdata.catalog_build_runs AS run ON run.id = receipt.catalog_run_id
          WHERE receipt.channel = ${input.channel}
          ORDER BY receipt.revision DESC
          LIMIT 1
        `),
      ),
      db.use('read source freshness', (d) =>
        d.execute(sql`
          SELECT source.id, source.name, source.source_kind, source.authoritative, latest.scope,
            latest.started_at, latest.item_count, latest.observations
          FROM dxdata.catalog_sources AS source
          LEFT JOIN LATERAL (
            SELECT run.scope, max(run.started_at) AS started_at,
              (array_agg(run.item_count ORDER BY run.started_at DESC))[1] AS item_count,
              count(*)::int AS observations
            FROM dxdata.catalog_source_runs AS run
            WHERE run.source_id = source.id AND run.status = 'succeeded'
            GROUP BY run.scope
          ) AS latest ON true
          ORDER BY latest.started_at DESC NULLS LAST, source.id, latest.scope
        `),
      ),
    ])
    const row = currentRows.rows[0]
    const current = row
      ? {
          revision: Number(row.revision),
          publishedAt: iso(row.published_at),
          ageSeconds: Math.max(0, Math.round((now - Date.parse(iso(row.published_at))) / 1000)),
          pipelineVersion: String(row.pipeline_version),
          songCount: Number(row.song_count),
          sheetCount: Number(row.sheet_count),
          hasProvenanceManifest: row.has_manifest === true,
          publicationCount: Number(row.publication_count),
        }
      : null

    // The latest publication against the one before it: the summary only (the full list is /catalog/diff)
    const latestChange =
      current && current.publicationCount > 1
        ? yield* diffPublications({ channel: input.channel, offset: 0, limit: 1 }).pipe(
            Effect.map((diff) => ({
              from: diff.from.revision,
              to: diff.to.revision,
              summary: diff.summary,
              pathCounts: diff.pathCounts.slice(0, 8),
            })),
          )
        : null

    return {
      channel: input.channel,
      observedAt: new Date(now).toISOString(),
      current,
      latestChange,
      sources: sourceRows.rows.map((source) => ({
        id: String(source.id),
        name: String(source.name),
        kind: String(source.source_kind),
        authoritative: source.authoritative === true,
        scope: source.scope == null ? null : String(source.scope),
        lastObservedAt: source.started_at == null ? null : iso(source.started_at),
        ageSeconds:
          source.started_at == null ? null : Math.max(0, Math.round((now - Date.parse(iso(source.started_at))) / 1000)),
        itemCount: source.item_count == null ? null : Number(source.item_count),
        observations: source.observations == null ? 0 : Number(source.observations),
      })),
      failures: {
        recorded: false as const,
        note: 'The assembly line does not record failed source attempts yet (meta#50 door D3)',
      },
    }
  })