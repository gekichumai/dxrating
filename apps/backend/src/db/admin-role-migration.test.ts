import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PERSISTED_USER_ROLES } from '../admin/role-policy.js'

const DATABASE_NAME = 'dxrating_admin_role_migration_test'
const configuredDatabaseUrl = new URL(process.env.DATABASE_URL!)
if (configuredDatabaseUrl.pathname !== '/dxrating_test') {
  throw new Error('Administrator role migration tests require the configured dxrating_test database')
}

const adminDatabaseUrl = new URL(configuredDatabaseUrl)
adminDatabaseUrl.pathname = '/postgres'
const migrationDatabaseUrl = new URL(configuredDatabaseUrl)
migrationDatabaseUrl.pathname = `/${DATABASE_NAME}`
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const migrations = readMigrationFiles({ migrationsFolder })
const ROLE_MIGRATION_TAG = '0011_add_admin_roles'

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

describe('administrator role migration', () => {
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

  it('backfills existing rows, preserves old statements, and constrains all persisted role values', async () => {
    expect(path.basename(migrationsFolder)).toBe('drizzle')
    const journal = await import('../../drizzle/meta/_journal.json', { with: { type: 'json' } })
    const roleMigrationIndex = journal.default.entries.findIndex((entry) => entry.tag === ROLE_MIGRATION_TAG)
    expect(roleMigrationIndex).toBeGreaterThan(0)
    expect(journal.default.entries[roleMigrationIndex]?.tag).toBe(ROLE_MIGRATION_TAG)
    const roleMigration = migrations[roleMigrationIndex]
    expect(roleMigration?.sql.join('\n')).toContain('CREATE TYPE "public"."user_role"')
    expect(roleMigration?.sql.join('\n')).toContain('ADD COLUMN "role" "user_role" DEFAULT \'user\' NOT NULL')

    const client = await migrationPool.connect()
    try {
      for (const migration of migrations.slice(0, roleMigrationIndex)) await applyStatements(client, migration.sql)

      const legacyInsert = {
        name: 'legacy-user-insert-without-role',
        text: 'INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)',
      }
      await client.query({
        ...legacyInsert,
        values: ['existing-user', 'Existing User', 'existing@example.com'],
      })

      await applyStatements(client, roleMigration!.sql)

      // A mixed-version application binary still omits the new column.
      await client.query({
        ...legacyInsert,
        values: ['new-user-from-old-binary', 'New User', 'new@example.com'],
      })

      const users = await client.query<{ id: string; role: string; email_verified: boolean }>(
        `SELECT id, role::text, email_verified
           FROM "user"
          WHERE id IN ('existing-user', 'new-user-from-old-binary')
          ORDER BY id`,
      )
      expect(users.rows).toEqual([
        { id: 'existing-user', role: 'user', email_verified: false },
        { id: 'new-user-from-old-binary', role: 'user', email_verified: false },
      ])

      const roleColumn = await client.query<{
        is_nullable: string
        column_default: string | null
        udt_name: string
      }>(
        `SELECT is_nullable, column_default, udt_name
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'user' AND column_name = 'role'`,
      )
      expect(roleColumn.rows).toEqual([
        {
          is_nullable: 'NO',
          column_default: "'user'::user_role",
          udt_name: 'user_role',
        },
      ])

      const enumValues = await client.query<{ enumlabel: string }>(
        `SELECT enumlabel
           FROM pg_enum
           JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
          WHERE pg_type.typname = 'user_role'
          ORDER BY enumsortorder`,
      )
      expect(enumValues.rows.map((row) => row.enumlabel)).toEqual(PERSISTED_USER_ROLES)

      await client.query(`UPDATE "user" SET role = 'admin' WHERE id = 'existing-user'`)
      await expect(
        client.query(`UPDATE "user" SET role = 'super_admin' WHERE id = 'existing-user'`),
      ).rejects.toMatchObject({ code: '22P02' })
      await expect(client.query(`UPDATE "user" SET role = 'unknown' WHERE id = 'existing-user'`)).rejects.toMatchObject(
        { code: '22P02' },
      )
      await expect(client.query(`UPDATE "user" SET role = '' WHERE id = 'existing-user'`)).rejects.toMatchObject({
        code: '22P02',
      })
      await expect(client.query(`UPDATE "user" SET role = 'Admin' WHERE id = 'existing-user'`)).rejects.toMatchObject({
        code: '22P02',
      })
      await expect(client.query(`UPDATE "user" SET role = NULL WHERE id = 'existing-user'`)).rejects.toMatchObject({
        code: '23502',
      })

      const promoted = await client.query<{ role: string; email_verified: boolean }>(
        `SELECT role::text, email_verified FROM "user" WHERE id = 'existing-user'`,
      )
      expect(promoted.rows).toEqual([{ role: 'admin', email_verified: false }])
    } finally {
      client.release()
    }
  })
})