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
    TRUNCATE dxdata.catalog_publication_provenance_manifests, dxdata.catalog_publication_receipts,
      dxdata.catalog_publications, dxdata.catalog_snapshots, dxdata.catalog_build_runs RESTART IDENTITY
  `)
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