import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  CHART_REPORT_CATEGORY_KEYS,
  CHART_REPORT_FIELD_KEYS,
  CHART_REPORT_JSON_SNAPSHOT_MAX_BYTES,
  type ChartReportCategoryKey,
  type ChartReportFieldKey,
  type ChartReportJsonSnapshot,
  normalizeChartReportJsonSnapshot,
} from '../chart-reports/chart-report-domain.js'

const DATABASE_NAME = 'dxrating_chart_report_migration_test'
const RUNTIME_ROLE = 'dxrating_chart_report_runtime_test'
const EXPANSION_MIGRATION_TAG = '0023_add_chart_reports'
const PROTECTION_MIGRATION_TAG = '0024_protect_chart_reports'

const configuredDatabaseUrl = new URL(process.env.DATABASE_URL!)
if (configuredDatabaseUrl.pathname !== '/dxrating_test') {
  throw new Error('Chart-report migration tests require the configured dxrating_test database')
}

const adminDatabaseUrl = new URL(configuredDatabaseUrl)
adminDatabaseUrl.pathname = '/postgres'
const migrationDatabaseUrl = new URL(configuredDatabaseUrl)
migrationDatabaseUrl.pathname = `/${DATABASE_NAME}`
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const migrations = readMigrationFiles({ migrationsFolder })

const applyStatements = async (client: PoolClient, statements: string[]) => {
  await client.query('BEGIN')
  try {
    for (const statement of statements) await client.query(statement)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

const insertUser = async (client: PoolClient, id: string, role: 'user' | 'admin' = 'user') => {
  await client.query(`INSERT INTO "user" (id, name, email, role) VALUES ($1, $2, $3, $4)`, [
    id,
    id,
    `${id}@example.test`,
    role,
  ])
}

type ReportOverrides = Partial<{
  reporterUserId: string
  stableSongId: string
  stableChartId: string
  publicationChannel: string
  publicationCatalogRunId: string
  publicationRevision: string
  publicationFingerprintSha256: string
  fieldKey: string
  category: string
  currentValue: unknown
  proposedValue: unknown
  explanation: string
  sourceUrls: readonly (string | null)[]
  createdAt: string
}>

const insertReport = async (client: Pool | PoolClient, overrides: ReportOverrides = {}) => {
  const values = {
    reporterUserId: 'reporter-user',
    stableSongId: 'dsng_23456789ab',
    stableChartId: 'dsht_23456789ab',
    publicationChannel: 'production-v1',
    publicationCatalogRunId: '17',
    publicationRevision: '4',
    publicationFingerprintSha256: 'a'.repeat(64),
    fieldKey: 'chart.level',
    category: 'incorrect_value',
    currentValue: '13+',
    proposedValue: '14',
    explanation: 'The displayed chart value does not match the cited official source.',
    sourceUrls: ['https://evidence.example.test/chart/17'],
    createdAt: '2000-01-01T00:00:00.000Z',
    ...overrides,
  }

  return client.query<{
    readonly id: string
    readonly state: string
    readonly created_at: Date
    readonly closed_at: Date | null
  }>(
    `INSERT INTO chart_reports (
       reporter_user_id,
       stable_song_id,
       stable_chart_id,
       publication_channel,
       publication_catalog_run_id,
       publication_revision,
       publication_fingerprint_sha256,
       target_field_key,
       category,
       current_value,
       proposed_value,
       explanation,
       source_urls,
       created_at
     ) VALUES (
       $1, $2, $3, $4, $5::bigint, $6::bigint, $7, $8, $9,
       $10::jsonb, $11::jsonb, $12, $13::text[], $14::timestamptz
     )
     RETURNING id::text, state, created_at, closed_at`,
    [
      values.reporterUserId,
      values.stableSongId,
      values.stableChartId,
      values.publicationChannel,
      values.publicationCatalogRunId,
      values.publicationRevision,
      values.publicationFingerprintSha256,
      values.fieldKey,
      values.category,
      JSON.stringify(values.currentValue),
      JSON.stringify(values.proposedValue),
      values.explanation,
      values.sourceUrls,
      values.createdAt,
    ],
  )
}

const supportedValues: Readonly<Record<ChartReportFieldKey, ChartReportJsonSnapshot>> = {
  'song.title': 'Song title',
  'song.artist': 'Artist',
  'song.category': 'maimai',
  'song.bpm': 180.125,
  'song.image_name': 'song-image.png',
  'song.is_new': true,
  'song.is_locked': false,
  'song.version': 'CiRCLE PLUS',
  'chart.type': 'dx',
  'chart.difficulty': 'master',
  'chart.level': '14+',
  'chart.internal_level': 14.875,
  'chart.multiver_internal_levels': { CiRCLE: 14.875, 'CiRCLE PLUS': 15 },
  'chart.note_designer': null,
  'chart.note_counts.tap': 400,
  'chart.note_counts.hold': null,
  'chart.note_counts.slide': 100,
  'chart.note_counts.touch': 50,
  'chart.note_counts.break': 10,
  'chart.note_counts.total': 560,
  'chart.regions.jp': true,
  'chart.regions.intl': true,
  'chart.regions.cn': false,
  'chart.version': 'CiRCLE PLUS',
  'chart.release_date': null,
  'chart.internal_id': 10_001,
  'chart.is_special': false,
  'chart.comment': null,
}

const exactSizeNumberMap = () => {
  const entries = Array.from({ length: 20 }, (_, index) => [
    `k${index.toString().padStart(2, '0')}_${'x'.repeat(190)}`,
    12.345,
  ]) as Array<[string, number]>
  const provisional = Object.fromEntries(entries)
  const missingBytes = CHART_REPORT_JSON_SNAPSHOT_MAX_BYTES - Buffer.byteLength(JSON.stringify(provisional), 'utf8')
  const [lastKey, lastValue] = entries.at(-1)!
  delete provisional[lastKey]
  provisional[`${lastKey}${'x'.repeat(missingBytes)}`] = lastValue
  if (Buffer.byteLength(JSON.stringify(provisional), 'utf8') !== CHART_REPORT_JSON_SNAPSHOT_MAX_BYTES) {
    throw new Error('Exact-size chart-report map fixture is invalid')
  }
  return provisional
}

type ExplainNode = {
  readonly 'Actual Rows'?: number
  readonly 'Node Type': string
  readonly 'Index Name'?: string
  readonly 'Sort Method'?: string
  readonly 'Sort Space Type'?: string
  readonly 'Sort Space Used'?: number
  readonly Plans?: readonly ExplainNode[]
}

const flattenPlan = (node: ExplainNode): ExplainNode[] => [node, ...(node.Plans?.flatMap(flattenPlan) ?? [])]

describe('chart-report persistence migrations', () => {
  const adminPool = new Pool({ connectionString: adminDatabaseUrl.toString() })
  const migrationPool = new Pool({ connectionString: migrationDatabaseUrl.toString() })
  let expansionIndex = -1
  let protectionIndex = -1

  beforeAll(async () => {
    await adminPool.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`)
    await adminPool.query(`DROP ROLE IF EXISTS ${RUNTIME_ROLE}`)
    await adminPool.query(`CREATE ROLE ${RUNTIME_ROLE} NOLOGIN`)
    await adminPool.query(`CREATE DATABASE ${DATABASE_NAME}`)

    const journal = await import('../../drizzle/meta/_journal.json', { with: { type: 'json' } })
    expansionIndex = journal.default.entries.findIndex((entry) => entry.tag === EXPANSION_MIGRATION_TAG)
    protectionIndex = journal.default.entries.findIndex((entry) => entry.tag === PROTECTION_MIGRATION_TAG)
    expect(expansionIndex).toBeGreaterThan(0)
    expect(protectionIndex).toBe(expansionIndex + 1)

    const client = await migrationPool.connect()
    try {
      for (const migration of migrations.slice(0, expansionIndex)) await applyStatements(client, migration.sql)
      await insertUser(client, 'reporter-user')
      await insertUser(client, 'closer-user', 'admin')
      await applyStatements(client, migrations[expansionIndex]!.sql)

      // Expansion only creates an unused empty table. The previous backend's
      // user writes remain valid if rollout pauses before protection.
      await insertUser(client, 'mixed-version-user')
      await client.query(`UPDATE "user" SET name = 'Mixed Version Updated' WHERE id = 'mixed-version-user'`)

      await client.query(`
        INSERT INTO "user" (id, name, email, role)
        SELECT 'plan-reporter-' || value,
               'Plan Reporter ' || value,
               'plan-reporter-' || value || '@example.test',
               'user'
        FROM generate_series(0, 9) value
      `)
      await client.query(`
        INSERT INTO chart_reports (
          reporter_user_id,
          stable_song_id,
          stable_chart_id,
          publication_channel,
          publication_catalog_run_id,
          publication_revision,
          publication_fingerprint_sha256,
          target_field_key,
          category,
          current_value,
          proposed_value,
          explanation,
          source_urls,
          state,
          created_at,
          closed_by_user_id,
          closed_at,
          close_note
        )
        SELECT 'plan-reporter-' || (value % 10),
               'dsng_23456789a' || CASE value % 4 WHEN 0 THEN 'b' WHEN 1 THEN 'c' WHEN 2 THEN 'd' ELSE 'e' END,
               'dsht_23456789a' || CASE value % 4 WHEN 0 THEN 'b' WHEN 1 THEN 'c' WHEN 2 THEN 'd' ELSE 'e' END,
               'production-v1',
               100 + (value % 5),
               1 + (value % 5),
               md5(value::text) || md5(value::text),
               CASE value % 4
                 WHEN 0 THEN 'chart.level'
                 WHEN 1 THEN 'song.title'
                 WHEN 2 THEN 'song.artist'
                 ELSE 'chart.version'
               END,
               CASE value % 4
                 WHEN 0 THEN 'incorrect_value'
                 WHEN 1 THEN 'missing_value'
                 WHEN 2 THEN 'outdated_value'
                 ELSE 'other'
               END,
               to_jsonb('current-' || value),
               to_jsonb('proposed-' || value),
               'Representative report ' || value,
               '{}'::text[],
               CASE WHEN value % 5 = 0 THEN 'closed' ELSE 'open' END,
               timestamp with time zone '2026-01-01 00:00:00+00' + value * interval '1 millisecond',
               CASE WHEN value % 5 = 0 THEN 'closer-user' ELSE NULL END,
               CASE WHEN value % 5 = 0
                 THEN timestamp with time zone '2026-01-02 00:00:00+00' + value * interval '1 millisecond'
                 ELSE NULL
               END,
               NULL
        FROM generate_series(1, 20000) value
      `)

      await applyStatements(client, migrations[protectionIndex]!.sql)
      for (const migration of migrations.slice(protectionIndex + 1)) await applyStatements(client, migration.sql)
    } finally {
      client.release()
    }
  }, 120_000)

  afterAll(async () => {
    await migrationPool.end()
    await adminPool.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`)
    await adminPool.query(`DROP ROLE IF EXISTS ${RUNTIME_ROLE}`)
    await adminPool.end()
  })

  it('uses an adjacent additive expansion and protection migration with complete retained identities', async () => {
    const expansionSource = await readFile(path.join(migrationsFolder, `${EXPANSION_MIGRATION_TAG}.sql`), 'utf8')
    const protectionSource = await readFile(path.join(migrationsFolder, `${PROTECTION_MIGRATION_TAG}.sql`), 'utf8')

    expect(expansionSource).toContain('CREATE TABLE "chart_reports"')
    expect(expansionSource).toContain('DEFAULT gen_random_uuid()')
    expect(expansionSource).toContain('"publication_catalog_run_id" bigint NOT NULL')
    expect(expansionSource).toContain('"source_urls" text[] DEFAULT')
    expect(expansionSource).toContain('ON DELETE restrict')
    expect(expansionSource).not.toMatch(/\$[0-9]+/)
    expect(expansionSource).not.toMatch(/(?:^|\n)\s*(?:DROP|TRUNCATE|DELETE FROM|UPDATE\s+\S+\s+SET)\b/im)
    expect(expansionSource).not.toMatch(/\bREFERENCES\s+"?dxdata\b/i)
    expect(expansionSource).not.toMatch(/\b(?:bytea|blob)\b/i)
    expect(expansionSource).not.toMatch(/CREATE\s+INDEX\s+CONCURRENTLY/i)

    expect(protectionSource).toContain('BEFORE INSERT OR UPDATE OR DELETE')
    expect(protectionSource).toContain('chart_reports_submission_immutable_guard')
    expect(protectionSource).toContain('chart_reports_number_map_guard')
    expect(protectionSource).toContain('chart_reports_source_url_guard')
    expect(protectionSource).toContain('NEW.created_at := clock_timestamp()::timestamptz(3)')
    expect(protectionSource).toContain('NEW.closed_at := clock_timestamp()::timestamptz(3)')
    expect(protectionSource).toContain('REVOKE ALL PRIVILEGES ON TABLE "public"."chart_reports" FROM PUBLIC')
    expect(protectionSource).not.toMatch(/\$[0-9]+/)

    const columns = await migrationPool.query<{
      readonly column_name: string
      readonly data_type: string
      readonly is_nullable: string
      readonly column_default: string | null
    }>(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'chart_reports'
       ORDER BY ordinal_position`,
    )
    expect(columns.rows.map(({ column_name }) => column_name)).toEqual([
      'id',
      'reporter_user_id',
      'stable_song_id',
      'stable_chart_id',
      'publication_channel',
      'publication_catalog_run_id',
      'publication_revision',
      'publication_fingerprint_sha256',
      'target_field_key',
      'category',
      'current_value',
      'proposed_value',
      'explanation',
      'source_urls',
      'state',
      'created_at',
      'closed_by_user_id',
      'closed_at',
      'close_note',
    ])
    expect(columns.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column_name: 'id',
          data_type: 'uuid',
          is_nullable: 'NO',
          column_default: 'gen_random_uuid()',
        }),
        expect.objectContaining({
          column_name: 'current_value',
          data_type: 'jsonb',
          is_nullable: 'NO',
        }),
        expect.objectContaining({
          column_name: 'proposed_value',
          data_type: 'jsonb',
          is_nullable: 'NO',
        }),
        expect.objectContaining({
          column_name: 'source_urls',
          data_type: 'ARRAY',
          is_nullable: 'NO',
        }),
        expect.objectContaining({
          column_name: 'state',
          data_type: 'text',
          is_nullable: 'NO',
          column_default: "'open'::text",
        }),
      ]),
    )
    expect(columns.rows.some(({ column_name }) => /(?:upload|attachment|raw|token|ip)/i.test(column_name))).toBe(false)

    const foreignKeys = await migrationPool.query<{
      readonly column_name: string
      readonly foreign_schema: string
      readonly foreign_table: string
      readonly delete_action: string
    }>(
      `SELECT child_attribute.attname AS column_name,
              parent_namespace.nspname AS foreign_schema,
              parent.relname AS foreign_table,
              CASE foreign_key.confdeltype WHEN 'r' THEN 'RESTRICT' ELSE foreign_key.confdeltype::text END AS delete_action
       FROM pg_constraint foreign_key
       JOIN pg_class child ON child.oid = foreign_key.conrelid
       JOIN pg_class parent ON parent.oid = foreign_key.confrelid
       JOIN pg_namespace parent_namespace ON parent_namespace.oid = parent.relnamespace
       JOIN pg_attribute child_attribute
         ON child_attribute.attrelid = child.oid AND child_attribute.attnum = foreign_key.conkey[1]
       WHERE foreign_key.contype = 'f' AND child.relname = 'chart_reports'
       ORDER BY child_attribute.attname`,
    )
    expect(foreignKeys.rows).toEqual([
      {
        column_name: 'closed_by_user_id',
        foreign_schema: 'public',
        foreign_table: 'user',
        delete_action: 'RESTRICT',
      },
      {
        column_name: 'reporter_user_id',
        foreign_schema: 'public',
        foreign_table: 'user',
        delete_action: 'RESTRICT',
      },
    ])

    const indexes = await migrationPool.query<{ readonly indexname: string; readonly indexdef: string }>(
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'chart_reports'
       ORDER BY indexname`,
    )
    const definitions = new Map(indexes.rows.map(({ indexname, indexdef }) => [indexname, indexdef]))
    expect([...definitions.keys()]).toEqual(
      expect.arrayContaining([
        'chart_reports_queue_idx',
        'chart_reports_chart_queue_idx',
        'chart_reports_field_queue_idx',
        'chart_reports_category_queue_idx',
        'chart_reports_reporter_queue_idx',
        'chart_reports_publication_revision_queue_idx',
        'chart_reports_publication_identity_idx',
        'chart_reports_created_idx',
        'chart_reports_closed_at_idx',
      ]),
    )
    for (const name of [
      'chart_reports_queue_idx',
      'chart_reports_chart_queue_idx',
      'chart_reports_field_queue_idx',
      'chart_reports_category_queue_idx',
      'chart_reports_reporter_queue_idx',
      'chart_reports_publication_revision_queue_idx',
    ]) {
      expect(definitions.get(name)).toContain("((state = 'open'::text)) DESC")
      expect(definitions.get(name)).toContain('created_at DESC NULLS LAST')
      expect(definitions.get(name)).toContain('id DESC NULLS LAST')
    }
    expect(definitions.get('chart_reports_publication_identity_idx')).toContain(
      '(publication_channel, publication_catalog_run_id, publication_revision, publication_fingerprint_sha256)',
    )
    expect(definitions.get('chart_reports_closed_at_idx')).toContain("WHERE (state = 'closed'::text)")

    const mixedVersionUser = await migrationPool.query<{ readonly name: string }>(
      `SELECT name FROM "user" WHERE id = 'mixed-version-user'`,
    )
    expect(mixedVersionUser.rows).toEqual([{ name: 'Mixed Version Updated' }])
  })

  it('enforces the source-controlled field/category vocabulary and typed bounded JSON snapshots', async () => {
    expect(Object.keys(supportedValues)).toEqual([...CHART_REPORT_FIELD_KEYS])

    const insertedIds: string[] = []
    for (const [index, fieldKey] of CHART_REPORT_FIELD_KEYS.entries()) {
      const value = supportedValues[fieldKey]
      const category: ChartReportCategoryKey = CHART_REPORT_CATEGORY_KEYS[index % CHART_REPORT_CATEGORY_KEYS.length]!
      const inserted = await insertReport(migrationPool, {
        fieldKey,
        category,
        currentValue: value,
        proposedValue: value,
        explanation: `Supported persisted field ${fieldKey}`,
      })
      insertedIds.push(inserted.rows[0]!.id)
    }
    expect(new Set(insertedIds).size).toBe(CHART_REPORT_FIELD_KEYS.length)

    const explicitNulls = await migrationPool.query<{
      readonly current_type: string
      readonly proposed_type: string
    }>(
      `SELECT jsonb_typeof(current_value) AS current_type,
              jsonb_typeof(proposed_value) AS proposed_type
       FROM chart_reports
       WHERE target_field_key = 'chart.note_counts.hold'
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    expect(explicitNulls.rows).toEqual([{ current_type: 'null', proposed_type: 'null' }])

    await expect(insertReport(migrationPool, { fieldKey: 'chart.unsupported' })).rejects.toMatchObject({
      code: '23514',
      constraint: 'chart_reports_target_field_key_check',
    })
    await expect(insertReport(migrationPool, { category: 'duplicate' })).rejects.toMatchObject({
      code: '23514',
      constraint: 'chart_reports_category_check',
    })
    await expect(
      insertReport(migrationPool, { fieldKey: 'chart.internal_level', currentValue: '14.5' }),
    ).rejects.toMatchObject({ code: '23514', constraint: 'chart_reports_current_value_check' })
    await expect(
      insertReport(migrationPool, { fieldKey: 'chart.is_special', currentValue: false, proposedValue: 1 }),
    ).rejects.toMatchObject({ code: '23514', constraint: 'chart_reports_proposed_value_check' })
    await expect(insertReport(migrationPool, { fieldKey: 'chart.level', currentValue: null })).rejects.toMatchObject({
      code: '23514',
      constraint: 'chart_reports_current_value_check',
    })
    await expect(
      insertReport(migrationPool, { fieldKey: 'song.bpm', currentValue: 120.1234, proposedValue: 120 }),
    ).rejects.toMatchObject({ code: '23514', constraint: 'chart_reports_current_value_check' })
    await expect(
      insertReport(migrationPool, {
        fieldKey: 'chart.internal_level',
        currentValue: 14.5,
        proposedValue: 14.1234,
      }),
    ).rejects.toMatchObject({ code: '23514', constraint: 'chart_reports_proposed_value_check' })
    await expect(
      insertReport(migrationPool, {
        fieldKey: 'chart.note_counts.total',
        currentValue: 1.5,
        proposedValue: 2,
      }),
    ).rejects.toMatchObject({ code: '23514', constraint: 'chart_reports_current_value_check' })
    await expect(
      insertReport(migrationPool, { fieldKey: 'chart.release_date', currentValue: '2026-02-29' }),
    ).rejects.toBeDefined()

    const exactMap = exactSizeNumberMap()
    expect(Buffer.byteLength(JSON.stringify(exactMap), 'utf8')).toBe(CHART_REPORT_JSON_SNAPSHOT_MAX_BYTES)
    expect(normalizeChartReportJsonSnapshot('chart.multiver_internal_levels', exactMap)).toEqual(exactMap)
    await expect(
      insertReport(migrationPool, {
        fieldKey: 'chart.multiver_internal_levels',
        currentValue: exactMap,
        proposedValue: null,
      }),
    ).resolves.toMatchObject({ rowCount: 1 })

    const lastKey = Object.keys(exactMap).at(-1)!
    const overLimitMap = { ...exactMap }
    const lastValue = overLimitMap[lastKey]!
    delete overLimitMap[lastKey]
    overLimitMap[`${lastKey}x`] = lastValue
    expect(Buffer.byteLength(JSON.stringify(overLimitMap), 'utf8')).toBe(CHART_REPORT_JSON_SNAPSHOT_MAX_BYTES + 1)
    expect(() => normalizeChartReportJsonSnapshot('chart.multiver_internal_levels', overLimitMap)).toThrow()

    for (const invalidMap of [
      overLimitMap,
      { '': 12.5 },
      { ['x'.repeat(256)]: 12.5 },
      { version: '12.5' },
      { version: true },
      { version: 12.1234 },
      { version: 100.001 },
      Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`version-${index}`, 12.5])),
    ]) {
      await expect(
        insertReport(migrationPool, {
          fieldKey: 'chart.multiver_internal_levels',
          currentValue: invalidMap,
          proposedValue: null,
        }),
      ).rejects.toMatchObject({ code: '23514', constraint: 'chart_reports_number_map_guard' })
    }

    for (const overrides of [
      { stableSongId: 'legacy-song' },
      { stableChartId: 'legacy-chart' },
      { publicationChannel: 'preview' },
      { publicationCatalogRunId: '0' },
      { publicationRevision: '0' },
      { publicationFingerprintSha256: 'A'.repeat(64) },
    ]) {
      await expect(insertReport(migrationPool, overrides)).rejects.toMatchObject({ code: '23514' })
    }

    for (const explanation of ['', ' ', '\tleading', 'trailing\n', 'x'.repeat(4001)]) {
      await expect(insertReport(migrationPool, { explanation })).rejects.toMatchObject({
        code: '23514',
        constraint: 'chart_reports_explanation_check',
      })
    }
  })

  it('stores only bounded normalized URL references and keeps identical submissions independent', async () => {
    const sourceUrls = [
      'https://evidence.example.test/chart/17?region=jp#master',
      'http://reference.example.test:8080/archive/',
    ]
    const first = await insertReport(migrationPool, { sourceUrls })
    const second = await insertReport(migrationPool, { sourceUrls })
    expect(first.rows[0]!.id).not.toBe(second.rows[0]!.id)

    const stored = await migrationPool.query<{
      readonly source_urls: string[]
      readonly publication_channel: string
      readonly publication_catalog_run_id: string
      readonly publication_revision: string
      readonly publication_fingerprint_sha256: string
    }>(
      `SELECT source_urls,
              publication_channel,
              publication_catalog_run_id::text,
              publication_revision::text,
              publication_fingerprint_sha256
       FROM chart_reports
       WHERE id = $1::uuid`,
      [first.rows[0]!.id],
    )
    expect(stored.rows).toEqual([
      {
        source_urls: sourceUrls,
        publication_channel: 'production-v1',
        publication_catalog_run_id: '17',
        publication_revision: '4',
        publication_fingerprint_sha256: 'a'.repeat(64),
      },
    ])

    for (const sourceUrl of [
      'ftp://evidence.example.test/file',
      'https://user:password@evidence.example.test/',
      'https://EVIDENCE.example.test/',
      'https://evidence.example.test',
      'https://evidence.example.test:443/',
      'https://evidence.example.test:0443/',
      'https://evidence.example.test:65536/',
      'https://evidence.example.test:0/',
      'https://evidence.example.test:/',
      'https://evidence.example.test:port/',
      'https://[not-an-ip]/',
      'https://[]/',
      'https://evidence.example.test/a/../b',
      'https://evidence.example.test/a/%2e/b',
      'https://evidence.example.test/a/%2E%2e/b',
      'https://evidence.example.test/a b',
      'https://evidence.example.test/a\\b',
      'https://evidence.example.test/資料',
      `https://evidence.example.test/${'x'.repeat(2049)}`,
    ]) {
      await expect(insertReport(migrationPool, { sourceUrls: [sourceUrl] })).rejects.toMatchObject({
        code: '23514',
        constraint: 'chart_reports_source_url_guard',
      })
    }

    await expect(
      insertReport(migrationPool, {
        sourceUrls: Array.from({ length: 6 }, (_, index) => `https://evidence-${index}.example.test/`),
      }),
    ).rejects.toMatchObject({ code: '23514', constraint: 'chart_reports_source_urls_check' })
    await expect(insertReport(migrationPool, { sourceUrls: [null] })).rejects.toMatchObject({
      code: '23514',
      constraint: 'chart_reports_source_url_guard',
    })

    const independent = await migrationPool.query<{ readonly count: string }>(
      `SELECT count(*)::text AS count
       FROM chart_reports
       WHERE reporter_user_id = 'reporter-user'
         AND stable_chart_id = 'dsht_23456789ab'
         AND target_field_key = 'chart.level'
         AND current_value = '"13+"'::jsonb
         AND proposed_value = '"14"'::jsonb
         AND source_urls = $1::text[]`,
      [sourceUrls],
    )
    expect(Number(independent.rows[0]!.count)).toBeGreaterThanOrEqual(2)
  })

  it('permits only an immutable open-to-closed transition and retains user-linked evidence', async () => {
    const beforeInsert = await migrationPool.query<{ readonly recorded_at: Date }>(
      `SELECT clock_timestamp() AS recorded_at`,
    )
    const inserted = await insertReport(migrationPool)
    const reportId = inserted.rows[0]!.id
    const afterInsert = await migrationPool.query<{ readonly recorded_at: Date }>(
      `SELECT clock_timestamp() AS recorded_at`,
    )
    expect(inserted.rows[0]!.state).toBe('open')
    expect(inserted.rows[0]!.created_at.getTime()).toBeGreaterThanOrEqual(
      beforeInsert.rows[0]!.recorded_at.getTime() - 1,
    )
    expect(inserted.rows[0]!.created_at.getTime()).toBeLessThanOrEqual(afterInsert.rows[0]!.recorded_at.getTime() + 1)
    expect(inserted.rows[0]!.created_at.toISOString()).not.toBe('2000-01-01T00:00:00.000Z')

    await expect(
      migrationPool.query(
        `INSERT INTO chart_reports (
           reporter_user_id, stable_song_id, stable_chart_id,
           publication_channel, publication_catalog_run_id, publication_revision,
           publication_fingerprint_sha256, target_field_key, category,
           current_value, proposed_value, explanation, source_urls,
           state, closed_by_user_id, closed_at
         ) VALUES (
           'reporter-user', 'dsng_23456789ab', 'dsht_23456789ab',
           'production-v1', 17, 4, $1, 'chart.level', 'incorrect_value',
           '"13+"'::jsonb, '"14"'::jsonb, 'Prematurely closed', '{}',
           'closed', 'closer-user', now()
         )`,
        ['a'.repeat(64)],
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'chart_reports_initial_state_guard' })

    for (const mutation of [
      `UPDATE chart_reports SET reporter_user_id = 'closer-user' WHERE id = $1::uuid`,
      `UPDATE chart_reports SET current_value = '"rewritten"'::jsonb WHERE id = $1::uuid`,
      `UPDATE chart_reports SET explanation = 'Rewritten' WHERE id = $1::uuid`,
      `UPDATE chart_reports SET source_urls = '{}' WHERE id = $1::uuid`,
      `UPDATE chart_reports SET created_at = created_at + interval '1 second' WHERE id = $1::uuid`,
    ]) {
      await expect(migrationPool.query(mutation, [reportId])).rejects.toMatchObject({
        code: '55000',
        constraint: 'chart_reports_submission_immutable_guard',
      })
    }
    await expect(
      migrationPool.query(`UPDATE chart_reports SET state = 'open' WHERE id = $1::uuid`, [reportId]),
    ).rejects.toMatchObject({ code: '23514', constraint: 'chart_reports_close_transition_guard' })

    const invalidNote = await insertReport(migrationPool)
    await expect(
      migrationPool.query(
        `UPDATE chart_reports
         SET state = 'closed', closed_by_user_id = 'closer-user', close_note = $2
         WHERE id = $1::uuid`,
        [invalidNote.rows[0]!.id, 'x'.repeat(1001)],
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'chart_reports_closure_check' })
    const stillOpen = await migrationPool.query<{ readonly state: string }>(
      `SELECT state FROM chart_reports WHERE id = $1::uuid`,
      [invalidNote.rows[0]!.id],
    )
    expect(stillOpen.rows).toEqual([{ state: 'open' }])

    const beforeClose = await migrationPool.query<{ readonly recorded_at: Date }>(
      `SELECT clock_timestamp() AS recorded_at`,
    )
    const closed = await migrationPool.query<{
      readonly state: string
      readonly closed_by_user_id: string
      readonly closed_at: Date
      readonly close_note: string | null
    }>(
      `UPDATE chart_reports
       SET state = 'closed',
           closed_by_user_id = 'closer-user',
           closed_at = timestamp with time zone '2000-01-01 00:00:00+00',
           close_note = 'Resolved in the source catalog'
       WHERE id = $1::uuid
       RETURNING state, closed_by_user_id, closed_at, close_note`,
      [reportId],
    )
    const afterClose = await migrationPool.query<{ readonly recorded_at: Date }>(
      `SELECT clock_timestamp() AS recorded_at`,
    )
    expect(closed.rows[0]).toMatchObject({
      state: 'closed',
      closed_by_user_id: 'closer-user',
      close_note: 'Resolved in the source catalog',
    })
    expect(closed.rows[0]!.closed_at.getTime()).toBeGreaterThanOrEqual(beforeClose.rows[0]!.recorded_at.getTime() - 1)
    expect(closed.rows[0]!.closed_at.getTime()).toBeLessThanOrEqual(afterClose.rows[0]!.recorded_at.getTime() + 1)

    for (const mutation of [
      `UPDATE chart_reports SET state = 'open', closed_by_user_id = NULL, closed_at = NULL, close_note = NULL WHERE id = $1::uuid`,
      `UPDATE chart_reports SET close_note = 'Overwritten' WHERE id = $1::uuid`,
      `UPDATE chart_reports SET state = 'closed' WHERE id = $1::uuid`,
    ]) {
      await expect(migrationPool.query(mutation, [reportId])).rejects.toMatchObject({
        code: '55000',
        constraint: 'chart_reports_closed_immutable_guard',
      })
    }
    await expect(
      migrationPool.query(`DELETE FROM chart_reports WHERE id = $1::uuid`, [reportId]),
    ).rejects.toMatchObject({ code: '55000', constraint: 'chart_reports_retention_guard' })

    await migrationPool.query(`INSERT INTO profiles (id, display_name) VALUES ('reporter-user', 'Original Name')`)
    await migrationPool.query(`UPDATE profiles SET display_name = 'Renamed User' WHERE id = 'reporter-user'`)
    const retained = await migrationPool.query<{ readonly reporter_user_id: string }>(
      `SELECT reporter_user_id FROM chart_reports WHERE id = $1::uuid`,
      [reportId],
    )
    expect(retained.rows).toEqual([{ reporter_user_id: 'reporter-user' }])
    await expect(migrationPool.query(`DELETE FROM "user" WHERE id = 'reporter-user'`)).rejects.toMatchObject({
      code: expect.stringMatching(/^(23001|23503)$/),
    })
    await expect(migrationPool.query(`DELETE FROM "user" WHERE id = 'closer-user'`)).rejects.toMatchObject({
      code: expect.stringMatching(/^(23001|23503)$/),
    })
  })

  it('supports the least-privilege runtime writer without weakening immutable report guards', async () => {
    const publicPrivileges = await migrationPool.query<{ readonly privilege_type: string }>(
      `SELECT privilege_type
       FROM information_schema.role_table_grants
       WHERE table_schema = 'public'
         AND table_name = 'chart_reports'
         AND grantee = 'PUBLIC'`,
    )
    expect(publicPrivileges.rows).toEqual([])

    await migrationPool.query(`GRANT USAGE ON SCHEMA public TO ${RUNTIME_ROLE}`)
    await migrationPool.query(`GRANT SELECT, INSERT, UPDATE ON chart_reports TO ${RUNTIME_ROLE}`)
    const runtime = await migrationPool.connect()
    try {
      await runtime.query(`SET ROLE ${RUNTIME_ROLE}`)
      const exactMap = exactSizeNumberMap()
      const inserted = await insertReport(runtime, {
        fieldKey: 'chart.multiver_internal_levels',
        currentValue: exactMap,
        proposedValue: null,
        sourceUrls: ['https://runtime-evidence.example.test/'],
      })
      const reportId = inserted.rows[0]!.id
      const selected = await runtime.query<{ readonly state: string }>(
        `SELECT state FROM chart_reports WHERE id = $1::uuid`,
        [reportId],
      )
      expect(selected.rows).toEqual([{ state: 'open' }])

      const closed = await runtime.query<{ readonly state: string; readonly closed_at: Date }>(
        `UPDATE chart_reports
         SET state = 'closed', closed_by_user_id = 'closer-user'
         WHERE id = $1::uuid
         RETURNING state, closed_at`,
        [reportId],
      )
      expect(closed.rows[0]).toMatchObject({ state: 'closed', closed_at: expect.any(Date) })

      const another = await insertReport(runtime)
      await expect(
        runtime.query(`UPDATE chart_reports SET explanation = 'Runtime rewrite' WHERE id = $1::uuid`, [
          another.rows[0]!.id,
        ]),
      ).rejects.toMatchObject({ code: '55000', constraint: 'chart_reports_submission_immutable_guard' })
      await expect(runtime.query(`DELETE FROM chart_reports WHERE id = $1::uuid`, [reportId])).rejects.toMatchObject({
        code: '42501',
      })
      await expect(runtime.query(`TRUNCATE chart_reports`)).rejects.toMatchObject({ code: '42501' })
    } finally {
      await runtime.query('RESET ROLE')
      runtime.release()
    }

    const runtimeGrants = await migrationPool.query<{ readonly privilege_type: string }>(
      `SELECT privilege_type
       FROM information_schema.role_table_grants
       WHERE table_schema = 'public'
         AND table_name = 'chart_reports'
         AND grantee = $1
       ORDER BY privilege_type`,
      [RUNTIME_ROLE],
    )
    expect(runtimeGrants.rows.map(({ privilege_type }) => privilege_type)).toEqual(['INSERT', 'SELECT', 'UPDATE'])
  })

  it('uses ready keyset indexes for the open-first queue and every independent filter at representative volume', async () => {
    await migrationPool.query('ANALYZE chart_reports')
    const indexes = await migrationPool.query<{
      readonly index_name: string
      readonly ready: boolean
      readonly valid: boolean
    }>(
      `SELECT index_relation.relname AS index_name,
              index.indisready AS ready,
              index.indisvalid AS valid
       FROM pg_index index
       JOIN pg_class index_relation ON index_relation.oid = index.indexrelid
       JOIN pg_class table_relation ON table_relation.oid = index.indrelid
       JOIN pg_namespace namespace ON namespace.oid = table_relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND table_relation.relname = 'chart_reports'
         AND index_relation.relname LIKE 'chart_reports_%_idx'
       ORDER BY index_relation.relname`,
    )
    expect(indexes.rows).toHaveLength(9)
    expect(indexes.rows.every(({ ready, valid }) => ready && valid)).toBe(true)

    const assertIndexPlan = async (expectedIndex: string, query: string, values: readonly unknown[] = []) => {
      const result = await migrationPool.query<{ readonly 'QUERY PLAN': [{ readonly Plan: ExplainNode }] }>(
        `EXPLAIN (ANALYZE, FORMAT JSON) ${query}`,
        [...values],
      )
      const nodes = flattenPlan(result.rows[0]!['QUERY PLAN'][0].Plan)
      expect(nodes.map((node) => node['Index Name'])).toContain(expectedIndex)
      expect(nodes.some((node) => node['Node Type'] === 'Sort')).toBe(false)
    }

    // Exercise the default PostgreSQL planner at representative volume rather
    // than forcing index scans that production may not choose.
    await migrationPool.query('RESET enable_seqscan')
    await migrationPool.query('RESET enable_bitmapscan')
    try {
      await assertIndexPlan(
        'chart_reports_queue_idx',
        `SELECT id
         FROM chart_reports
         ORDER BY (state = 'open') DESC, created_at DESC NULLS LAST, id DESC NULLS LAST
         LIMIT 50`,
      )
      await assertIndexPlan(
        'chart_reports_chart_queue_idx',
        `SELECT id
         FROM chart_reports
         WHERE stable_chart_id = $1
         ORDER BY (state = 'open') DESC, created_at DESC NULLS LAST, id DESC NULLS LAST
         LIMIT 50`,
        ['dsht_23456789ab'],
      )
      await assertIndexPlan(
        'chart_reports_field_queue_idx',
        `SELECT id
         FROM chart_reports
         WHERE target_field_key = $1
         ORDER BY (state = 'open') DESC, created_at DESC NULLS LAST, id DESC NULLS LAST
         LIMIT 50`,
        ['chart.level'],
      )
      await assertIndexPlan(
        'chart_reports_category_queue_idx',
        `SELECT id
         FROM chart_reports
         WHERE category = $1
         ORDER BY (state = 'open') DESC, created_at DESC NULLS LAST, id DESC NULLS LAST
         LIMIT 50`,
        ['incorrect_value'],
      )
      await assertIndexPlan(
        'chart_reports_reporter_queue_idx',
        `SELECT id
         FROM chart_reports
         WHERE reporter_user_id = $1
         ORDER BY (state = 'open') DESC, created_at DESC NULLS LAST, id DESC NULLS LAST
         LIMIT 50`,
        ['plan-reporter-1'],
      )
      await assertIndexPlan(
        'chart_reports_publication_revision_queue_idx',
        `SELECT id
         FROM chart_reports
         WHERE publication_revision = $1::bigint
         ORDER BY (state = 'open') DESC, created_at DESC NULLS LAST, id DESC NULLS LAST
         LIMIT 50`,
        ['2'],
      )
      await assertIndexPlan(
        'chart_reports_created_idx',
        `SELECT id
         FROM chart_reports
         WHERE created_at >= timestamp with time zone '2026-01-01 00:00:00+00'
         ORDER BY created_at DESC NULLS LAST, id DESC NULLS LAST
         LIMIT 50`,
      )
      await assertIndexPlan(
        'chart_reports_closed_at_idx',
        `SELECT id
         FROM chart_reports
         WHERE state = 'closed' AND closed_at IS NOT NULL
         ORDER BY closed_at DESC NULLS LAST, id DESC NULLS LAST
         LIMIT 50`,
      )

      const combinedQueuePlan = await migrationPool.query<{
        readonly 'QUERY PLAN': [{ readonly Plan: ExplainNode }]
      }>(
        `EXPLAIN (ANALYZE, FORMAT JSON)
         SELECT id
         FROM chart_reports
         WHERE state = $1
           AND stable_chart_id = $2
           AND target_field_key = $3
           AND category = $4
           AND reporter_user_id = $5
           AND created_at >= $6::timestamptz
           AND created_at < $7::timestamptz
           AND created_at < timestamptz '2026-01-01 00:00:21+00'
           AND (closed_at IS NULL OR closed_at < timestamptz '2026-01-01 00:00:21+00')
           AND publication_revision = $8::bigint
           AND ((state = 'open'), created_at, id) <
             ($9::boolean, $10::timestamptz, $11::uuid)
         ORDER BY (state = 'open') DESC, created_at DESC, id DESC
         LIMIT 51`,
        [
          'open',
          'dsht_23456789ab',
          'chart.level',
          'incorrect_value',
          'plan-reporter-2',
          '2026-01-01T00:00:01.000Z',
          '2026-01-01T00:00:20.000Z',
          '3',
          true,
          '2026-01-01T00:00:19.000Z',
          'ffffffff-ffff-4fff-bfff-ffffffffffff',
        ],
      )
      const combinedQueueNodes = flattenPlan(combinedQueuePlan.rows[0]!['QUERY PLAN'][0].Plan)
      const combinedQueueIndexes = combinedQueueNodes.flatMap((node) =>
        node['Index Name'] === undefined ? [] : [node['Index Name']],
      )
      expect(
        combinedQueueIndexes.some((indexName) =>
          [
            'chart_reports_queue_idx',
            'chart_reports_chart_queue_idx',
            'chart_reports_field_queue_idx',
            'chart_reports_category_queue_idx',
            'chart_reports_reporter_queue_idx',
            'chart_reports_publication_revision_queue_idx',
          ].includes(indexName),
        ),
      ).toBe(true)
      const combinedQueueSort = combinedQueueNodes.find((node) => node['Node Type'] === 'Sort')
      if (combinedQueueSort) {
        expect(combinedQueueSort).toMatchObject({
          'Sort Method': 'top-N heapsort',
          'Sort Space Type': 'Memory',
        })
        expect(combinedQueueSort['Actual Rows']).toBeLessThanOrEqual(51)
        expect(combinedQueueSort['Sort Space Used']).toBeLessThanOrEqual(1024)
      }
    } finally {
      await migrationPool.query('RESET enable_bitmapscan')
      await migrationPool.query('RESET enable_seqscan')
    }
  })
})