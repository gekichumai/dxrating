import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import * as path from 'node:path'
import type { ClientBase } from 'pg'
import { z } from 'zod'
import type { MigrationLogger } from './migration-runner.js'

const reviewedFileSchema = z.object({
  file: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.sql$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})

const manifestEntrySchema = z.object({
  id: z.string().regex(/^\d{4}_[a-z0-9][a-z0-9_-]*$/),
  operation: reviewedFileSchema,
  verification: reviewedFileSchema,
})

const manifestSchema = z.object({
  version: z.literal(1),
  entries: z.array(manifestEntrySchema).superRefine((entries, context) => {
    const ids = new Set<string>()
    const files = new Set<string>()
    let previousId: string | undefined
    for (const [index, entry] of entries.entries()) {
      if (ids.has(entry.id)) {
        context.addIssue({ code: 'custom', message: `Duplicate migration id ${entry.id}`, path: [index, 'id'] })
      }
      if (previousId && entry.id <= previousId) {
        context.addIssue({
          code: 'custom',
          message: 'Migration entries must be strictly ordered by id',
          path: [index, 'id'],
        })
      }
      for (const reviewedFile of [entry.operation.file, entry.verification.file]) {
        if (files.has(reviewedFile)) {
          context.addIssue({
            code: 'custom',
            message: `Duplicate reviewed file ${reviewedFile}`,
            path: [index],
          })
        }
        files.add(reviewedFile)
      }
      ids.add(entry.id)
      previousId = entry.id
    }
  }),
})

const TRANSACTION_CONTROL_STATEMENT = /^\s*(begin|start\s+transaction|commit|rollback)\b/i

export class NonTransactionalMigrationIntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NonTransactionalMigrationIntegrityError'
  }
}

export const assertAppliedMigrationsFormManifestPrefix = (manifestIds: string[], appliedIds: string[]) => {
  const expectedPrefix = manifestIds.slice(0, appliedIds.length)
  if (appliedIds.length > manifestIds.length || appliedIds.some((id, index) => id !== expectedPrefix[index])) {
    throw new NonTransactionalMigrationIntegrityError(
      'Applied non-transactional migrations must be an exact prefix of the reviewed manifest',
    )
  }
}

const sha256 = (source: string) => createHash('sha256').update(source).digest('hex')

const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\r\n]*/g, '')

const readDollarQuoteDelimiter = (source: string, offset: number) => {
  const match = source.slice(offset).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)
  return match?.[0]
}

export const countSqlStatements = (source: string) => {
  let state: 'normal' | 'single_quote' | 'double_quote' | 'line_comment' | 'block_comment' | 'dollar_quote' = 'normal'
  let blockDepth = 0
  let dollarDelimiter = ''
  let hasTokens = false
  let statementCount = 0

  for (let offset = 0; offset < source.length; offset += 1) {
    const character = source[offset]
    const next = source[offset + 1]

    if (state === 'line_comment') {
      if (character === '\n') state = 'normal'
      continue
    }
    if (state === 'block_comment') {
      if (character === '/' && next === '*') {
        blockDepth += 1
        offset += 1
      } else if (character === '*' && next === '/') {
        blockDepth -= 1
        offset += 1
        if (blockDepth === 0) state = 'normal'
      }
      continue
    }
    if (state === 'single_quote') {
      if (character === "'" && next === "'") offset += 1
      else if (character === "'") state = 'normal'
      continue
    }
    if (state === 'double_quote') {
      if (character === '"' && next === '"') offset += 1
      else if (character === '"') state = 'normal'
      continue
    }
    if (state === 'dollar_quote') {
      if (source.startsWith(dollarDelimiter, offset)) {
        offset += dollarDelimiter.length - 1
        state = 'normal'
      }
      continue
    }

    if (character === '-' && next === '-') {
      state = 'line_comment'
      offset += 1
    } else if (character === '/' && next === '*') {
      state = 'block_comment'
      blockDepth = 1
      offset += 1
    } else if (character === "'") {
      hasTokens = true
      state = 'single_quote'
    } else if (character === '"') {
      hasTokens = true
      state = 'double_quote'
    } else if (character === '$') {
      const delimiter = readDollarQuoteDelimiter(source, offset)
      if (delimiter) {
        hasTokens = true
        dollarDelimiter = delimiter
        state = 'dollar_quote'
        offset += delimiter.length - 1
      } else {
        hasTokens = true
      }
    } else if (character === ';') {
      if (hasTokens) statementCount += 1
      hasTokens = false
    } else if (character && !/\s/.test(character)) {
      hasTokens = true
    }
  }

  if (!['normal', 'line_comment'].includes(state)) {
    throw new NonTransactionalMigrationIntegrityError('Reviewed SQL contains an unterminated quoted value or comment')
  }
  if (hasTokens) statementCount += 1
  return statementCount
}

const readReviewedSql = async (
  migrationsFolder: string,
  reviewedFile: z.infer<typeof reviewedFileSchema>,
  migrationId: string,
) => {
  const source = await readFile(path.join(migrationsFolder, reviewedFile.file), 'utf8')
  if (sha256(source) !== reviewedFile.sha256) {
    throw new NonTransactionalMigrationIntegrityError(
      `Non-transactional migration ${migrationId} does not match its reviewed digest`,
    )
  }
  if (countSqlStatements(source) !== 1) {
    throw new NonTransactionalMigrationIntegrityError(
      `Non-transactional migration ${migrationId} must contain exactly one SQL statement per reviewed file`,
    )
  }
  return source
}

const verifyPostcondition = async (client: ClientBase, source: string, migrationId: string) => {
  await client.query('BEGIN READ ONLY')
  try {
    const result = await client.query<{ verified: boolean }>(source)
    if (result.rowCount !== 1 || result.rows[0]?.verified !== true) {
      throw new NonTransactionalMigrationIntegrityError(
        `Non-transactional migration ${migrationId} did not satisfy its reviewed postcondition`,
      )
    }
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Interruption may already have destroyed the session.
    }
    throw error
  }
  await client.query('ROLLBACK')
}

export const runNonTransactionalMigrations = async ({
  client,
  migrationsFolder,
  logger,
  signal,
}: {
  client: ClientBase
  migrationsFolder: string
  logger: MigrationLogger
  signal?: AbortSignal
}) => {
  const manifestPath = path.join(migrationsFolder, 'manifest.json')
  const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')))
  const reviewedFiles = new Set(manifest.entries.flatMap((entry) => [entry.operation.file, entry.verification.file]))
  const orphanFiles = (await readdir(migrationsFolder)).filter(
    (file) => file.endsWith('.sql') && !reviewedFiles.has(file),
  )
  if (orphanFiles.length) {
    throw new NonTransactionalMigrationIntegrityError(
      `Non-transactional migration directory contains unreviewed SQL: ${orphanFiles.sort().join(', ')}`,
    )
  }

  await client.query('CREATE SCHEMA IF NOT EXISTS drizzle')
  await client.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__dxrating_non_transactional_migrations (
      id text PRIMARY KEY,
      operation_sha256 text NOT NULL,
      verification_sha256 text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      duration_ms bigint NOT NULL CHECK (duration_ms >= 0)
    )
  `)

  const orderedManifestIds = manifest.entries.map((entry) => entry.id)
  const manifestIds = new Set(orderedManifestIds)
  const appliedEntries = await client.query<{ id: string }>(
    `SELECT id
       FROM drizzle.__dxrating_non_transactional_migrations
      ORDER BY id`,
  )
  const unknownAppliedIds = appliedEntries.rows
    .map((entry) => entry.id)
    .filter((migrationId) => !manifestIds.has(migrationId))
  if (unknownAppliedIds.length) {
    throw new NonTransactionalMigrationIntegrityError(
      `The database contains non-transactional migrations absent from this runner: ${unknownAppliedIds.join(', ')}`,
    )
  }
  assertAppliedMigrationsFormManifestPrefix(
    orderedManifestIds,
    appliedEntries.rows.map((entry) => entry.id),
  )

  for (const entry of manifest.entries) {
    if (signal?.aborted) throw new DOMException('Migration job interrupted', 'AbortError')

    const operation = await readReviewedSql(migrationsFolder, entry.operation, entry.id)
    const verification = await readReviewedSql(migrationsFolder, entry.verification, entry.id)
    if (TRANSACTION_CONTROL_STATEMENT.test(withoutComments(operation))) {
      throw new NonTransactionalMigrationIntegrityError(
        `Non-transactional migration ${entry.id} contains transaction control SQL`,
      )
    }
    if (!/^\s*(select|with)\b/i.test(withoutComments(verification))) {
      throw new NonTransactionalMigrationIntegrityError(
        `Non-transactional migration ${entry.id} verification must be a read-only query`,
      )
    }

    const existing = await client.query<{ operation_sha256: string; verification_sha256: string }>(
      `SELECT operation_sha256, verification_sha256
       FROM drizzle.__dxrating_non_transactional_migrations WHERE id = $1`,
      [entry.id],
    )
    if (existing.rowCount) {
      const applied = existing.rows[0]
      if (
        applied?.operation_sha256 !== entry.operation.sha256 ||
        applied.verification_sha256 !== entry.verification.sha256
      ) {
        throw new NonTransactionalMigrationIntegrityError(
          `Applied non-transactional migration ${entry.id} does not match its reviewed digest`,
        )
      }
      await verifyPostcondition(client, verification, entry.id)
      logger.info({ kind: 'non_transactional_skipped', migrationId: entry.id })
      continue
    }

    const startedAt = performance.now()
    await client.query(operation)
    await verifyPostcondition(client, verification, entry.id)
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt))
    await client.query(
      `INSERT INTO drizzle.__dxrating_non_transactional_migrations
         (id, operation_sha256, verification_sha256, duration_ms)
       VALUES ($1, $2, $3, $4)`,
      [entry.id, entry.operation.sha256, entry.verification.sha256, durationMs],
    )
    logger.info({ kind: 'non_transactional_applied', migrationId: entry.id, durationMs })
  }
}