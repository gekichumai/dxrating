import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { isPublicSheetId } from '@gekichumai/maimai-domain'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { describeSchema } from './migration-roundtrip'
import { cleanDatabase, setupTestServer, teardownTestServer } from './setup'

const CLOUD_SAVE_TABLES = [
  'feature_flag_overrides',
  'score_saves',
  'score_import_jobs',
  'score_records',
  'score_record_events',
  'score_mutations',
  'score_save_snapshots',
]

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

type Row = Record<string, unknown>
const insert = async (table: string, row: Row) => {
  const columns = Object.keys(row)
  await pool.query(
    `INSERT INTO ${table} (${columns.map((column) => `"${column}"`).join(', ')})
     VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})`,
    Object.values(row),
  )
}

// Every catalog sheet ID, and an evenly spread sample of them for the round trip through PostgreSQL.
const catalogSheetIds = catalogSnapshot.songs.flatMap((song) => song.sheets.map((sheet) => sheet.id))
const sampledSheetIds = Array.from(
  { length: 40 },
  (_, index) => catalogSheetIds[Math.floor((index * catalogSheetIds.length) / 40)]!,
)

let userId: string
let saveId: string
let serverJobId: string
let clientJobId: string

const clientRecord = (overrides: Row = {}): Row => ({
  save_id: saveId,
  sheet_id: sampledSheetIds[0],
  user_id: userId,
  achievement: 1005432,
  combo_flag: 'fc',
  sync_flag: null,
  source: 'aqua-dx',
  fetched_by: 'client',
  verification: 'client_reported',
  entry_method: 'file',
  import_job_id: clientJobId,
  revision: 1,
  ...overrides,
})
const verifiedRecord = (overrides: Row = {}): Row => ({
  ...clientRecord(),
  source: 'lxns',
  fetched_by: 'server',
  verification: 'verified',
  entry_method: 'import',
  import_job_id: serverJobId,
  raw_payload_sha256: 'a'.repeat(64),
  fetched_at: new Date(),
  ...overrides,
})

describe('cloud save schema', () => {
  beforeAll(async () => {
    await setupTestServer()
  })

  afterAll(async () => {
    await teardownTestServer()
    await pool.end()
  })

  beforeEach(async () => {
    await cleanDatabase()
    userId = randomUUID()
    saveId = `dsav_${randomUUID()}`
    serverJobId = `dimp_server_${randomUUID()}`
    clientJobId = `dimp_client_${randomUUID()}`
    await insert('"user"', { id: userId, name: 'Schema', email: `${userId}@example.invalid` })
    await insert('score_saves', { id: saveId, user_id: userId, name: 'JP', region: 'jp' })
    await insert('score_import_jobs', {
      id: serverJobId,
      user_id: userId,
      save_id: saveId,
      source: 'lxns',
      fetched_by: 'server',
      trigger: 'user',
      idempotency_key: 'server',
      status: 'succeeded',
    })
    await insert('score_import_jobs', {
      id: clientJobId,
      user_id: userId,
      save_id: saveId,
      source: 'aqua-dx',
      fetched_by: 'client',
      trigger: 'user',
      idempotency_key: 'client',
      status: 'succeeded',
    })
  })

  it('builds exactly the tables of the design DDL', async () => {
    const adminUrl = new URL(process.env.DATABASE_URL!)
    adminUrl.pathname = '/postgres'
    const admin = new pg.Pool({ connectionString: adminUrl.toString(), max: 1 })
    const name = `dxrating_design_ddl_${randomUUID().replaceAll('-', '')}`
    await admin.query(`CREATE DATABASE "${name}"`)
    const designUrl = new URL(process.env.DATABASE_URL!)
    designUrl.pathname = `/${name}`
    const design = new pg.Pool({ connectionString: designUrl.toString(), max: 1 })
    try {
      await design.query('CREATE TABLE "user" (id text PRIMARY KEY)')
      await design.query(readFileSync(path.join(import.meta.dirname, 'fixtures/cloud-save-design.sql'), 'utf8'))

      // The DDL leaves most constraints unnamed and PostgreSQL names them differently from Drizzle; compare
      // what each constraint enforces instead.
      const normalize = (schema: Awaited<ReturnType<typeof describeSchema>>) => ({
        columns: schema.columns.filter((row) => CLOUD_SAVE_TABLES.includes(row.relname)),
        constraints: schema.constraints
          .filter((row) => CLOUD_SAVE_TABLES.includes(row.relname))
          .map((row) => `${row.relname}: ${row.definition}`)
          .sort(),
        indexes: schema.indexes.filter((row) => CLOUD_SAVE_TABLES.includes(row.tablename)),
        sequences: schema.sequences.filter((row) => (row.relname as string).startsWith('score_')),
      })
      const expected = normalize(await describeSchema(design))
      const actual = normalize(await describeSchema(pool))
      expect(expected.columns.length).toBeGreaterThan(90)
      expect(actual).toEqual(expected)
    } finally {
      await design.end()
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
      await admin.end()
    }
  })

  it('accepts real catalog sheet IDs', async () => {
    expect(catalogSheetIds.length).toBeGreaterThan(1000)
    expect(catalogSheetIds.every(isPublicSheetId)).toBe(true)
    for (const [index, sheetId] of sampledSheetIds.entries()) {
      await insert('score_records', clientRecord({ sheet_id: sheetId, revision: index + 1 }))
    }
    const stored = await pool.query('SELECT count(*)::int AS count FROM score_records WHERE save_id = $1', [saveId])
    expect(stored.rows[0].count).toBe(new Set(sampledSheetIds).size)
  })

  it('rejects malformed and legacy sheet IDs exactly like isPublicSheetId', async () => {
    const rejected = [
      'dsht_xxxxx',
      'dsht_xxxxxxxxxxx',
      'dsht_0123456789',
      'dsht_abcdefghij',
      'DSHT_23456789AB',
      'dsng_23456789ab',
      ' dsht_23456789ab',
      'dsht_23456789ab\n',
      '君の知らない物語__dxrt__dx__dxrt__master',
    ]
    for (const sheetId of rejected) {
      expect(isPublicSheetId(sheetId)).toBe(false)
      await expect(insert('score_records', clientRecord({ sheet_id: sheetId }))).rejects.toMatchObject({
        code: '23514',
        constraint: 'score_records_sheet_id_check',
      })
    }
    expect(isPublicSheetId('dsht_23456789ab')).toBe(true)
    await insert('score_records', clientRecord({ sheet_id: 'dsht_23456789ab' }))
  })

  it('accepts verified records only from server jobs with full provenance', async () => {
    await insert('score_records', verifiedRecord())

    await expect(
      insert('score_records', verifiedRecord({ sheet_id: sampledSheetIds[1], fetched_by: 'client' })),
    ).rejects.toMatchObject({ code: '23514', constraint: 'score_records_verified_check' })
    for (const missing of ['import_job_id', 'raw_payload_sha256', 'fetched_at']) {
      await expect(
        insert('score_records', verifiedRecord({ sheet_id: sampledSheetIds[1], [missing]: null })),
      ).rejects.toMatchObject({ code: '23514', constraint: 'score_records_verified_check' })
    }
  })

  it('rejects a verified record that references a client job through the composite foreign key', async () => {
    await expect(
      insert('score_records', verifiedRecord({ sheet_id: sampledSheetIds[1], import_job_id: clientJobId })),
    ).rejects.toMatchObject({ code: '23503', constraint: 'score_records_import_job_id_fetched_by_fkey' })
    // A client record cannot claim a server job either.
    await expect(
      insert('score_records', clientRecord({ sheet_id: sampledSheetIds[1], import_job_id: serverJobId })),
    ).rejects.toMatchObject({ code: '23503', constraint: 'score_records_import_job_id_fetched_by_fkey' })
    // Records without a job (manual entries) need no job.
    await insert(
      'score_records',
      clientRecord({ sheet_id: sampledSheetIds[1], source: 'manual', entry_method: 'typed', import_job_id: null }),
    )
  })

  it('rejects demo records and verified manual records', async () => {
    await expect(insert('score_records', clientRecord({ source: 'demo', import_job_id: null }))).rejects.toMatchObject({
      code: '23514',
      constraint: 'score_records_source_check',
    })
    await expect(insert('score_records', verifiedRecord({ source: 'manual' }))).rejects.toMatchObject({
      code: '23514',
      constraint: 'score_records_manual_check',
    })
    await expect(
      insert('score_import_jobs', {
        id: `dimp_${randomUUID()}`,
        user_id: userId,
        save_id: saveId,
        source: 'demo',
        fetched_by: 'client',
        trigger: 'user',
        idempotency_key: 'demo',
        status: 'succeeded',
      }),
    ).rejects.toMatchObject({ code: '23514', constraint: 'score_import_jobs_source_check' })
  })

  it('allows one running job per save and source, and one live save per client profile', async () => {
    const job = (key: string, status: string) => ({
      id: `dimp_${randomUUID()}`,
      user_id: userId,
      save_id: saveId,
      source: 'maimai-net-jp',
      fetched_by: 'server',
      trigger: 'user',
      idempotency_key: key,
      status,
    })
    await insert('score_import_jobs', job('run-1', 'running'))
    await expect(insert('score_import_jobs', job('run-2', 'running'))).rejects.toMatchObject({
      code: '23505',
      constraint: 'score_import_jobs_one_running',
    })
    await insert('score_import_jobs', job('run-3', 'succeeded'))
    await expect(insert('score_import_jobs', job('run-1', 'failed'))).rejects.toMatchObject({
      code: '23505',
      constraint: 'score_import_jobs_user_id_idempotency_key_key',
    })

    const save = (id: string, deletedAt: Date | null = null) => ({
      id,
      user_id: userId,
      name: 'Japan',
      region: 'jp',
      client_profile_key: 'preset-japan',
      deleted_at: deletedAt,
    })
    await insert('score_saves', save('dsav_deleted', new Date()))
    await insert('score_saves', save('dsav_live'))
    await expect(insert('score_saves', save('dsav_duplicate'))).rejects.toMatchObject({
      code: '23505',
      constraint: 'score_saves_user_profile_key',
    })
    await expect(
      insert('score_saves', { ...save('dsav_bad_region'), client_profile_key: null, region: 'usa' }),
    ).rejects.toMatchObject({ code: '23514', constraint: 'score_saves_region_check' })
    await expect(
      insert('score_saves', { ...save('dsav_empty_name'), client_profile_key: null, name: '' }),
    ).rejects.toMatchObject({ code: '23514', constraint: 'score_saves_name_check' })
  })
})