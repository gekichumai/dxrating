import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const DATABASE_NAME = 'dxrating_admin_primary_auth_migration_test'
const configuredDatabaseUrl = new URL(process.env.DATABASE_URL!)
if (configuredDatabaseUrl.pathname !== '/dxrating_test') {
  throw new Error('Administrator primary-auth migration tests require the configured dxrating_test database')
}

const adminDatabaseUrl = new URL(configuredDatabaseUrl)
adminDatabaseUrl.pathname = '/postgres'
const migrationDatabaseUrl = new URL(configuredDatabaseUrl)
migrationDatabaseUrl.pathname = `/${DATABASE_NAME}`
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const migrations = readMigrationFiles({ migrationsFolder })
const PRIMARY_AUTH_MIGRATION_TAG = '0012_add_admin_primary_auth'

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

const insertSession = async (client: PoolClient, id: string, userId = 'existing-user') => {
  await client.query(
    `INSERT INTO session (id, expires_at, token, updated_at, user_id)
     VALUES ($1, '2027-01-01T00:00:00Z', $2, '2026-01-01T00:00:00Z', $3)`,
    [id, `${id}-token`, userId],
  )
}

const insertOauthAttempt = async (
  client: PoolClient,
  overrides: Partial<{
    stateDigest: string
    sessionId: string
    userId: string
    accountId: string
    provider: string
    providerAccountId: string
    codeVerifier: string
    nonce: string | null
    createdAt: string
    expiresAt: string
  }> = {},
) => {
  const values = {
    stateDigest: 'a'.repeat(64),
    sessionId: 'existing-session',
    userId: 'existing-user',
    accountId: 'existing-google-account',
    provider: 'google',
    providerAccountId: 'google-subject',
    codeVerifier: 'A'.repeat(43),
    nonce: 'google-nonce',
    createdAt: '2026-01-01T00:00:00Z',
    expiresAt: '2026-01-01T00:10:00Z',
    ...overrides,
  }

  return client.query(
    `INSERT INTO admin_primary_auth_oauth_attempts
       (state_digest, session_id, user_id, account_id, provider, provider_account_id,
        code_verifier, nonce, redirect_uri, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
             'https://admin.example.test/primary-auth/oauth/callback', $9, $10)`,
    [
      values.stateDigest,
      values.sessionId,
      values.userId,
      values.accountId,
      values.provider,
      values.providerAccountId,
      values.codeVerifier,
      values.nonce,
      values.createdAt,
      values.expiresAt,
    ],
  )
}

describe('administrator primary-auth migration', () => {
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

  it('is an expand-only migration that preserves old writes and enforces primary-auth state invariants', async () => {
    expect(path.basename(migrationsFolder)).toBe('drizzle')
    const journal = await import('../../drizzle/meta/_journal.json', { with: { type: 'json' } })
    const migrationIndex = journal.default.entries.findIndex((entry) => entry.tag === PRIMARY_AUTH_MIGRATION_TAG)
    expect(migrationIndex).toBeGreaterThan(0)
    expect(journal.default.entries[migrationIndex]?.tag).toBe(PRIMARY_AUTH_MIGRATION_TAG)

    const primaryAuthMigration = migrations[migrationIndex]
    expect(primaryAuthMigration).toBeDefined()
    for (const statement of primaryAuthMigration!.sql) {
      expect(statement.trim()).toMatch(
        /^(?:CREATE TABLE "admin_primary_auth_|ALTER TABLE "admin_primary_auth_|CREATE (?:UNIQUE )?INDEX "admin_primary_auth_)/,
      )
    }
    const migrationSql = primaryAuthMigration!.sql.join('\n')
    expect(migrationSql).not.toMatch(/(?:^|\n)\s*(?:DROP|TRUNCATE|DELETE FROM|UPDATE\s+\S+\s+SET)\b/im)

    const client = await migrationPool.connect()
    try {
      for (const migration of migrations.slice(0, migrationIndex)) await applyStatements(client, migration.sql)

      const legacyUserInsert = {
        name: 'old-binary-user-insert',
        text: 'INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)',
      }
      const legacySessionInsert = {
        name: 'old-binary-session-insert',
        text: `INSERT INTO session (id, expires_at, token, updated_at, user_id)
               VALUES ($1, $2, $3, $4, $5)`,
      }
      const legacyAccountInsert = {
        name: 'old-binary-account-insert',
        text: `INSERT INTO account (id, account_id, provider_id, user_id, updated_at)
               VALUES ($1, $2, $3, $4, $5)`,
      }

      await client.query({
        ...legacyUserInsert,
        values: ['existing-user', 'Existing User', 'existing@example.com'],
      })
      await client.query({
        ...legacySessionInsert,
        values: [
          'existing-session',
          '2027-01-01T00:00:00Z',
          'existing-session-token',
          '2026-01-01T00:00:00Z',
          'existing-user',
        ],
      })
      await client.query({
        ...legacyAccountInsert,
        values: ['existing-google-account', 'google-subject', 'google', 'existing-user', '2026-01-01T00:00:00Z'],
      })
      await client.query({
        ...legacyAccountInsert,
        values: ['existing-github-account', 'github-subject', 'github', 'existing-user', '2026-01-01T00:00:00Z'],
      })

      await applyStatements(client, primaryAuthMigration!.sql)

      // A rolled-back application binary still knows nothing about the new tables.
      await client.query({
        ...legacyUserInsert,
        values: ['old-binary-user', 'Old Binary User', 'old-binary@example.com'],
      })
      await client.query({
        ...legacySessionInsert,
        values: [
          'old-binary-session',
          '2027-01-01T00:00:00Z',
          'old-binary-session-token',
          '2026-01-01T00:00:00Z',
          'old-binary-user',
        ],
      })
      await client.query({
        ...legacyAccountInsert,
        values: [
          'old-binary-account',
          'old-binary-provider-account',
          'github',
          'old-binary-user',
          '2026-01-01T00:00:00Z',
        ],
      })
      const legacyRows = await client.query<{ id: string }>(
        `SELECT id FROM "user" WHERE id IN ('existing-user', 'old-binary-user') ORDER BY id`,
      )
      expect(legacyRows.rows.map((row) => row.id)).toEqual(['existing-user', 'old-binary-user'])

      const columns = await client.query<{
        table_name: string
        column_name: string
        is_nullable: string
      }>(
        `SELECT table_name, column_name, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name IN (
              'admin_primary_auth_windows',
              'admin_primary_auth_oauth_attempts',
              'admin_primary_auth_password_rate_limits'
            )
          ORDER BY table_name, ordinal_position`,
      )
      expect(columns.rows).toEqual([
        ...[
          'state_digest',
          'session_id',
          'user_id',
          'account_id',
          'provider',
          'provider_account_id',
          'code_verifier',
          'nonce',
          'redirect_uri',
          'created_at',
          'expires_at',
        ].map((column_name) => ({
          table_name: 'admin_primary_auth_oauth_attempts',
          column_name,
          is_nullable: 'NO',
        })),
        ...['user_id', 'window_started_at', 'failure_count', 'blocked_until', 'updated_at'].map((column_name) => ({
          table_name: 'admin_primary_auth_password_rate_limits',
          column_name,
          is_nullable: column_name === 'blocked_until' ? 'YES' : 'NO',
        })),
        ...['session_id', 'user_id', 'method', 'completed_at', 'expires_at'].map((column_name) => ({
          table_name: 'admin_primary_auth_windows',
          column_name,
          is_nullable: 'NO',
        })),
      ])

      const indexes = await client.query<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef
           FROM pg_indexes
          WHERE schemaname = 'public' AND tablename LIKE 'admin_primary_auth_%'`,
      )
      const indexDefinitions = new Map(indexes.rows.map((row) => [row.indexname, row.indexdef]))
      expect(indexDefinitions.get('admin_primary_auth_oauth_attempts_session_idx')).toMatch(/^CREATE UNIQUE INDEX /)
      expect(indexDefinitions.get('admin_primary_auth_oauth_attempts_expiry_idx')).toContain('(expires_at)')
      expect(indexDefinitions.get('admin_primary_auth_windows_user_idx')).toContain('(user_id)')
      expect(indexDefinitions.get('admin_primary_auth_windows_expiry_idx')).toContain('(expires_at)')

      const foreignKeys = await client.query<{
        table_name: string
        column_name: string
        foreign_table_name: string
        foreign_column_name: string
        delete_action: string
      }>(
        `SELECT child.relname AS table_name,
                child_attribute.attname AS column_name,
                parent.relname AS foreign_table_name,
                parent_attribute.attname AS foreign_column_name,
                CASE fk.confdeltype WHEN 'c' THEN 'CASCADE' ELSE fk.confdeltype::text END AS delete_action
           FROM pg_constraint AS fk
           JOIN pg_class AS child ON child.oid = fk.conrelid
           JOIN pg_class AS parent ON parent.oid = fk.confrelid
           JOIN pg_attribute AS child_attribute
             ON child_attribute.attrelid = child.oid AND child_attribute.attnum = fk.conkey[1]
           JOIN pg_attribute AS parent_attribute
             ON parent_attribute.attrelid = parent.oid AND parent_attribute.attnum = fk.confkey[1]
          WHERE fk.contype = 'f' AND child.relname LIKE 'admin_primary_auth_%'
          ORDER BY child.relname, child_attribute.attname`,
      )
      expect(foreignKeys.rows).toEqual([
        {
          table_name: 'admin_primary_auth_oauth_attempts',
          column_name: 'account_id',
          foreign_table_name: 'account',
          foreign_column_name: 'id',
          delete_action: 'CASCADE',
        },
        {
          table_name: 'admin_primary_auth_oauth_attempts',
          column_name: 'session_id',
          foreign_table_name: 'session',
          foreign_column_name: 'id',
          delete_action: 'CASCADE',
        },
        {
          table_name: 'admin_primary_auth_oauth_attempts',
          column_name: 'user_id',
          foreign_table_name: 'user',
          foreign_column_name: 'id',
          delete_action: 'CASCADE',
        },
        {
          table_name: 'admin_primary_auth_password_rate_limits',
          column_name: 'user_id',
          foreign_table_name: 'user',
          foreign_column_name: 'id',
          delete_action: 'CASCADE',
        },
        {
          table_name: 'admin_primary_auth_windows',
          column_name: 'session_id',
          foreign_table_name: 'session',
          foreign_column_name: 'id',
          delete_action: 'CASCADE',
        },
        {
          table_name: 'admin_primary_auth_windows',
          column_name: 'user_id',
          foreign_table_name: 'user',
          foreign_column_name: 'id',
          delete_action: 'CASCADE',
        },
      ])

      await client.query(
        `INSERT INTO admin_primary_auth_windows
           (session_id, user_id, method, completed_at, expires_at)
         VALUES ('existing-session', 'existing-user', 'password',
                 '2026-01-01T00:00:00Z', '2026-01-01T00:10:00Z')`,
      )
      await insertOauthAttempt(client)
      await client.query(
        `INSERT INTO admin_primary_auth_password_rate_limits
           (user_id, window_started_at, failure_count)
         VALUES ('existing-user', '2026-01-01T00:00:00Z', 1)`,
      )

      await expect(
        client.query(
          `INSERT INTO admin_primary_auth_windows
             (session_id, user_id, method, completed_at, expires_at)
           VALUES ('old-binary-session', 'old-binary-user', 'password',
                   '2026-01-01T00:00:00Z', '2026-01-01T00:09:59Z')`,
        ),
      ).rejects.toMatchObject({ code: '23514' })
      await expect(
        client.query(
          `INSERT INTO admin_primary_auth_windows
             (session_id, user_id, method, completed_at, expires_at)
           VALUES ('old-binary-session', 'old-binary-user', 'password',
                   '2026-01-01T00:00:00Z', '2026-01-01T00:10:01Z')`,
        ),
      ).rejects.toMatchObject({ code: '23514' })
      await expect(
        client.query(
          `INSERT INTO admin_primary_auth_windows
             (session_id, user_id, method, completed_at, expires_at)
           VALUES ('old-binary-session', 'old-binary-user', 'passkey',
                   '2026-01-01T00:00:00Z', '2026-01-01T00:10:00Z')`,
        ),
      ).rejects.toMatchObject({ code: '23514' })
      await expect(
        client.query(
          `INSERT INTO admin_primary_auth_windows
             (session_id, user_id, method, completed_at, expires_at)
           VALUES ('old-binary-session', 'old-binary-user', 'github',
                   '2026-01-01T00:00:00Z', '2026-01-01T00:10:00Z')`,
        ),
      ).rejects.toMatchObject({ code: '23514' })

      await insertSession(client, 'attempt-invalid-session')
      await expect(
        insertOauthAttempt(client, {
          stateDigest: 'b'.repeat(64),
          sessionId: 'attempt-invalid-session',
          expiresAt: '2026-01-01T00:09:59Z',
        }),
      ).rejects.toMatchObject({ code: '23514' })
      await expect(
        insertOauthAttempt(client, {
          stateDigest: 'c'.repeat(64),
          sessionId: 'attempt-invalid-session',
          expiresAt: '2026-01-01T00:10:01Z',
        }),
      ).rejects.toMatchObject({ code: '23514' })
      await expect(
        insertOauthAttempt(client, {
          stateDigest: 'not-a-sha256-digest',
          sessionId: 'attempt-invalid-session',
        }),
      ).rejects.toMatchObject({ code: '23514' })
      await expect(
        insertOauthAttempt(client, {
          stateDigest: 'd'.repeat(64),
          sessionId: 'attempt-invalid-session',
          provider: 'google',
          nonce: null,
        }),
      ).rejects.toMatchObject({ code: '23502' })
      await expect(
        insertOauthAttempt(client, {
          stateDigest: 'e'.repeat(64),
          sessionId: 'attempt-invalid-session',
          accountId: 'existing-github-account',
          provider: 'github',
          providerAccountId: 'github-subject',
          nonce: 'unexpected-nonce',
        }),
      ).rejects.toMatchObject({ code: '23514' })
      await expect(
        insertOauthAttempt(client, {
          stateDigest: 'f'.repeat(64),
          sessionId: 'attempt-invalid-session',
          codeVerifier: 'short',
        }),
      ).rejects.toMatchObject({ code: '23514' })
      await expect(
        insertOauthAttempt(client, {
          stateDigest: '0'.repeat(64),
          sessionId: 'attempt-invalid-session',
          codeVerifier: `${'A'.repeat(42)}!`,
        }),
      ).rejects.toMatchObject({ code: '23514' })
      await expect(
        insertOauthAttempt(client, {
          stateDigest: '1'.repeat(64),
          sessionId: 'attempt-invalid-session',
          provider: 'microsoft',
        }),
      ).rejects.toMatchObject({ code: '23514' })
      await expect(
        insertOauthAttempt(client, {
          stateDigest: '2'.repeat(64),
          sessionId: 'attempt-invalid-session',
          accountId: 'missing-account',
        }),
      ).rejects.toMatchObject({ code: '23503' })

      await expect(
        insertOauthAttempt(client, {
          stateDigest: '3'.repeat(64),
          sessionId: 'existing-session',
        }),
      ).rejects.toMatchObject({ code: '23505' })

      await expect(
        client.query(
          `INSERT INTO admin_primary_auth_password_rate_limits
             (user_id, window_started_at, failure_count)
           VALUES ('old-binary-user', '2026-01-01T00:00:00Z', 0)`,
        ),
      ).rejects.toMatchObject({ code: '23514' })
      await expect(
        client.query(
          `INSERT INTO admin_primary_auth_password_rate_limits
             (user_id, window_started_at, failure_count)
           VALUES ('old-binary-user', '2026-01-01T00:00:00Z', 6)`,
        ),
      ).rejects.toMatchObject({ code: '23514' })

      await client.query(`DELETE FROM session WHERE id = 'existing-session'`)
      const afterSessionDelete = await client.query<{ windows: number; attempts: number; rate_limits: number }>(
        `SELECT
           (SELECT count(*)::int FROM admin_primary_auth_windows) AS windows,
           (SELECT count(*)::int FROM admin_primary_auth_oauth_attempts) AS attempts,
           (SELECT count(*)::int FROM admin_primary_auth_password_rate_limits) AS rate_limits`,
      )
      expect(afterSessionDelete.rows).toEqual([{ windows: 0, attempts: 0, rate_limits: 1 }])

      await insertSession(client, 'account-cascade-session')
      await insertOauthAttempt(client, {
        stateDigest: '4'.repeat(64),
        sessionId: 'account-cascade-session',
        accountId: 'existing-google-account',
        provider: 'google',
        providerAccountId: 'google-subject',
        nonce: 'account-cascade-nonce',
      })
      await client.query(`DELETE FROM account WHERE id = 'existing-google-account'`)
      const afterAccountDelete = await client.query<{ attempts: number; sessions: number }>(
        `SELECT
           (SELECT count(*)::int FROM admin_primary_auth_oauth_attempts) AS attempts,
           (SELECT count(*)::int FROM session WHERE id = 'account-cascade-session') AS sessions`,
      )
      expect(afterAccountDelete.rows).toEqual([{ attempts: 0, sessions: 1 }])

      await client.query(
        `INSERT INTO admin_primary_auth_windows
           (session_id, user_id, method, completed_at, expires_at)
         VALUES ('account-cascade-session', 'existing-user', 'password',
                 '2026-01-01T00:00:00Z', '2026-01-01T00:10:00Z')`,
      )
      await client.query(`DELETE FROM "user" WHERE id = 'existing-user'`)
      const afterUserDelete = await client.query<{ windows: number; attempts: number; rate_limits: number }>(
        `SELECT
           (SELECT count(*)::int FROM admin_primary_auth_windows) AS windows,
           (SELECT count(*)::int FROM admin_primary_auth_oauth_attempts) AS attempts,
           (SELECT count(*)::int FROM admin_primary_auth_password_rate_limits) AS rate_limits`,
      )
      expect(afterUserDelete.rows).toEqual([{ windows: 0, attempts: 0, rate_limits: 0 }])
    } finally {
      client.release()
    }
  })
})