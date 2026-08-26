import { Pool } from 'pg'
import { z } from 'zod'
import { runAdminCommentCreatedAtBackfill } from './db/admin-comment-created-at-backfill.js'

const integerFromEnvironment = (defaultValue: number, minimum: number, maximum: number) =>
  z.preprocess(
    (value) => (value === undefined || value === '' ? defaultValue : value),
    z.coerce.number().int().min(minimum).max(maximum),
  )

const optionalPositiveInteger = z.preprocess(
  (value) => (value === undefined || value === '' ? undefined : value),
  z.coerce.number().int().positive().optional(),
)

const environmentSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol)),
  ADMIN_COMMENT_CREATED_AT_BACKFILL_BATCH_SIZE: integerFromEnvironment(500, 1, 10_000),
  ADMIN_COMMENT_CREATED_AT_BACKFILL_MAX_BATCHES: optionalPositiveInteger,
  ADMIN_COMMENT_CREATED_AT_BACKFILL_CONNECTION_TIMEOUT_MS: integerFromEnvironment(10_000, 100, 120_000),
  ADMIN_COMMENT_CREATED_AT_BACKFILL_LOCK_TIMEOUT_MS: integerFromEnvironment(5_000, 100, 60_000),
  ADMIN_COMMENT_CREATED_AT_BACKFILL_STATEMENT_TIMEOUT_MS: integerFromEnvironment(120_000, 1_000, 3_600_000),
})

const interruption = new AbortController()
let receivedSignal: NodeJS.Signals | undefined

const handleSignal = (signal: NodeJS.Signals) => {
  receivedSignal = signal
  interruption.abort()
}
const handleSigint = () => handleSignal('SIGINT')
const handleSigterm = () => handleSignal('SIGTERM')

process.once('SIGINT', handleSigint)
process.once('SIGTERM', handleSigterm)

let database: Pool | undefined
try {
  const environment = environmentSchema.parse(process.env)
  database = new Pool({
    connectionString: environment.DATABASE_URL,
    connectionTimeoutMillis: environment.ADMIN_COMMENT_CREATED_AT_BACKFILL_CONNECTION_TIMEOUT_MS,
    max: 2,
  })
  await runAdminCommentCreatedAtBackfill({
    pool: database,
    batchSize: environment.ADMIN_COMMENT_CREATED_AT_BACKFILL_BATCH_SIZE,
    maxBatches: environment.ADMIN_COMMENT_CREATED_AT_BACKFILL_MAX_BATCHES,
    lockTimeoutMs: environment.ADMIN_COMMENT_CREATED_AT_BACKFILL_LOCK_TIMEOUT_MS,
    statementTimeoutMs: environment.ADMIN_COMMENT_CREATED_AT_BACKFILL_STATEMENT_TIMEOUT_MS,
    signal: interruption.signal,
  })
  if (receivedSignal) process.exitCode = receivedSignal === 'SIGINT' ? 130 : 143
} catch (error) {
  if (receivedSignal || (error instanceof DOMException && error.name === 'AbortError')) {
    console.error(
      'Administrator comment creation-time backfill interrupted between bounded batches; it is safe to retry',
    )
    process.exitCode = receivedSignal === 'SIGINT' ? 130 : 143
  } else {
    console.error(
      JSON.stringify({
        scope: 'admin_comment_created_at_backfill',
        kind: 'failed',
        failureType: error instanceof Error ? error.name : 'UnknownBackfillError',
      }),
    )
    process.exitCode = 1
  }
} finally {
  await database?.end()
  process.removeListener('SIGINT', handleSigint)
  process.removeListener('SIGTERM', handleSigterm)
}