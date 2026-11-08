import { createHash } from 'node:crypto'
import type pg from 'pg'

/**
 * Test-only: the slice of the assembly line's `dxdata` schema the admin API reads, with the column names and types of
 * dxdata-assembly-line migrations 0001–0004 (constraints and foreign keys left out). The admin API never creates or
 * migrates this schema in production; the assembly line owns it. `IF NOT EXISTS` lets the tests also run against a
 * database that has the real migrations applied.
 */
const DDL = `
CREATE SCHEMA IF NOT EXISTS dxdata;
CREATE TABLE IF NOT EXISTS dxdata.catalog_build_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  api_schema_version INTEGER NOT NULL,
  pipeline_version TEXT NOT NULL,
  input_fingerprint_sha256 TEXT NOT NULL,
  source_updated_at TIMESTAMPTZ NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  song_count INTEGER NOT NULL DEFAULT 0,
  sheet_count INTEGER NOT NULL DEFAULT 0,
  failure_message TEXT
);
CREATE TABLE IF NOT EXISTS dxdata.catalog_snapshots (
  catalog_run_id BIGINT PRIMARY KEY,
  api_schema_version INTEGER NOT NULL,
  body_sha256 TEXT NOT NULL,
  byte_length BIGINT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/json; charset=utf-8',
  body_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dxdata.catalog_publications (
  channel TEXT PRIMARY KEY,
  catalog_run_id BIGINT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dxdata.catalog_publication_receipts (
  channel TEXT NOT NULL,
  publication_fingerprint_sha256 TEXT NOT NULL,
  catalog_run_id BIGINT NOT NULL,
  revision BIGINT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  legacy_git_commit_sha TEXT,
  PRIMARY KEY (channel, publication_fingerprint_sha256),
  UNIQUE (channel, revision)
);
CREATE TABLE IF NOT EXISTS dxdata.catalog_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  authoritative BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS dxdata.catalog_source_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'catalog',
  payload_sha256 TEXT NOT NULL,
  observation_key TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  item_count INTEGER,
  error TEXT
);
CREATE TABLE IF NOT EXISTS dxdata.canonical_songs (
  id TEXT PRIMARY KEY,
  legacy_song_id TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS dxdata.song_source_mappings (
  source_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  song_id TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (source_id, external_id)
);
CREATE TABLE IF NOT EXISTS dxdata.catalog_publication_provenance_manifests (
  channel TEXT NOT NULL,
  publication_fingerprint_sha256 TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  output_sha256 TEXT NOT NULL,
  manifest JSONB NOT NULL,
  PRIMARY KEY (channel, publication_fingerprint_sha256)
);
`

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

export const createCatalogFixtureSchema = async (pool: pg.Pool) => {
  await pool.query(DDL)
}

export const clearCatalogFixture = async (pool: pg.Pool) => {
  await pool.query(`
    TRUNCATE dxdata.catalog_publication_provenance_manifests, dxdata.catalog_publication_receipts, dxdata.canonical_songs, dxdata.song_source_mappings, dxdata.catalog_sources, dxdata.catalog_source_runs,
      dxdata.catalog_publications, dxdata.catalog_snapshots, dxdata.catalog_build_runs RESTART IDENTITY
  `)
}

/** Records a source and its succeeded observations (time, item count), as the assembly line does */
export const observeSourceFixture = async (
  pool: pg.Pool,
  source: { id: string; name: string; kind: string; authoritative?: boolean },
  observations: { at: string; items: number; status?: string }[],
) => {
  await pool.query(
    `INSERT INTO dxdata.catalog_sources (id, name, source_kind, authoritative) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [source.id, source.name, source.kind, source.authoritative ?? false],
  )
  for (const [index, observation] of observations.entries()) {
    const key = sha(`${source.id}-${observation.at}-${index}`)
    await pool.query(
      `INSERT INTO dxdata.catalog_source_runs
         (source_id, payload_sha256, observation_key, started_at, finished_at, status, item_count)
       VALUES ($1, $2, $2, $3, $3, $4, $5)`,
      [source.id, key, observation.at, observation.status ?? 'succeeded', observation.items],
    )
  }
}

/** Maps a public song ID to its legacy songId, as the catalog's canonical_songs does (other columns left out) */
export const mapSongFixture = async (pool: pg.Pool, id: string, legacySongId: string) => {
  await pool.query('INSERT INTO dxdata.canonical_songs (id, legacy_song_id) VALUES ($1, $2)', [id, legacySongId])
  await pool.query(
    `INSERT INTO dxdata.song_source_mappings (source_id, external_id, song_id) VALUES ('legacy_dxdata', $1, $2)`,
    [legacySongId, id],
  )
}

/** Renames a song's legacy ID the way the catalog does: the old mapping stays, inactive */
export const renameLegacySongFixture = async (pool: pg.Pool, id: string, legacySongId: string) => {
  await pool.query('UPDATE dxdata.canonical_songs SET legacy_song_id = $2 WHERE id = $1', [id, legacySongId])
  await pool.query(`UPDATE dxdata.song_source_mappings SET active = false WHERE song_id = $1`, [id])
  await pool.query(
    `INSERT INTO dxdata.song_source_mappings (source_id, external_id, song_id) VALUES ('legacy_dxdata', $1, $2)`,
    [legacySongId, id],
  )
}

/** Publishes a synthetic catalog `body` as the next revision of `channel`, the way the assembly line records it */
export const publishFixture = async (
  pool: pg.Pool,
  input: {
    channel?: string
    revision: number
    body: unknown
    publishedAt: string
    manifest?: unknown
    legacyGitCommitSha?: string | null
  },
) => {
  const channel = input.channel ?? 'production-v1'
  const text = JSON.stringify(input.body)
  const songs = (input.body as { songs?: { sheets?: unknown[] }[] }).songs ?? []
  const run = await pool.query<{ id: string }>(
    `INSERT INTO dxdata.catalog_build_runs
       (api_schema_version, pipeline_version, input_fingerprint_sha256, source_updated_at, generated_at, status,
        song_count, sheet_count)
     VALUES (1, $1, $2, $3, $3, 'published', $4, $5) RETURNING id::text`,
    [
      `assembly-line@${'a'.repeat(7)}`,
      sha(`input-${input.revision}`),
      input.publishedAt,
      songs.length,
      songs.reduce((n, song) => n + (song.sheets?.length ?? 0), 0),
    ],
  )
  const runId = run.rows[0]!.id
  await pool.query(
    `INSERT INTO dxdata.catalog_snapshots (catalog_run_id, api_schema_version, body_sha256, byte_length, body_text)
     VALUES ($1, 1, $2, $3, $4)`,
    [runId, sha(text), Buffer.byteLength(text), text],
  )
  const fingerprint = sha(`${channel}-${input.revision}`)
  await pool.query(
    `INSERT INTO dxdata.catalog_publication_receipts
       (channel, publication_fingerprint_sha256, catalog_run_id, revision, published_at, legacy_git_commit_sha)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [channel, fingerprint, runId, input.revision, input.publishedAt, input.legacyGitCommitSha ?? null],
  )
  await pool.query(
    `INSERT INTO dxdata.catalog_publications (channel, catalog_run_id, published_at) VALUES ($1, $2, $3)
     ON CONFLICT (channel) DO UPDATE SET catalog_run_id = EXCLUDED.catalog_run_id, published_at = EXCLUDED.published_at`,
    [channel, runId, input.publishedAt],
  )
  if (input.manifest !== undefined) {
    await pool.query(
      `INSERT INTO dxdata.catalog_publication_provenance_manifests
         (channel, publication_fingerprint_sha256, schema_version, generated_at, output_sha256, manifest)
       VALUES ($1, $2, 1, $3, $4, $5)`,
      [channel, fingerprint, input.publishedAt, sha(text), JSON.stringify(input.manifest)],
    )
  }
  return { runId, fingerprint }
}