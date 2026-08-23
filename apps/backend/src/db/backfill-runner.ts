import { createHash } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'

export type BackfillJsonValue =
  | null
  | boolean
  | number
  | string
  | BackfillJsonValue[]
  | { [key: string]: BackfillJsonValue }

export type BackfillCursorCodec<Cursor> = {
  serialize: (cursor: Cursor) => BackfillJsonValue
  deserialize: (value: BackfillJsonValue) => Cursor
  /** Returns a negative number when left is before right, zero when equal, and a positive number when after. */
  compare: (left: Cursor, right: Cursor) => number
}

export type BackfillDefinition<Row, Cursor> = {
  /** Stable operational identifier. It must not contain user or row data. */
  id: string
  /**
   * SHA-256 of a stable definition string covering the selection, cursor, and mutation semantics.
   * Change it whenever any of those semantics change; an in-progress checkpoint will then fail closed.
   */
  definitionHash: string
  cursor: BackfillCursorCodec<Cursor>
  /**
   * Returns null only when there are no source rows to backfill. The chosen key must define a stable,
   * closed range: later writes must not introduce an unprocessed key at or below a cursor already passed.
   * Use dual writes for live rows and serialize large integer cursor components as strings.
   */
  getHighWaterMark: (client: PoolClient) => Promise<Cursor | null>
  /**
   * Returns at most `limit` rows in strictly increasing cursor order, after `after` and no later than
   * `through`. The runner verifies these bounds before invoking `applyBatch`.
   */
  loadBatch: (
    client: PoolClient,
    bounds: { after: Cursor | undefined; through: Cursor; limit: number },
  ) => Promise<readonly Row[]>
  getCursor: (row: Row) => Cursor
  /** Perform only PostgreSQL work through the supplied client so it shares the checkpoint transaction. */
  applyBatch: (client: PoolClient, rows: readonly Row[]) => Promise<void>
}

export type BackfillLogEvent =
  | {
      kind: 'batch_applied'
      backfillId: string
      rowCount: number
      totalProcessed: string
      durationMs: number
    }
  | { kind: 'paused'; backfillId: string; totalProcessed: string; batchesApplied: number }
  | { kind: 'completed'; backfillId: string; totalProcessed: string; batchesApplied: number }

export type BackfillLogger = {
  info: (event: BackfillLogEvent) => void
}

export type BackfillCheckpoint<Cursor> = {
  backfillId: string
  definitionHash: string
  highWaterMark: Cursor | undefined
  cursor: Cursor | undefined
  processedCount: bigint
  completed: boolean
}

export type BackfillRunResult<Cursor> = BackfillCheckpoint<Cursor> & {
  status: 'completed' | 'paused'
  batchesApplied: number
}

const BACKFILL_ID_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,127}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const MAXIMUM_BATCH_SIZE = 10_000
const BACKFILL_STORE_ADVISORY_LOCK_ID = '7146402031193107722'
const DEFAULT_LOCK_TIMEOUT_MS = 5_000
const DEFAULT_STATEMENT_TIMEOUT_MS = 120_000

export const BACKFILL_CHECKPOINT_TABLE = 'drizzle.__dxrating_backfill_checkpoints'

export const hashBackfillDefinition = (definition: string) => createHash('sha256').update(definition).digest('hex')

export const consoleBackfillLogger: BackfillLogger = {
  info: (event) => console.log(JSON.stringify({ scope: 'backend_backfill', ...event })),
}

export class BackfillDefinitionMismatchError extends Error {
  constructor(backfillId: string) {
    super(`Backfill ${backfillId} does not match its persisted definition hash`)
    this.name = 'BackfillDefinitionMismatchError'
  }
}

export class BackfillCursorIntegrityError extends Error {
  constructor(backfillId: string, message: string) {
    super(`Backfill ${backfillId} returned an invalid keyset batch: ${message}`)
    this.name = 'BackfillCursorIntegrityError'
  }
}

export class BackfillCheckpointIntegrityError extends Error {
  constructor(backfillId: string, message: string) {
    super(`Backfill ${backfillId} has an invalid checkpoint: ${message}`)
    this.name = 'BackfillCheckpointIntegrityError'
  }
}

type CheckpointRow = {
  definition_hash: string
  high_water_mark: unknown | null
  cursor: unknown | null
  processed_count: string
  completed: boolean
}

type CursorEnvelope = { value: BackfillJsonValue }
type BackfillTransactionTimeouts = { lockTimeoutMs: number; statementTimeoutMs: number }

const abortError = () => new DOMException('Backfill interrupted between batches', 'AbortError')

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw abortError()
}

function assertJsonValue(value: unknown, seen = new Set<object>()): asserts value is BackfillJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return
    throw new TypeError('Backfill cursors cannot contain non-finite numbers')
  }
  if (typeof value !== 'object') throw new TypeError('Backfill cursors must be JSON values')
  if (seen.has(value)) throw new TypeError('Backfill cursors cannot contain cycles')

  seen.add(value)
  if (Array.isArray(value)) {
    for (const item of value) assertJsonValue(item, seen)
  } else {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Backfill cursors must contain only plain JSON objects')
    }
    for (const item of Object.values(value)) assertJsonValue(item, seen)
  }
  seen.delete(value)
}

const encodeCursor = <Cursor>(codec: BackfillCursorCodec<Cursor>, cursor: Cursor) => {
  const value: unknown = codec.serialize(cursor)
  assertJsonValue(value)
  return JSON.stringify({ value } satisfies CursorEnvelope)
}

const decodeCursor = <Cursor>(backfillId: string, codec: BackfillCursorCodec<Cursor>, encoded: unknown): Cursor => {
  if (encoded === null || typeof encoded !== 'object' || Array.isArray(encoded) || !Object.hasOwn(encoded, 'value')) {
    throw new BackfillCheckpointIntegrityError(backfillId, 'cursor envelope is malformed')
  }

  const value: unknown = (encoded as { value: unknown }).value
  try {
    assertJsonValue(value)
    return codec.deserialize(value)
  } catch (error) {
    throw new BackfillCheckpointIntegrityError(
      backfillId,
      error instanceof Error ? error.message : 'cursor could not be decoded',
    )
  }
}

const compareCursors = <Cursor>(
  backfillId: string,
  codec: BackfillCursorCodec<Cursor>,
  left: Cursor,
  right: Cursor,
) => {
  const comparison = codec.compare(left, right)
  if (!Number.isFinite(comparison)) {
    throw new BackfillCursorIntegrityError(backfillId, 'cursor comparison was not finite')
  }
  return comparison
}

const validateDefinition = <Row, Cursor>(definition: BackfillDefinition<Row, Cursor>) => {
  if (!BACKFILL_ID_PATTERN.test(definition.id)) {
    throw new TypeError('Backfill id must be a lowercase, non-sensitive operational identifier')
  }
  if (!SHA256_PATTERN.test(definition.definitionHash)) {
    throw new TypeError(`Backfill ${definition.id} must use a lowercase SHA-256 definition hash`)
  }
}

const validateRunOptions = (batchSize: number, maxBatches: number | undefined) => {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAXIMUM_BATCH_SIZE) {
    throw new RangeError(`Backfill batchSize must be an integer from 1 through ${MAXIMUM_BATCH_SIZE}`)
  }
  if (maxBatches !== undefined && (!Number.isInteger(maxBatches) || maxBatches < 1)) {
    throw new RangeError('Backfill maxBatches must be a positive integer when provided')
  }
}

const resolveTransactionTimeouts = (lockTimeoutMs: number, statementTimeoutMs: number): BackfillTransactionTimeouts => {
  if (!Number.isInteger(lockTimeoutMs) || lockTimeoutMs < 100 || lockTimeoutMs > 60_000) {
    throw new RangeError('Backfill lockTimeoutMs must be an integer from 100 through 60000')
  }
  if (!Number.isInteger(statementTimeoutMs) || statementTimeoutMs < 1_000 || statementTimeoutMs > 3_600_000) {
    throw new RangeError('Backfill statementTimeoutMs must be an integer from 1000 through 3600000')
  }
  return { lockTimeoutMs, statementTimeoutMs }
}

const inTransaction = async <T>(
  pool: Pool,
  timeouts: BackfillTransactionTimeouts,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect()
  let transactionOpen = false
  let destroyConnection = false

  try {
    await client.query('BEGIN')
    transactionOpen = true
    await client.query(`SELECT set_config('lock_timeout', $1, true)`, [`${timeouts.lockTimeoutMs}ms`])
    await client.query(`SELECT set_config('statement_timeout', $1, true)`, [`${timeouts.statementTimeoutMs}ms`])
    const result = await operation(client)
    await client.query('COMMIT')
    transactionOpen = false
    return result
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK')
        transactionOpen = false
      } catch {
        destroyConnection = true
      }
    }
    throw error
  } finally {
    client.release(destroyConnection)
  }
}

/**
 * Creates only runner-owned operational metadata, analogous to Drizzle's own migration ledger. Domain
 * tables and backfill-specific state remain migration-owned. Keeping this bootstrap inside the runner lets
 * the first resumable job persist its high-water mark before touching domain rows.
 */
export const ensureBackfillCheckpointStore = async (
  pool: Pool,
  timeouts = resolveTransactionTimeouts(DEFAULT_LOCK_TIMEOUT_MS, DEFAULT_STATEMENT_TIMEOUT_MS),
) => {
  await inTransaction(pool, timeouts, async (client) => {
    // PostgreSQL's IF NOT EXISTS DDL can still race in system catalogs on first use; serialize bootstrap.
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [BACKFILL_STORE_ADVISORY_LOCK_ID])
    await client.query('CREATE SCHEMA IF NOT EXISTS drizzle')
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${BACKFILL_CHECKPOINT_TABLE} (
        backfill_id text PRIMARY KEY,
        definition_hash text NOT NULL CHECK (definition_hash ~ '^[a-f0-9]{64}$'),
        high_water_mark jsonb,
        cursor jsonb,
        processed_count bigint NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
      )
    `)
  })
}

const lockCheckpoint = async (client: PoolClient, backfillId: string) => {
  const result = await client.query<CheckpointRow>(
    `SELECT definition_hash,
            high_water_mark,
            cursor,
            processed_count::text,
            completed_at IS NOT NULL AS completed
     FROM ${BACKFILL_CHECKPOINT_TABLE}
     WHERE backfill_id = $1
     FOR UPDATE`,
    [backfillId],
  )
  return result.rows[0]
}

const checkpointFromRow = <Row, Cursor>(
  definition: BackfillDefinition<Row, Cursor>,
  row: CheckpointRow,
): BackfillCheckpoint<Cursor> => {
  if (row.definition_hash !== definition.definitionHash) {
    throw new BackfillDefinitionMismatchError(definition.id)
  }

  let processedCount: bigint
  try {
    processedCount = BigInt(row.processed_count)
  } catch {
    throw new BackfillCheckpointIntegrityError(definition.id, 'processed count is not an integer')
  }
  if (processedCount < 0n) {
    throw new BackfillCheckpointIntegrityError(definition.id, 'processed count is negative')
  }

  const highWaterMark =
    row.high_water_mark === null ? undefined : decodeCursor(definition.id, definition.cursor, row.high_water_mark)
  const cursor = row.cursor === null ? undefined : decodeCursor(definition.id, definition.cursor, row.cursor)

  if (highWaterMark === undefined && !row.completed) {
    throw new BackfillCheckpointIntegrityError(definition.id, 'an active checkpoint has no high-water mark')
  }
  if (cursor !== undefined && highWaterMark === undefined) {
    throw new BackfillCheckpointIntegrityError(definition.id, 'cursor exists without a high-water mark')
  }
  if (cursor !== undefined && highWaterMark !== undefined) {
    let comparison: number
    try {
      comparison = definition.cursor.compare(cursor, highWaterMark)
    } catch {
      throw new BackfillCheckpointIntegrityError(definition.id, 'cursor could not be compared with its high-water mark')
    }
    if (!Number.isFinite(comparison) || comparison > 0) {
      throw new BackfillCheckpointIntegrityError(definition.id, 'cursor is beyond its fixed high-water mark')
    }
  }

  return {
    backfillId: definition.id,
    definitionHash: definition.definitionHash,
    highWaterMark,
    cursor,
    processedCount,
    completed: row.completed,
  }
}

const initializeCheckpoint = async <Row, Cursor>(
  pool: Pool,
  definition: BackfillDefinition<Row, Cursor>,
  timeouts: BackfillTransactionTimeouts,
) =>
  inTransaction(pool, timeouts, async (client) => {
    let row = await lockCheckpoint(client, definition.id)
    if (!row) {
      const highWaterMark = await definition.getHighWaterMark(client)
      const encodedHighWaterMark = highWaterMark === null ? null : encodeCursor(definition.cursor, highWaterMark)
      await client.query(
        `INSERT INTO ${BACKFILL_CHECKPOINT_TABLE}
           (backfill_id, definition_hash, high_water_mark, completed_at)
         VALUES ($1, $2, $3::jsonb, CASE WHEN $3::jsonb IS NULL THEN clock_timestamp() END)
         ON CONFLICT (backfill_id) DO NOTHING`,
        [definition.id, definition.definitionHash, encodedHighWaterMark],
      )
      row = await lockCheckpoint(client, definition.id)
    }

    if (!row) {
      throw new BackfillCheckpointIntegrityError(definition.id, 'checkpoint could not be initialized')
    }
    return checkpointFromRow(definition, row)
  })

type BatchOutcome<Cursor> =
  | { kind: 'completed'; checkpoint: BackfillCheckpoint<Cursor> }
  | { kind: 'batch_applied'; checkpoint: BackfillCheckpoint<Cursor>; rowCount: number }

const processNextBatch = async <Row, Cursor>(
  pool: Pool,
  definition: BackfillDefinition<Row, Cursor>,
  batchSize: number,
  timeouts: BackfillTransactionTimeouts,
  signal?: AbortSignal,
): Promise<BatchOutcome<Cursor>> =>
  inTransaction(pool, timeouts, async (client) => {
    const row = await lockCheckpoint(client, definition.id)
    if (!row) {
      throw new BackfillCheckpointIntegrityError(definition.id, 'checkpoint disappeared')
    }
    // A worker canceled while waiting on another worker's row lock stops before beginning domain work.
    throwIfAborted(signal)

    const checkpoint = checkpointFromRow(definition, row)
    if (checkpoint.completed) return { kind: 'completed', checkpoint }
    const highWaterMark = checkpoint.highWaterMark
    if (highWaterMark === undefined) {
      throw new BackfillCheckpointIntegrityError(definition.id, 'active checkpoint has no high-water mark')
    }

    const rows = await definition.loadBatch(client, {
      after: checkpoint.cursor,
      through: highWaterMark,
      limit: batchSize,
    })
    if (!Array.isArray(rows)) {
      throw new BackfillCursorIntegrityError(definition.id, 'loadBatch did not return an array')
    }
    if (rows.length > batchSize) {
      throw new BackfillCursorIntegrityError(definition.id, `batch exceeded its limit of ${batchSize}`)
    }

    let previousCursor = checkpoint.cursor
    for (const item of rows) {
      const currentCursor = definition.getCursor(item)
      if (
        previousCursor !== undefined &&
        compareCursors(definition.id, definition.cursor, currentCursor, previousCursor) <= 0
      ) {
        throw new BackfillCursorIntegrityError(definition.id, 'cursors were not strictly increasing')
      }
      if (compareCursors(definition.id, definition.cursor, currentCursor, highWaterMark) > 0) {
        throw new BackfillCursorIntegrityError(definition.id, 'a cursor exceeded the fixed high-water mark')
      }
      previousCursor = currentCursor
    }

    if (!rows.length) {
      const completed = await client.query<CheckpointRow>(
        `UPDATE ${BACKFILL_CHECKPOINT_TABLE}
         SET completed_at = COALESCE(completed_at, clock_timestamp()),
             updated_at = clock_timestamp()
         WHERE backfill_id = $1
         RETURNING definition_hash,
                   high_water_mark,
                   cursor,
                   processed_count::text,
                   completed_at IS NOT NULL AS completed`,
        [definition.id],
      )
      const completedRow = completed.rows[0]
      if (!completedRow) {
        throw new BackfillCheckpointIntegrityError(definition.id, 'completion checkpoint update failed')
      }
      return { kind: 'completed', checkpoint: checkpointFromRow(definition, completedRow) }
    }

    await definition.applyBatch(client, rows)
    const lastCursor = definition.getCursor(rows.at(-1)!)
    const updated = await client.query<CheckpointRow>(
      `UPDATE ${BACKFILL_CHECKPOINT_TABLE}
       SET cursor = $2::jsonb,
           processed_count = processed_count + $3,
           updated_at = clock_timestamp()
       WHERE backfill_id = $1
       RETURNING definition_hash,
                 high_water_mark,
                 cursor,
                 processed_count::text,
                 completed_at IS NOT NULL AS completed`,
      [definition.id, encodeCursor(definition.cursor, lastCursor), rows.length],
    )
    const updatedRow = updated.rows[0]
    if (!updatedRow) {
      throw new BackfillCheckpointIntegrityError(definition.id, 'checkpoint advancement failed')
    }
    return {
      kind: 'batch_applied',
      checkpoint: checkpointFromRow(definition, updatedRow),
      rowCount: rows.length,
    }
  })

export const runResumableBackfill = async <Row, Cursor>({
  pool,
  definition,
  batchSize,
  maxBatches,
  lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS,
  statementTimeoutMs = DEFAULT_STATEMENT_TIMEOUT_MS,
  signal,
  logger = consoleBackfillLogger,
}: {
  pool: Pool
  definition: BackfillDefinition<Row, Cursor>
  batchSize: number
  maxBatches?: number
  lockTimeoutMs?: number
  statementTimeoutMs?: number
  signal?: AbortSignal
  logger?: BackfillLogger
}): Promise<BackfillRunResult<Cursor>> => {
  validateDefinition(definition)
  validateRunOptions(batchSize, maxBatches)
  const timeouts = resolveTransactionTimeouts(lockTimeoutMs, statementTimeoutMs)
  throwIfAborted(signal)
  await ensureBackfillCheckpointStore(pool, timeouts)
  throwIfAborted(signal)

  let checkpoint = await initializeCheckpoint(pool, definition, timeouts)
  let batchesApplied = 0
  if (checkpoint.completed) {
    logger.info({
      kind: 'completed',
      backfillId: definition.id,
      totalProcessed: checkpoint.processedCount.toString(),
      batchesApplied,
    })
    return { ...checkpoint, status: 'completed', batchesApplied }
  }

  while (true) {
    throwIfAborted(signal)
    const startedAt = performance.now()
    const outcome = await processNextBatch(pool, definition, batchSize, timeouts, signal)
    checkpoint = outcome.checkpoint

    if (outcome.kind === 'completed') {
      logger.info({
        kind: 'completed',
        backfillId: definition.id,
        totalProcessed: checkpoint.processedCount.toString(),
        batchesApplied,
      })
      return { ...checkpoint, status: 'completed', batchesApplied }
    }

    batchesApplied += 1
    logger.info({
      kind: 'batch_applied',
      backfillId: definition.id,
      rowCount: outcome.rowCount,
      totalProcessed: checkpoint.processedCount.toString(),
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    })

    // An abort raised while a batch was running is intentionally observed only after its transaction commits.
    throwIfAborted(signal)
    if (maxBatches !== undefined && batchesApplied >= maxBatches) {
      logger.info({
        kind: 'paused',
        backfillId: definition.id,
        totalProcessed: checkpoint.processedCount.toString(),
        batchesApplied,
      })
      return { ...checkpoint, status: 'paused', batchesApplied }
    }
  }
}