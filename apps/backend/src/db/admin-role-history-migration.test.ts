import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const DATABASE_NAME = 'dxrating_admin_role_history_migration_test'
const RUNTIME_ROLE = 'dxrating_admin_role_history_runtime_test'
const configuredDatabaseUrl = new URL(process.env.DATABASE_URL!)
if (configuredDatabaseUrl.pathname !== '/dxrating_test') {
  throw new Error('Administrator role-history migration tests require the configured dxrating_test database')
}

const adminDatabaseUrl = new URL(configuredDatabaseUrl)
adminDatabaseUrl.pathname = '/postgres'
const migrationDatabaseUrl = new URL(configuredDatabaseUrl)
migrationDatabaseUrl.pathname = `/${DATABASE_NAME}`
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const migrations = readMigrationFiles({ migrationsFolder })
const EXPANSION_MIGRATION_TAG = '0014_add_admin_role_history'
const PROTECTION_MIGRATION_TAG = '0015_protect_admin_role_history'

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
  await client.query(
    `INSERT INTO "user" (id, name, email, role)
     VALUES ($1, $2, $3, $4)`,
    [id, id, `${id}@example.test`, role],
  )
}

const insertHistory = async (
  client: PoolClient,
  overrides: Partial<{
    subjectUserId: string
    actorUserId: string
    previousRole: string
    newRole: string
    reason: string
    createdAt: string
  }> = {},
) => {
  const values = {
    subjectUserId: 'subject-user',
    actorUserId: 'actor-user',
    previousRole: 'user',
    newRole: 'admin',
    reason: 'Approved for administrator maintenance duties',
    createdAt: '2000-01-01T00:00:00Z',
    ...overrides,
  }

  return client.query<{
    readonly id: string
    readonly created_at: Date
  }>(
    `INSERT INTO admin_role_change_history
       (subject_user_id, actor_user_id, previous_role, new_role, reason, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id::text, created_at`,
    [values.subjectUserId, values.actorUserId, values.previousRole, values.newRole, values.reason, values.createdAt],
  )
}

describe('administrator role-history migrations', () => {
  const adminPool = new Pool({ connectionString: adminDatabaseUrl.toString() })
  const migrationPool = new Pool({ connectionString: migrationDatabaseUrl.toString() })

  beforeAll(async () => {
    await adminPool.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`)
    await adminPool.query(`DROP ROLE IF EXISTS ${RUNTIME_ROLE}`)
    await adminPool.query(`CREATE ROLE ${RUNTIME_ROLE} NOLOGIN`)
    await adminPool.query(`CREATE DATABASE ${DATABASE_NAME}`)
  })

  afterAll(async () => {
    await migrationPool.end()
    await adminPool.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`)
    await adminPool.query(`DROP ROLE IF EXISTS ${RUNTIME_ROLE}`)
    await adminPool.end()
  })

  it('expands safely, then enforces bounded immutable role-change history at the database boundary', async () => {
    expect(path.basename(migrationsFolder)).toBe('drizzle')
    const journal = await import('../../drizzle/meta/_journal.json', { with: { type: 'json' } })
    const expansionIndex = journal.default.entries.findIndex((entry) => entry.tag === EXPANSION_MIGRATION_TAG)
    const protectionIndex = journal.default.entries.findIndex((entry) => entry.tag === PROTECTION_MIGRATION_TAG)
    expect(expansionIndex).toBeGreaterThan(0)
    expect(protectionIndex).toBe(expansionIndex + 1)
    expect(journal.default.entries[expansionIndex]?.idx).toBe(expansionIndex)
    expect(journal.default.entries[protectionIndex]?.idx).toBe(protectionIndex)

    const expansion = migrations[expansionIndex]
    const protection = migrations[protectionIndex]
    expect(expansion).toBeDefined()
    expect(protection).toBeDefined()

    for (const statement of expansion!.sql) {
      expect(statement.trim()).toMatch(
        /^(?:CREATE TABLE "admin_role_change_history"|ALTER TABLE "admin_role_change_history"|CREATE INDEX "admin_role_change_history_)/,
      )
    }
    const expansionSql = expansion!.sql.join('\n')
    expect(expansionSql).not.toMatch(/(?:^|\n)\s*(?:DROP|TRUNCATE|DELETE FROM|UPDATE\s+\S+\s+SET)\b/im)
    expect(expansionSql).toContain('"previous_role" "user_role" NOT NULL')
    expect(expansionSql).toContain('"new_role" "user_role" NOT NULL')
    expect(expansionSql).toContain('"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL')
    expect(expansionSql).toContain('ON DELETE restrict')

    const protectionSql = protection!.sql.join('\n')
    expect(protectionSql).toContain('BEFORE INSERT OR UPDATE OR DELETE')
    expect(protectionSql).toContain('NEW.created_at := clock_timestamp()::timestamptz(3)')
    expect(protectionSql).toContain("ERRCODE = '55000'")
    expect(protectionSql).toContain('REVOKE ALL PRIVILEGES ON TABLE "public"."admin_role_change_history" FROM PUBLIC')
    expect(protectionSql).toContain(
      'REVOKE ALL PRIVILEGES ON SEQUENCE "public"."admin_role_change_history_id_seq" FROM PUBLIC',
    )

    const client = await migrationPool.connect()
    try {
      for (const previous of migrations.slice(0, expansionIndex)) await applyStatements(client, previous.sql)

      await insertUser(client, 'subject-user')
      await insertUser(client, 'actor-user', 'admin')

      await applyStatements(client, expansion!.sql)

      // The generated expansion is independently safe if deployment is
      // interrupted before the adjacent protection migration. Old binaries
      // continue to omit and ignore the new table.
      await insertUser(client, 'mixed-version-user')
      await client.query(`UPDATE "user" SET name = 'Mixed Version Updated' WHERE id = 'mixed-version-user'`)
      const mixedVersionUser = await client.query<{ readonly name: string; readonly role: string }>(
        `SELECT name, role::text FROM "user" WHERE id = 'mixed-version-user'`,
      )
      expect(mixedVersionUser.rows).toEqual([{ name: 'Mixed Version Updated', role: 'user' }])

      await applyStatements(client, protection!.sql)

      const columns = await client.query<{
        readonly column_name: string
        readonly data_type: string
        readonly udt_name: string
        readonly is_nullable: string
        readonly column_default: string | null
      }>(
        `SELECT column_name, data_type, udt_name, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'admin_role_change_history'
          ORDER BY ordinal_position`,
      )
      expect(columns.rows).toEqual([
        {
          column_name: 'id',
          data_type: 'bigint',
          udt_name: 'int8',
          is_nullable: 'NO',
          column_default: "nextval('admin_role_change_history_id_seq'::regclass)",
        },
        {
          column_name: 'subject_user_id',
          data_type: 'text',
          udt_name: 'text',
          is_nullable: 'NO',
          column_default: null,
        },
        {
          column_name: 'actor_user_id',
          data_type: 'text',
          udt_name: 'text',
          is_nullable: 'NO',
          column_default: null,
        },
        {
          column_name: 'previous_role',
          data_type: 'USER-DEFINED',
          udt_name: 'user_role',
          is_nullable: 'NO',
          column_default: null,
        },
        {
          column_name: 'new_role',
          data_type: 'USER-DEFINED',
          udt_name: 'user_role',
          is_nullable: 'NO',
          column_default: null,
        },
        {
          column_name: 'reason',
          data_type: 'text',
          udt_name: 'text',
          is_nullable: 'NO',
          column_default: null,
        },
        {
          column_name: 'created_at',
          data_type: 'timestamp with time zone',
          udt_name: 'timestamptz',
          is_nullable: 'NO',
          column_default: 'now()',
        },
      ])

      const timestampPrecision = await client.query<{ readonly datetime_precision: number }>(
        `SELECT datetime_precision
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'admin_role_change_history'
            AND column_name = 'created_at'`,
      )
      expect(timestampPrecision.rows).toEqual([{ datetime_precision: 3 }])

      const foreignKeys = await client.query<{
        readonly column_name: string
        readonly foreign_table_name: string
        readonly foreign_column_name: string
        readonly delete_action: string
      }>(
        `SELECT child_attribute.attname AS column_name,
                parent.relname AS foreign_table_name,
                parent_attribute.attname AS foreign_column_name,
                CASE fk.confdeltype WHEN 'r' THEN 'RESTRICT' ELSE fk.confdeltype::text END AS delete_action
           FROM pg_constraint AS fk
           JOIN pg_class AS child ON child.oid = fk.conrelid
           JOIN pg_class AS parent ON parent.oid = fk.confrelid
           JOIN pg_attribute AS child_attribute
             ON child_attribute.attrelid = child.oid AND child_attribute.attnum = fk.conkey[1]
           JOIN pg_attribute AS parent_attribute
             ON parent_attribute.attrelid = parent.oid AND parent_attribute.attnum = fk.confkey[1]
          WHERE fk.contype = 'f' AND child.relname = 'admin_role_change_history'
          ORDER BY child_attribute.attname`,
      )
      expect(foreignKeys.rows).toEqual([
        {
          column_name: 'actor_user_id',
          foreign_table_name: 'user',
          foreign_column_name: 'id',
          delete_action: 'RESTRICT',
        },
        {
          column_name: 'subject_user_id',
          foreign_table_name: 'user',
          foreign_column_name: 'id',
          delete_action: 'RESTRICT',
        },
      ])

      const index = await client.query<{ readonly indexdef: string }>(
        `SELECT indexdef
           FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'admin_role_change_history'
            AND indexname = 'admin_role_change_history_subject_created_idx'`,
      )
      expect(index.rows).toHaveLength(1)
      expect(index.rows[0]?.indexdef).toContain('(subject_user_id, created_at DESC NULLS LAST, id DESC NULLS LAST)')

      const publicPrivileges = await client.query<{ readonly public_privileges: string[] | null }>(
        `SELECT array_agg(privilege_type ORDER BY privilege_type) AS public_privileges
           FROM information_schema.role_table_grants
          WHERE table_schema = 'public'
            AND table_name = 'admin_role_change_history'
            AND grantee = 'PUBLIC'`,
      )
      expect(publicPrivileges.rows).toEqual([{ public_privileges: null }])

      const beforeInsert = await client.query<{ readonly recorded_at: Date }>(`SELECT clock_timestamp() AS recorded_at`)
      const inserted = await insertHistory(client)
      const afterInsert = await client.query<{ readonly recorded_at: Date }>(`SELECT clock_timestamp() AS recorded_at`)
      expect(inserted.rows).toHaveLength(1)
      expect(inserted.rows[0]?.id).toBe('1')
      // PostgreSQL rounds assignments to timestamptz(3), so the stored value
      // may fall just below the full-precision clock sampled beforehand.
      expect(inserted.rows[0]!.created_at.getTime()).toBeGreaterThanOrEqual(
        beforeInsert.rows[0]!.recorded_at.getTime() - 1,
      )
      expect(inserted.rows[0]!.created_at.getTime()).toBeLessThanOrEqual(afterInsert.rows[0]!.recorded_at.getTime() + 1)
      expect(inserted.rows[0]!.created_at.toISOString()).not.toBe('2000-01-01T00:00:00.000Z')
      const storedPrecision = await client.query<{ readonly millisecond_exact: boolean }>(
        `SELECT mod(extract(microseconds FROM created_at)::bigint, 1000) = 0 AS millisecond_exact
           FROM admin_role_change_history
          WHERE id = $1`,
        [inserted.rows[0]!.id],
      )
      expect(storedPrecision.rows).toEqual([{ millisecond_exact: true }])

      for (const reason of ['', '   ', '\tleading', 'trailing\n', ' leading', 'trailing ', 'x'.repeat(1001)]) {
        await expect(insertHistory(client, { reason })).rejects.toMatchObject({ code: '23514' })
      }
      await expect(
        insertHistory(client, { previousRole: 'user', newRole: 'user', reason: 'No-op transition' }),
      ).rejects.toMatchObject({ code: '23514' })
      await expect(
        insertHistory(client, { previousRole: 'admin', newRole: 'admin', reason: 'No-op transition' }),
      ).rejects.toMatchObject({ code: '23514' })
      await expect(
        insertHistory(client, { previousRole: 'super_admin', newRole: 'admin', reason: 'Invalid source' }),
      ).rejects.toMatchObject({ code: '22P02' })

      await expect(
        client.query(`UPDATE admin_role_change_history SET reason = 'Rewritten' WHERE id = 1`),
      ).rejects.toMatchObject({ code: '55000' })
      await expect(client.query(`DELETE FROM admin_role_change_history WHERE id = 1`)).rejects.toMatchObject({
        code: '55000',
      })

      await client.query(`INSERT INTO profiles (id, display_name) VALUES ('subject-user', 'Subject User')`)
      await client.query(
        `INSERT INTO account (id, account_id, provider_id, user_id, updated_at)
         VALUES ('subject-account', 'subject-provider-id', 'credential', 'subject-user', clock_timestamp())`,
      )
      await client.query(`DELETE FROM profiles WHERE id = 'subject-user'`)
      await client.query(`DELETE FROM account WHERE id = 'subject-account'`)
      const retainedAfterProfileChanges = await client.query<{ readonly count: string }>(
        `SELECT count(*)::text AS count FROM admin_role_change_history`,
      )
      expect(retainedAfterProfileChanges.rows).toEqual([{ count: '1' }])
      await expect(client.query(`DELETE FROM "user" WHERE id = 'subject-user'`)).rejects.toMatchObject({
        // PostgreSQL 18 reports explicit RESTRICT as restrict_violation;
        // older supported releases report the equivalent foreign_key_violation.
        code: expect.stringMatching(/^(23001|23503)$/),
      })

      await client.query(`GRANT SELECT, INSERT ON admin_role_change_history TO ${RUNTIME_ROLE}`)
      await client.query(`GRANT USAGE, SELECT ON SEQUENCE admin_role_change_history_id_seq TO ${RUNTIME_ROLE}`)
      await client.query(`SET ROLE ${RUNTIME_ROLE}`)
      let runtimeEventId: string | undefined
      try {
        const runtimeInsert = await client.query<{ readonly id: string }>(
          `INSERT INTO admin_role_change_history
             (subject_user_id, actor_user_id, previous_role, new_role, reason)
           VALUES ('subject-user', 'actor-user', 'admin', 'user', 'Runtime demotion')
           RETURNING id::text`,
        )
        runtimeEventId = runtimeInsert.rows[0]?.id
        expect(BigInt(runtimeEventId!)).toBeGreaterThan(1n)
        const runtimeRead = await client.query<{ readonly count: string }>(
          `SELECT count(*)::text AS count FROM admin_role_change_history`,
        )
        expect(runtimeRead.rows).toEqual([{ count: '2' }])
        await expect(
          client.query(`UPDATE admin_role_change_history SET reason = 'Runtime rewrite' WHERE id = 2`),
        ).rejects.toMatchObject({ code: '42501' })
        await expect(client.query(`DELETE FROM admin_role_change_history WHERE id = 2`)).rejects.toMatchObject({
          code: '42501',
        })
      } finally {
        await client.query('RESET ROLE')
      }

      const finalRows = await client.query<{
        readonly id: string
        readonly previous_role: string
        readonly new_role: string
        readonly reason: string
      }>(
        `SELECT id::text, previous_role::text, new_role::text, reason
           FROM admin_role_change_history
          ORDER BY id`,
      )
      expect(finalRows.rows).toEqual([
        {
          id: '1',
          previous_role: 'user',
          new_role: 'admin',
          reason: 'Approved for administrator maintenance duties',
        },
        {
          id: runtimeEventId,
          previous_role: 'admin',
          new_role: 'user',
          reason: 'Runtime demotion',
        },
      ])
    } finally {
      client.release()
    }
  })
})