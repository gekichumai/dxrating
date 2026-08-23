import { describe, expect, it } from 'vitest'
import { loadBackendMigrationConfig } from './migration-config.js'

const paths = {
  migrationsFolder: '/workspace/apps/backend/drizzle',
  nonTransactionalMigrationsFolder: '/workspace/apps/backend/non-transactional-migrations',
}

describe('backend migration configuration', () => {
  it('requires only migration-specific environment and resolves package paths', () => {
    const config = loadBackendMigrationConfig(paths, {
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/dxrating_test',
    })

    expect(config).toEqual({
      databaseUrl: 'postgres://postgres:postgres@localhost:5432/dxrating_test',
      migrationsFolder: paths.migrationsFolder,
      nonTransactionalMigrationsFolder: paths.nonTransactionalMigrationsFolder,
      lockTimeoutMs: 60_000,
      lockRetryMs: 250,
      connectionTimeoutMs: 10_000,
      sqlLockTimeoutMs: 5_000,
      statementTimeoutMs: 900_000,
    })
  })

  it('parses bounded overrides without requiring application secrets', () => {
    const config = loadBackendMigrationConfig(paths, {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/dxrating_test',
      MIGRATION_LOCK_TIMEOUT_MS: '2500',
      MIGRATION_LOCK_RETRY_MS: '25',
      MIGRATION_CONNECTION_TIMEOUT_MS: '500',
      MIGRATION_SQL_LOCK_TIMEOUT_MS: '750',
      MIGRATION_STATEMENT_TIMEOUT_MS: '5000',
    })

    expect(config).toMatchObject({
      lockTimeoutMs: 2500,
      lockRetryMs: 25,
      connectionTimeoutMs: 500,
      sqlLockTimeoutMs: 750,
      statementTimeoutMs: 5000,
    })
  })

  it.each([
    { DATABASE_URL: 'https://example.com/database' },
    {
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/dxrating_test',
      MIGRATION_LOCK_TIMEOUT_MS: '100',
      MIGRATION_LOCK_RETRY_MS: '101',
    },
  ])('rejects unsafe or internally inconsistent migration environment', (environment) => {
    expect(() => loadBackendMigrationConfig(paths, environment)).toThrow()
  })
})