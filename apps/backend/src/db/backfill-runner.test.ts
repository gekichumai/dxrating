import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  BACKFILL_CHECKPOINT_TABLE,
  BackfillCheckpointIntegrityError,
  BackfillCursorIntegrityError,
  BackfillDefinitionMismatchError,
  ensureBackfillCheckpointStore,
  hashBackfillDefinition,
  runResumableBackfill,
  type BackfillDefinition,
  type BackfillLogger,
} from './backfill-runner.js'

type FixtureRow = { id: number; sourceValue: number }

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const silentLogger: BackfillLogger = { info: () => undefined }
const testTable = 'public.backfill_runner_fixture'

const numericCursor = {
  serialize: (cursor: number) => cursor,
  deserialize: (value: unknown) => {
    if (typeof value !== 'number' || !Number.isInteger(value)) throw new TypeError('cursor must be an integer')
    return value
  },
  compare: (left: number, right: number) => left - right,
}

const insertFixtureRows = async (runId: string, count: number, startingAt = 1) => {
  await pool.query(
    `INSERT INTO ${testTable} (run_id, id, source_value)
     SELECT $1, value, value * 10
     FROM generate_series($2::integer, $3::integer) AS value`,
    [runId, startingAt, startingAt + count - 1],
  )
}

const readFixtureRows = async (runId: string) => {
  const result = await pool.query<{
    id: number
    source_value: number
    derived_value: number | null
    apply_count: number
  }>(
    `SELECT id, source_value, derived_value, apply_count
     FROM ${testTable}
     WHERE run_id = $1
     ORDER BY id`,
    [runId],
  )
  return result.rows
}

const createFixtureDefinition = (
  backfillId: string,
  runId: string,
  definitionVersion = 'v1',
): BackfillDefinition<FixtureRow, number> => ({
  id: backfillId,
  definitionHash: hashBackfillDefinition(`fixture:${definitionVersion}`),
  cursor: numericCursor,
  getHighWaterMark: async (client) => {
    const result = await client.query<{ maximum: string | null }>(
      `SELECT max(id)::text AS maximum FROM ${testTable} WHERE run_id = $1`,
      [runId],
    )
    const maximum = result.rows[0]?.maximum
    return maximum === null || maximum === undefined ? null : Number(maximum)
  },
  loadBatch: async (client, { after, through, limit }) => {
    const result = await client.query<{ id: number; source_value: number }>(
      `SELECT id, source_value
       FROM ${testTable}
       WHERE run_id = $1
         AND ($2::integer IS NULL OR id > $2)
         AND id <= $3
         AND derived_value IS NULL
       ORDER BY id
       LIMIT $4`,
      [runId, after ?? null, through, limit],
    )
    return result.rows.map((row) => ({ id: row.id, sourceValue: row.source_value }))
  },
  getCursor: (row) => row.id,
  applyBatch: async (client, rows) => {
    const result = await client.query(
      `UPDATE ${testTable}
       SET derived_value = source_value * 2,
           apply_count = apply_count + 1
       WHERE run_id = $1
         AND id = ANY($2::integer[])
         AND derived_value IS NULL`,
      [runId, rows.map((row) => row.id)],
    )
    if (result.rowCount !== rows.length) throw new Error('Fixture batch changed concurrently')
  },
})

const readRawCheckpoint = async (backfillId: string) => {
  const result = await pool.query<{
    high_water_mark: { value: number } | null
    cursor: { value: number } | null
    processed_count: string
    completed: boolean
  }>(
    `SELECT high_water_mark,
            cursor,
            processed_count::text,
            completed_at IS NOT NULL AS completed
     FROM ${BACKFILL_CHECKPOINT_TABLE}
     WHERE backfill_id = $1`,
    [backfillId],
  )
  return result.rows[0]
}

describe('resumable PostgreSQL backfill runner', () => {
  beforeAll(async () => {
    await ensureBackfillCheckpointStore(pool)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${testTable} (
        run_id text NOT NULL,
        id integer NOT NULL,
        source_value integer NOT NULL,
        derived_value integer,
        apply_count integer NOT NULL DEFAULT 0,
        PRIMARY KEY (run_id, id)
      )
    `)
  })

  beforeEach(async () => {
    await pool.query(`DELETE FROM ${testTable}`)
    await pool.query(`DELETE FROM ${BACKFILL_CHECKPOINT_TABLE} WHERE backfill_id LIKE 'test_backfill_%'`)
  })

  afterAll(async () => {
    await pool.query(`DELETE FROM ${BACKFILL_CHECKPOINT_TABLE} WHERE backfill_id LIKE 'test_backfill_%'`)
    await pool.query(`DROP TABLE IF EXISTS ${testTable}`)
    await pool.end()
  })

  it('pauses and resumes at a fixed high-water mark without duplicate or skipped rows', async () => {
    const runId = 'pause-resume'
    const backfillId = 'test_backfill_pause_resume'
    const definition = createFixtureDefinition(backfillId, runId)
    await insertFixtureRows(runId, 10)

    const paused = await runResumableBackfill({
      pool,
      definition,
      batchSize: 3,
      maxBatches: 2,
      logger: silentLogger,
    })

    expect(paused).toMatchObject({
      status: 'paused',
      highWaterMark: 10,
      cursor: 6,
      processedCount: 6n,
      batchesApplied: 2,
    })

    // Rows arriving after initialization are deliberately outside this run's fixed snapshot boundary.
    await insertFixtureRows(runId, 1, 11)
    const completed = await runResumableBackfill({
      pool,
      definition,
      batchSize: 3,
      logger: silentLogger,
    })
    expect(completed).toMatchObject({
      status: 'completed',
      highWaterMark: 10,
      cursor: 10,
      processedCount: 10n,
    })

    const repeated = await runResumableBackfill({ pool, definition, batchSize: 3, logger: silentLogger })
    expect(repeated).toMatchObject({ status: 'completed', processedCount: 10n, batchesApplied: 0 })

    const rows = await readFixtureRows(runId)
    expect(rows.slice(0, 10).every((row) => row.derived_value === row.source_value * 2)).toBe(true)
    expect(rows.slice(0, 10).every((row) => row.apply_count === 1)).toBe(true)
    expect(rows[10]).toMatchObject({ id: 11, derived_value: null, apply_count: 0 })
  })

  it('rolls back a failed batch and resumes with the originally persisted high-water mark', async () => {
    const runId = 'failure-resume'
    const backfillId = 'test_backfill_failure_resume'
    const definition = createFixtureDefinition(backfillId, runId)
    const applyBatch = definition.applyBatch
    let failNextBatch = true
    definition.applyBatch = async (client, rows) => {
      await applyBatch(client, rows)
      if (failNextBatch) {
        failNextBatch = false
        throw new Error('injected failure after domain mutation')
      }
    }
    await insertFixtureRows(runId, 5)

    await expect(runResumableBackfill({ pool, definition, batchSize: 2, logger: silentLogger })).rejects.toThrow(
      'injected failure after domain mutation',
    )

    expect(await readFixtureRows(runId)).toEqual([
      { id: 1, source_value: 10, derived_value: null, apply_count: 0 },
      { id: 2, source_value: 20, derived_value: null, apply_count: 0 },
      { id: 3, source_value: 30, derived_value: null, apply_count: 0 },
      { id: 4, source_value: 40, derived_value: null, apply_count: 0 },
      { id: 5, source_value: 50, derived_value: null, apply_count: 0 },
    ])
    expect(await readRawCheckpoint(backfillId)).toEqual({
      high_water_mark: { value: 5 },
      cursor: null,
      processed_count: '0',
      completed: false,
    })

    await insertFixtureRows(runId, 1, 6)
    const completed = await runResumableBackfill({
      pool,
      definition,
      batchSize: 2,
      logger: silentLogger,
    })
    expect(completed).toMatchObject({ status: 'completed', highWaterMark: 5, processedCount: 5n })

    const rows = await readFixtureRows(runId)
    expect(rows.slice(0, 5).every((row) => row.apply_count === 1)).toBe(true)
    expect(rows[5]).toMatchObject({ id: 6, derived_value: null, apply_count: 0 })
  })

  it('observes cancellation after committing the active bounded batch, then resumes safely', async () => {
    const runId = 'cancellation'
    const backfillId = 'test_backfill_cancellation'
    const definition = createFixtureDefinition(backfillId, runId)
    const applyBatch = definition.applyBatch
    const controller = new AbortController()
    let abortOnce = true
    definition.applyBatch = async (client, rows) => {
      await applyBatch(client, rows)
      if (abortOnce) {
        abortOnce = false
        controller.abort()
      }
    }
    await insertFixtureRows(runId, 6)

    await expect(
      runResumableBackfill({
        pool,
        definition,
        batchSize: 2,
        signal: controller.signal,
        logger: silentLogger,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })

    expect(await readRawCheckpoint(backfillId)).toMatchObject({
      high_water_mark: { value: 6 },
      cursor: { value: 2 },
      processed_count: '2',
      completed: false,
    })
    const interruptedRows = await readFixtureRows(runId)
    expect(interruptedRows.filter((row) => row.derived_value !== null).map((row) => row.id)).toEqual([1, 2])

    const completed = await runResumableBackfill({
      pool,
      definition,
      batchSize: 2,
      logger: silentLogger,
    })
    expect(completed).toMatchObject({ status: 'completed', processedCount: 6n })
    expect((await readFixtureRows(runId)).every((row) => row.apply_count === 1)).toBe(true)
  })

  it('serializes concurrent workers on the checkpoint row', async () => {
    const runId = 'concurrent-workers'
    const backfillId = 'test_backfill_concurrent_workers'
    const definition = createFixtureDefinition(backfillId, runId)
    const applyBatch = definition.applyBatch
    let activeWorkers = 0
    let maximumActiveWorkers = 0
    definition.applyBatch = async (client, rows) => {
      activeWorkers += 1
      maximumActiveWorkers = Math.max(maximumActiveWorkers, activeWorkers)
      try {
        await new Promise((resolve) => setTimeout(resolve, 20))
        await applyBatch(client, rows)
      } finally {
        activeWorkers -= 1
      }
    }
    await insertFixtureRows(runId, 12)

    const results = await Promise.all([
      runResumableBackfill({ pool, definition, batchSize: 2, logger: silentLogger }),
      runResumableBackfill({ pool, definition, batchSize: 2, logger: silentLogger }),
    ])

    expect(maximumActiveWorkers).toBe(1)
    expect(results.every((result) => result.status === 'completed')).toBe(true)
    expect(results.every((result) => result.processedCount === 12n)).toBe(true)
    expect((await readFixtureRows(runId)).every((row) => row.apply_count === 1)).toBe(true)
  })

  it('fails closed on definition drift and non-monotonic batches', async () => {
    const runId = 'integrity'
    const backfillId = 'test_backfill_integrity'
    const definition = createFixtureDefinition(backfillId, runId)
    await insertFixtureRows(runId, 4)
    await runResumableBackfill({
      pool,
      definition,
      batchSize: 2,
      maxBatches: 1,
      logger: silentLogger,
    })

    await expect(
      runResumableBackfill({
        pool,
        definition: createFixtureDefinition(backfillId, runId, 'v2'),
        batchSize: 2,
        logger: silentLogger,
      }),
    ).rejects.toBeInstanceOf(BackfillDefinitionMismatchError)

    const unorderedId = 'test_backfill_unordered'
    const unordered = createFixtureDefinition(unorderedId, runId)
    unordered.loadBatch = async (client: PoolClient, { after, through, limit }) => {
      const result = await client.query<{ id: number; source_value: number }>(
        `SELECT id, source_value
         FROM ${testTable}
         WHERE run_id = $1
           AND ($2::integer IS NULL OR id > $2)
           AND id <= $3
           AND derived_value IS NULL
         ORDER BY id DESC
         LIMIT $4`,
        [runId, after ?? null, through, limit],
      )
      return result.rows.map((row) => ({ id: row.id, sourceValue: row.source_value }))
    }

    await expect(
      runResumableBackfill({ pool, definition: unordered, batchSize: 2, logger: silentLogger }),
    ).rejects.toBeInstanceOf(BackfillCursorIntegrityError)
    expect(await readRawCheckpoint(unorderedId)).toMatchObject({ cursor: null, processed_count: '0' })
  })

  it('fails closed when a persisted cursor is beyond its fixed high-water mark', async () => {
    const runId = 'checkpoint-boundary'
    const backfillId = 'test_backfill_checkpoint_boundary'
    const definition = createFixtureDefinition(backfillId, runId)
    await insertFixtureRows(runId, 4)
    await runResumableBackfill({
      pool,
      definition,
      batchSize: 2,
      maxBatches: 1,
      logger: silentLogger,
    })
    await pool.query(
      `UPDATE ${BACKFILL_CHECKPOINT_TABLE}
       SET cursor = '{"value": 99}'::jsonb
       WHERE backfill_id = $1`,
      [backfillId],
    )

    await expect(runResumableBackfill({ pool, definition, batchSize: 2, logger: silentLogger })).rejects.toBeInstanceOf(
      BackfillCheckpointIntegrityError,
    )
  })

  it('applies bounded lock and statement timeouts inside each backfill transaction', async () => {
    const runId = 'transaction-timeouts'
    const backfillId = 'test_backfill_transaction_timeouts'
    const definition = createFixtureDefinition(backfillId, runId)
    const applyBatch = definition.applyBatch
    let observedTimeouts: { lock_timeout: string; statement_timeout: string } | undefined
    definition.applyBatch = async (client, rows) => {
      const settings = await client.query<{ lock_timeout: string; statement_timeout: string }>(
        `SELECT current_setting('lock_timeout') AS lock_timeout,
                current_setting('statement_timeout') AS statement_timeout`,
      )
      observedTimeouts = settings.rows[0]
      await applyBatch(client, rows)
    }
    await insertFixtureRows(runId, 1)

    await runResumableBackfill({
      pool,
      definition,
      batchSize: 1,
      lockTimeoutMs: 750,
      statementTimeoutMs: 12_500,
      logger: silentLogger,
    })

    expect(observedTimeouts).toEqual({ lock_timeout: '750ms', statement_timeout: '12500ms' })
  })
})