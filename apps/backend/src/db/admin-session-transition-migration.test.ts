import { fileURLToPath } from 'node:url'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const DATABASE_NAME = 'dxrating_admin_session_transition_migration_test'
const configuredDatabaseUrl = new URL(process.env.DATABASE_URL!)
if (configuredDatabaseUrl.pathname !== '/dxrating_test') {
  throw new Error('Administrator session-transition migration tests require the configured dxrating_test database')
}

const adminDatabaseUrl = new URL(configuredDatabaseUrl)
adminDatabaseUrl.pathname = '/postgres'
const migrationDatabaseUrl = new URL(configuredDatabaseUrl)
migrationDatabaseUrl.pathname = `/${DATABASE_NAME}`
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const migrations = readMigrationFiles({ migrationsFolder })
const MIGRATION_TAG = '0013_add_admin_session_transitions'

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

describe('administrator session-transition migration', () => {
  const adminPool = new Pool({ connectionString: adminDatabaseUrl.toString() })
  const migrationPool = new Pool({ connectionString: migrationDatabaseUrl.toString() })

  beforeAll(async () => {
    await adminPool.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`)
    await adminPool.query(`CREATE DATABASE ${DATABASE_NAME}`)
  })

  afterAll(async () => {
    await migrationPool.end()
    await adminPool.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`)
    await adminPool.end()
  })

  it('backfills old rows stale while allowing mixed-version inserts to receive DB-owned markers', async () => {
    const journal = await import('../../drizzle/meta/_journal.json', { with: { type: 'json' } })
    const migrationIndex = journal.default.entries.findIndex((entry) => entry.tag === MIGRATION_TAG)
    expect(migrationIndex).toBeGreaterThan(0)

    const migration = migrations[migrationIndex]
    const migrationSql = migration?.sql.join('\n') ?? ''
    expect(migrationSql).toContain(
      'ALTER TABLE "session" ADD COLUMN "admin_authorization_issued_at" timestamp with time zone DEFAULT now() NOT NULL',
    )
    expect(migrationSql).toContain(
      'ALTER TABLE "user" ADD COLUMN "admin_authorization_not_before" timestamp with time zone DEFAULT now() NOT NULL',
    )
    // Live authentication and administrator transactions lock user before
    // session. The migration must take its stronger table locks in that same
    // order or it can deadlock with the old fleet during an online rollout.
    expect(migrationSql.indexOf('ALTER TABLE "user"')).toBeLessThan(migrationSql.indexOf('ALTER TABLE "session"'))

    const client = await migrationPool.connect()
    try {
      for (const previous of migrations.slice(0, migrationIndex)) await applyStatements(client, previous.sql)

      await client.query(
        `INSERT INTO "user" (id, name, email, role) VALUES ('existing-admin', 'Existing', 'existing@test', 'admin')`,
      )
      await client.query(
        `
          INSERT INTO session (id, expires_at, token, updated_at, user_id)
          VALUES ('existing-session', clock_timestamp() + interval '1 hour', 'existing-token', clock_timestamp(), 'existing-admin')
        `,
      )

      const relationFilesBefore = await client.query<{ readonly table_name: string; readonly relation_file: string }>(
        `
          SELECT table_name, pg_relation_filenode(format('public.%I', table_name)::regclass)::text AS relation_file
          FROM (VALUES ('session'), ('user')) AS affected(table_name)
          ORDER BY table_name
        `,
      )

      await applyStatements(client, migration!.sql)

      const relationFilesAfter = await client.query<{ readonly table_name: string; readonly relation_file: string }>(
        `
          SELECT table_name, pg_relation_filenode(format('public.%I', table_name)::regclass)::text AS relation_file
          FROM (VALUES ('session'), ('user')) AS affected(table_name)
          ORDER BY table_name
        `,
      )
      expect(relationFilesAfter.rows).toEqual(relationFilesBefore.rows)

      const backfilled = await client.query<{
        readonly stale: boolean
        readonly issued_at: Date
        readonly not_before: Date
      }>(
        `
          SELECT
            s.admin_authorization_issued_at <= u.admin_authorization_not_before AS stale,
            s.admin_authorization_issued_at AS issued_at,
            u.admin_authorization_not_before AS not_before
          FROM session s
          INNER JOIN "user" u ON u.id = s.user_id
          WHERE s.id = 'existing-session'
        `,
      )
      expect(backfilled.rows).toEqual([
        {
          stale: true,
          issued_at: expect.any(Date),
          not_before: expect.any(Date),
        },
      ])

      // Statements from a mixed-version binary omit both new fields. Database
      // defaults still stamp the user floor and later session issuance.
      await client.query(
        `INSERT INTO "user" (id, name, email, role) VALUES ('mixed-admin', 'Mixed', 'mixed@test', 'admin')`,
      )
      await client.query(
        `
          INSERT INTO session (id, expires_at, token, updated_at, user_id)
          VALUES ('mixed-session', clock_timestamp() + interval '1 hour', 'mixed-token', clock_timestamp(), 'mixed-admin')
        `,
      )
      const mixed = await client.query<{ readonly eligible: boolean }>(
        `
          SELECT s.admin_authorization_issued_at > u.admin_authorization_not_before AS eligible
          FROM session s
          INNER JOIN "user" u ON u.id = s.user_id
          WHERE s.id = 'mixed-session'
        `,
      )
      expect(mixed.rows).toEqual([{ eligible: true }])

      const beforeRefresh = await client.query<{ readonly issued_at: Date }>(
        `SELECT admin_authorization_issued_at AS issued_at FROM session WHERE id = 'mixed-session'`,
      )
      await client.query(
        `
          UPDATE session
          SET expires_at = expires_at + interval '1 hour', updated_at = clock_timestamp()
          WHERE id = 'mixed-session'
        `,
      )
      const afterRefresh = await client.query<{ readonly issued_at: Date }>(
        `SELECT admin_authorization_issued_at AS issued_at FROM session WHERE id = 'mixed-session'`,
      )
      expect(afterRefresh.rows).toEqual(beforeRefresh.rows)
    } finally {
      client.release()
    }
  })
})