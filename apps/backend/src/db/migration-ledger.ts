import { readFile } from 'node:fs/promises'
import * as path from 'node:path'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import type { ClientBase } from 'pg'
import { z } from 'zod'

const journalSchema = z.object({
  entries: z.array(
    z.object({
      idx: z.number().int().nonnegative(),
      when: z.number().int().nonnegative(),
      tag: z.string().min(1),
    }),
  ),
})

type GeneratedMigration = {
  id: string
  index: number
  createdAt: number
  hash: string
  statements: string[]
}

type LedgerRow = {
  id: number
  hash: string
  created_at: string
}

type LegacyMigration = {
  id: string
  hash: string
  createdAt: number
  verify: (client: ClientBase) => Promise<void>
}

// These immutable fingerprints are from repository history. They are the only
// historical generated files that this runner is permitted to reconcile
// automatically, and only after their resulting schema is verified.
const LEGACY_LXNS_OAUTH: Omit<LegacyMigration, 'verify'> = {
  id: '0004_add_lxns_oauth',
  hash: '055d6c11d23670b8f7e76fbe9f2d415d605eed61516200165234f1d4b2b4aa26',
  createdAt: 1742691600000,
}

const LEGACY_CHAIN_AUDIT: Omit<LegacyMigration, 'verify'> = {
  id: '0008_arcade_chain_audit_alignment',
  hash: 'b5d1fb99a186152fa6b01949508c5fa58bddae6cae2221201b9a4270bd862cc2',
  createdAt: 1785534392377,
}

export class GeneratedMigrationLedgerIntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeneratedMigrationLedgerIntegrityError'
  }
}

export class LegacyMigrationReconciliationRequiredError extends Error {
  readonly migrationIds: string[]

  constructor(migrationIds: string[]) {
    super(`Explicit legacy migration reconciliation is required for: ${migrationIds.join(', ')}`)
    this.name = 'LegacyMigrationReconciliationRequiredError'
    this.migrationIds = migrationIds
  }
}

const readGeneratedMigrations = async (migrationsFolder: string): Promise<GeneratedMigration[]> => {
  const journal = journalSchema.parse(
    JSON.parse(await readFile(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8')),
  )
  const files = readMigrationFiles({ migrationsFolder })

  if (files.length !== journal.entries.length) {
    throw new GeneratedMigrationLedgerIntegrityError(
      'The Drizzle journal does not have exactly one generated SQL file per entry',
    )
  }

  return journal.entries.map((entry, index) => {
    const file = files[index]
    if (!file || entry.idx !== index || file.folderMillis !== entry.when) {
      throw new GeneratedMigrationLedgerIntegrityError(
        `Generated migration journal metadata is inconsistent at ${entry.tag}`,
      )
    }
    return {
      id: entry.tag,
      index,
      createdAt: entry.when,
      hash: file.hash,
      statements: file.sql,
    }
  })
}

const assertExpectedColumns = async (
  client: ClientBase,
  schema: string,
  table: string,
  expected: Array<{ name: string; type: string; nullable: boolean; default: RegExp | null }>,
) => {
  const result = await client.query<{
    column_name: string
    data_type: string
    is_nullable: string
    column_default: string | null
  }>(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2`,
    [schema, table],
  )
  const actual = new Map(result.rows.map((column) => [column.column_name, column]))
  for (const column of expected) {
    const found = actual.get(column.name)
    const defaultMatches =
      column.default === null ? found?.column_default === null : column.default.test(found?.column_default ?? '')
    if (
      !found ||
      found.data_type !== column.type ||
      (found.is_nullable === 'YES') !== column.nullable ||
      !defaultMatches
    ) {
      throw new GeneratedMigrationLedgerIntegrityError(
        `Legacy migration schema verification failed for ${schema}.${table}.${column.name}`,
      )
    }
  }
}

const readConstraintDefinitions = async (client: ClientBase, schema: string, table: string) => {
  const result = await client.query<{ name: string; definition: string; validated: boolean }>(
    `SELECT constraint_name AS name,
            pg_get_constraintdef(pg_constraint.oid, true) AS definition,
            convalidated AS validated
       FROM information_schema.table_constraints
       JOIN pg_namespace ON pg_namespace.nspname = table_schema
       JOIN pg_class ON pg_class.relnamespace = pg_namespace.oid AND pg_class.relname = table_name
       JOIN pg_constraint ON pg_constraint.conrelid = pg_class.oid
                         AND pg_constraint.conname = constraint_name
      WHERE table_schema = $1 AND table_name = $2`,
    [schema, table],
  )
  return new Map(result.rows.map((constraint) => [constraint.name, constraint]))
}

const verifyLocalizedTags = async (client: ClientBase) => {
  await assertExpectedColumns(client, 'public', 'tags', [
    { name: 'localized_name', type: 'jsonb', nullable: false, default: null },
    { name: 'localized_description', type: 'jsonb', nullable: false, default: null },
  ])
}

const verifyLxnsOauth = async (client: ClientBase) => {
  await assertExpectedColumns(client, 'public', 'lxns_oauth_states', [
    {
      name: 'id',
      type: 'bigint',
      nullable: false,
      default: /^nextval\('lxns_oauth_states_id_seq'::regclass\)$/,
    },
    { name: 'state', type: 'text', nullable: false, default: null },
    { name: 'user_id', type: 'text', nullable: false, default: null },
    { name: 'created_at', type: 'timestamp without time zone', nullable: false, default: /^now\(\)$/ },
  ])
  await assertExpectedColumns(client, 'public', 'lxns_oauth_tokens', [
    { name: 'user_id', type: 'text', nullable: false, default: null },
    { name: 'access_token', type: 'text', nullable: false, default: null },
    { name: 'refresh_token', type: 'text', nullable: false, default: null },
    { name: 'expires_at', type: 'timestamp without time zone', nullable: false, default: null },
    { name: 'scope', type: 'text', nullable: false, default: null },
    { name: 'created_at', type: 'timestamp without time zone', nullable: false, default: /^now\(\)$/ },
    { name: 'updated_at', type: 'timestamp without time zone', nullable: false, default: /^now\(\)$/ },
  ])

  const statesConstraints = await readConstraintDefinitions(client, 'public', 'lxns_oauth_states')
  const tokensConstraints = await readConstraintDefinitions(client, 'public', 'lxns_oauth_tokens')
  const required = [
    statesConstraints.get('lxns_oauth_states_pkey')?.validated &&
      statesConstraints.get('lxns_oauth_states_pkey')?.definition.startsWith('PRIMARY KEY (id)'),
    statesConstraints.get('lxns_oauth_states_state_unique')?.validated &&
      statesConstraints.get('lxns_oauth_states_state_unique')?.definition.startsWith('UNIQUE (state)'),
    statesConstraints.get('lxns_oauth_states_user_id_user_id_fk')?.validated &&
      statesConstraints
        .get('lxns_oauth_states_user_id_user_id_fk')
        ?.definition.includes('FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE'),
    tokensConstraints.get('lxns_oauth_tokens_pkey')?.validated &&
      tokensConstraints.get('lxns_oauth_tokens_pkey')?.definition.startsWith('PRIMARY KEY (user_id)'),
    tokensConstraints.get('lxns_oauth_tokens_user_id_user_id_fk')?.validated &&
      tokensConstraints
        .get('lxns_oauth_tokens_user_id_user_id_fk')
        ?.definition.includes('FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE'),
  ]
  if (required.some((condition) => condition !== true)) {
    throw new GeneratedMigrationLedgerIntegrityError(
      'Legacy migration schema verification failed for the LXNS OAuth constraints',
    )
  }
}

const verifyChainAudit = async (client: ClientBase) => {
  const decisions = await readConstraintDefinitions(client, 'arcade', 'venue_chain_decisions')
  const chains = await readConstraintDefinitions(client, 'arcade', 'chains')
  const check = chains.get('chains_country_codes_nonempty_check')
  if (
    decisions.has('venue_chain_decisions_input_unique') ||
    !check?.validated ||
    !check.definition.includes('cardinality(country_codes) > 0')
  ) {
    throw new GeneratedMigrationLedgerIntegrityError(
      'Legacy migration schema verification failed for the arcade chain audit constraints',
    )
  }
}

const legacyMigrations: LegacyMigration[] = [
  { ...LEGACY_LXNS_OAUTH, verify: verifyLxnsOauth },
  { ...LEGACY_CHAIN_AUDIT, verify: verifyChainAudit },
]

const hasGeneratedSchemaWithoutLedger = async (client: ClientBase) => {
  const result = await client.query<{ object_count: string }>(`
    SELECT count(*)::text AS object_count
      FROM (VALUES
        (to_regclass('public.comments')),
        (to_regclass('public.tags')),
        (to_regclass('public."user"')),
        (to_regclass('public.lxns_oauth_states')),
        (to_regclass('arcade.games'))
      ) AS known_objects(relation)
     WHERE relation IS NOT NULL
  `)
  return Number(result.rows[0]?.object_count ?? 0) > 0
}

const readLedger = async (client: ClientBase): Promise<LedgerRow[]> => {
  const relation = await client.query<{ relation: string | null }>(
    `SELECT to_regclass('drizzle.__drizzle_migrations')::text AS relation`,
  )
  if (!relation.rows[0]?.relation) return []
  const result = await client.query<LedgerRow>(
    `SELECT id, hash, created_at::text AS created_at
       FROM drizzle.__drizzle_migrations
      ORDER BY id`,
  )
  return result.rows
}

const insertLedgerEntry = async (client: ClientBase, migration: GeneratedMigration) => {
  await client.query(
    `INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
     VALUES ($1, $2)`,
    [migration.hash, migration.createdAt],
  )
}

const reconcileLocalizedTags = async (client: ClientBase, migration: GeneratedMigration) => {
  const columns = await client.query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tags'
        AND column_name IN ('localized_name', 'localized_description')`,
  )
  const types = new Map(columns.rows.map((column) => [column.column_name, column.data_type]))
  const values = [types.get('localized_name'), types.get('localized_description')]
  const canApply = values.every((type) => type === 'text')
  const alreadyApplied = values.every((type) => type === 'jsonb')
  if (!canApply && !alreadyApplied) {
    throw new GeneratedMigrationLedgerIntegrityError(`Legacy migration schema verification failed for ${migration.id}`)
  }

  await client.query('BEGIN')
  try {
    if (canApply) {
      for (const statement of migration.statements) await client.query(statement)
    }
    await verifyLocalizedTags(client)
    await insertLedgerEntry(client, migration)
    await client.query('COMMIT')
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // An interruption destroys the session so PostgreSQL performs rollback.
    }
    throw error
  }
}

const reconcileEquivalentLegacyMigration = async (
  client: ClientBase,
  migration: GeneratedMigration,
  legacy: LegacyMigration,
) => {
  await client.query('BEGIN')
  try {
    await legacy.verify(client)
    await insertLedgerEntry(client, migration)
    await client.query('COMMIT')
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // An interruption destroys the session so PostgreSQL performs rollback.
    }
    throw error
  }
}

export const preflightGeneratedMigrationLedger = async ({
  client,
  migrationsFolder,
  allowLegacyReconciliation = false,
  onReconciled,
}: {
  client: ClientBase
  migrationsFolder: string
  allowLegacyReconciliation?: boolean
  onReconciled?: (migrationId: string, durationMs: number) => void
}) => {
  const migrations = await readGeneratedMigrations(migrationsFolder)
  const ledger = await readLedger(client)

  if (!ledger.length) {
    if (await hasGeneratedSchemaWithoutLedger(client)) {
      throw new GeneratedMigrationLedgerIntegrityError(
        'Generated schema objects exist without a Drizzle migration ledger; reset or reconcile them explicitly',
      )
    }
    return
  }

  const currentByHash = new Map(migrations.map((migration) => [migration.hash, migration]))
  const currentByTimestamp = new Map(migrations.map((migration) => [migration.createdAt, migration]))
  const legacyByFingerprint = new Map(
    legacyMigrations.map((migration) => [`${migration.hash}:${migration.createdAt}`, migration]),
  )
  const applied = new Set<string>()
  const legacyApplied = new Map<string, LegacyMigration>()

  for (const row of ledger) {
    const createdAt = Number(row.created_at)
    if (!Number.isSafeInteger(createdAt)) {
      throw new GeneratedMigrationLedgerIntegrityError(`Migration ledger row ${row.id} has an invalid timestamp`)
    }
    const current = currentByHash.get(row.hash)
    if (current?.createdAt === createdAt) {
      if (applied.has(current.id)) {
        throw new GeneratedMigrationLedgerIntegrityError(
          `Migration ledger contains duplicate entries for ${current.id}`,
        )
      }
      applied.add(current.id)
      continue
    }
    const legacy = legacyByFingerprint.get(`${row.hash}:${createdAt}`)
    if (legacy) {
      if (legacyApplied.has(legacy.id)) {
        throw new GeneratedMigrationLedgerIntegrityError(
          `Migration ledger contains duplicate legacy entries for ${legacy.id}`,
        )
      }
      legacyApplied.set(legacy.id, legacy)
      continue
    }

    const migration = current ?? currentByTimestamp.get(createdAt)
    throw new GeneratedMigrationLedgerIntegrityError(
      migration
        ? `Migration ledger hash or timestamp drift detected for ${migration.id}`
        : `Migration ledger row ${row.id} is not recognized by the current journal`,
    )
  }

  const effectiveApplied = new Set([...applied, ...legacyApplied.keys()])
  const highestAppliedIndex = Math.max(
    -1,
    ...migrations.filter((migration) => effectiveApplied.has(migration.id)).map((migration) => migration.index),
  )
  const maxCreatedAt = Math.max(...ledger.map((row) => Number(row.created_at)))
  const reconciliationIds = new Set<string>()

  for (const migration of migrations) {
    if (effectiveApplied.has(migration.id)) continue
    const isHistoricalHole = migration.index <= highestAppliedIndex
    const willBeSkippedByDrizzle = migration.createdAt <= maxCreatedAt
    if (migration.id === '0003_localized_tags_to_jsonb' && (isHistoricalHole || willBeSkippedByDrizzle)) {
      reconciliationIds.add(migration.id)
      continue
    }
    if (isHistoricalHole || willBeSkippedByDrizzle) {
      throw new GeneratedMigrationLedgerIntegrityError(
        `Migration ledger has an unreconciled historical hole at ${migration.id}`,
      )
    }
  }

  for (const [migrationId] of legacyApplied) {
    if (!applied.has(migrationId)) reconciliationIds.add(migrationId)
  }

  const orderedReconciliations = migrations.filter((migration) => reconciliationIds.has(migration.id))
  if (orderedReconciliations.length && !allowLegacyReconciliation) {
    throw new LegacyMigrationReconciliationRequiredError(orderedReconciliations.map((migration) => migration.id))
  }

  for (const migration of orderedReconciliations) {
    const startedAt = performance.now()
    if (migration.id === '0003_localized_tags_to_jsonb') {
      await reconcileLocalizedTags(client, migration)
    } else {
      const legacy = legacyApplied.get(migration.id)
      if (!legacy) {
        throw new GeneratedMigrationLedgerIntegrityError(`No reviewed legacy reconciliation exists for ${migration.id}`)
      }
      await reconcileEquivalentLegacyMigration(client, migration, legacy)
    }
    onReconciled?.(migration.id, Math.max(0, Math.round(performance.now() - startedAt)))
  }
}