import { readFile } from 'node:fs/promises'
import * as path from 'node:path'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Client, type ClientConfig } from 'pg'
import { z } from 'zod'
import type { BackendMigrationConfig } from './migration-config.js'
import { preflightGeneratedMigrationLedger } from './migration-ledger.js'
import { runNonTransactionalMigrations } from './non-transactional-migrations.js'

// Fixed, repository-owned 64-bit key. It is intentionally independent of
// deployment names so every backend migration job for the database contends
// on the same PostgreSQL session lock.
export const BACKEND_MIGRATION_ADVISORY_LOCK_ID = '7146402031193107721'

const journalSchema = z.object({
  entries: z.array(
    z.object({
      idx: z.number().int().nonnegative(),
      when: z.number().int().nonnegative(),
      tag: z.string().min(1),
    }),
  ),
})

export type MigrationLogEvent =
  | { kind: 'lock_acquired'; waitMs: number }
  | { kind: 'legacy_reconciled'; migrationId: string; durationMs: number }
  | { kind: 'generated_applied'; migrationIds: string[]; durationMs: number }
  | { kind: 'generated_current'; durationMs: number }
  | { kind: 'non_transactional_applied'; migrationId: string; durationMs: number }
  | { kind: 'non_transactional_skipped'; migrationId: string }
  | { kind: 'completed'; durationMs: number }
  | { kind: 'lock_release_failed' }

export type MigrationLogger = {
  info: (event: MigrationLogEvent) => void
  error: (event: MigrationLogEvent) => void
}

export const consoleMigrationLogger: MigrationLogger = {
  info: (event) => console.log(JSON.stringify({ scope: 'backend_migration', ...event })),
  error: (event) => console.error(JSON.stringify({ scope: 'backend_migration', ...event })),
}

export class MigrationLockTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Backend migration lock was not acquired within ${timeoutMs}ms`)
    this.name = 'MigrationLockTimeoutError'
  }
}

const abortableDelay = (durationMs: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Migration job interrupted', 'AbortError'))
      return
    }

    const handleAbort = () => {
      clearTimeout(timeout)
      reject(new DOMException('Migration job interrupted', 'AbortError'))
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort)
      resolve()
    }, durationMs)
    signal?.addEventListener('abort', handleAbort, { once: true })
  })

const createMigrationClient = (config: BackendMigrationConfig) => {
  const clientConfig: ClientConfig = {
    connectionString: config.databaseUrl,
    application_name: 'dxrating-backend-migration',
    connectionTimeoutMillis: config.connectionTimeoutMs,
    statement_timeout: config.statementTimeoutMs,
    lock_timeout: config.sqlLockTimeoutMs,
  }
  return new Client(clientConfig)
}

export const withBackendMigrationLock = async <T>({
  config,
  operation,
  logger = consoleMigrationLogger,
  signal,
  createClient = createMigrationClient,
}: {
  config: BackendMigrationConfig
  operation: (client: Client) => Promise<T>
  logger?: MigrationLogger
  signal?: AbortSignal
  createClient?: (config: BackendMigrationConfig) => Client
}): Promise<T> => {
  const client = createClient(config)
  const startedAt = performance.now()
  let acquired = false
  let connected = false
  let backendProcessId: number | undefined
  let closePromise: Promise<void> | undefined
  let resolveClientConnectionFailure: ((error: Error) => void) | undefined
  const clientConnectionFailure = new Promise<Error>((resolve) => {
    resolveClientConnectionFailure = resolve
  })

  // node-postgres emits an `error` event as well as rejecting an active query
  // when PostgreSQL terminates the session. Keep an error listener installed
  // for the client's full lifetime so an intentional SIGTERM/SIGINT cleanup
  // cannot become an uncaught process-level error. Racing the operation also
  // makes an otherwise-idle connection failure fail the migration job.
  client.on('error', (error) => resolveClientConnectionFailure?.(error))

  const terminateLockedSession = async () => {
    const terminator = createClient(config)
    try {
      await terminator.connect()
      await terminator.query('SELECT pg_terminate_backend($1)', [backendProcessId])
    } catch {
      // Closing the original socket is still the safe fallback when a
      // separate cancellation connection cannot be established.
      logger.error({ kind: 'lock_release_failed' })
    } finally {
      try {
        await terminator.end()
      } catch {
        // Continue to the original connection cleanup.
      }
      try {
        await client.end()
      } catch {
        // The backend may already have closed the terminated connection.
      }
    }
  }

  const destroyConnectionOnAbort = () => {
    if (!connected || closePromise) return
    closePromise = acquired && backendProcessId ? terminateLockedSession() : client.end()
  }

  try {
    await client.connect()
    connected = true
    const backend = await client.query<{ process_id: number }>('SELECT pg_backend_pid()::integer AS process_id')
    backendProcessId = backend.rows[0]?.process_id
    signal?.addEventListener('abort', destroyConnectionOnAbort, { once: true })
    while (!acquired) {
      if (signal?.aborted) throw new DOMException('Migration job interrupted', 'AbortError')

      const result = await client.query<{ acquired: boolean }>('SELECT pg_try_advisory_lock($1::bigint) AS acquired', [
        BACKEND_MIGRATION_ADVISORY_LOCK_ID,
      ])
      acquired = result.rows[0]?.acquired === true
      if (acquired) break

      const elapsedMs = performance.now() - startedAt
      if (elapsedMs >= config.lockTimeoutMs) throw new MigrationLockTimeoutError(config.lockTimeoutMs)
      await abortableDelay(Math.min(config.lockRetryMs, config.lockTimeoutMs - elapsedMs), signal)
    }

    logger.info({ kind: 'lock_acquired', waitMs: Math.max(0, Math.round(performance.now() - startedAt)) })
    const result = await Promise.race([
      operation(client).then((value) => ({ kind: 'result' as const, value })),
      clientConnectionFailure.then((error) => ({ kind: 'connection_error' as const, error })),
    ])
    if (result.kind === 'connection_error') throw result.error
    return result.value
  } finally {
    signal?.removeEventListener('abort', destroyConnectionOnAbort)
    if (acquired && !closePromise) {
      try {
        await client.query('SELECT pg_advisory_unlock($1::bigint)', [BACKEND_MIGRATION_ADVISORY_LOCK_ID])
      } catch {
        logger.error({ kind: 'lock_release_failed' })
      }
    }
    if (connected && !closePromise) closePromise = client.end()
    await closePromise
  }
}

const getLastGeneratedMigrationTimestamp = async (client: Client) => {
  const table = await client.query<{ relation: string | null }>(
    `SELECT to_regclass('drizzle.__drizzle_migrations')::text AS relation`,
  )
  if (!table.rows[0]?.relation) return undefined

  const result = await client.query<{ created_at: string | null }>(
    'SELECT max(created_at)::text AS created_at FROM drizzle.__drizzle_migrations',
  )
  const value = result.rows[0]?.created_at
  return value === null || value === undefined ? undefined : Number(value)
}

const runGeneratedMigrations = async (
  client: Client,
  migrationsFolder: string,
  logger: MigrationLogger,
  allowLegacyReconciliation: boolean,
  signal?: AbortSignal,
) => {
  if (signal?.aborted) throw new DOMException('Migration job interrupted', 'AbortError')

  await preflightGeneratedMigrationLedger({
    client,
    migrationsFolder,
    allowLegacyReconciliation,
    onReconciled: (migrationId, durationMs) => logger.info({ kind: 'legacy_reconciled', migrationId, durationMs }),
  })
  if (signal?.aborted) throw new DOMException('Migration job interrupted', 'AbortError')

  const journal = journalSchema.parse(
    JSON.parse(await readFile(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8')),
  )
  const lastAppliedAt = await getLastGeneratedMigrationTimestamp(client)
  const pending = journal.entries.filter((entry) => lastAppliedAt === undefined || entry.when > lastAppliedAt)
  const startedAt = performance.now()

  await migrate(drizzle(client), { migrationsFolder })

  const durationMs = Math.max(0, Math.round(performance.now() - startedAt))
  if (!pending.length) {
    logger.info({ kind: 'generated_current', durationMs })
    return
  }

  logger.info({
    kind: 'generated_applied',
    migrationIds: pending.map((migration) => migration.tag),
    durationMs,
  })
}

export const runBackendMigrations = async (
  config: BackendMigrationConfig,
  {
    logger = consoleMigrationLogger,
    signal,
    operation,
    allowLegacyReconciliation = false,
  }: {
    logger?: MigrationLogger
    signal?: AbortSignal
    operation?: (client: Client) => Promise<void>
    allowLegacyReconciliation?: boolean
  } = {},
) => {
  const startedAt = performance.now()
  await withBackendMigrationLock({
    config,
    logger,
    signal,
    operation: async (client) => {
      if (operation) {
        await operation(client)
        return
      }

      await runGeneratedMigrations(client, config.migrationsFolder, logger, allowLegacyReconciliation, signal)
      if (signal?.aborted) throw new DOMException('Migration job interrupted', 'AbortError')
      await runNonTransactionalMigrations({
        client,
        migrationsFolder: config.nonTransactionalMigrationsFolder,
        logger,
        signal,
      })
    },
  })
  logger.info({ kind: 'completed', durationMs: Math.max(0, Math.round(performance.now() - startedAt)) })
}