import { z } from 'zod'

const integerFromEnvironment = (defaultValue: number, minimum: number, maximum: number) =>
  z.preprocess(
    (value) => (value === undefined || value === '' ? defaultValue : value),
    z.coerce.number().int().min(minimum).max(maximum),
  )

const databaseUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => {
      const protocol = new URL(value).protocol
      return protocol === 'postgres:' || protocol === 'postgresql:'
    },
    { message: 'DATABASE_URL must use the postgres or postgresql protocol' },
  )

const migrationEnvironmentSchema = z
  .object({
    DATABASE_URL: databaseUrlSchema,
    MIGRATION_LOCK_TIMEOUT_MS: integerFromEnvironment(60_000, 100, 600_000),
    MIGRATION_LOCK_RETRY_MS: integerFromEnvironment(250, 10, 10_000),
    MIGRATION_CONNECTION_TIMEOUT_MS: integerFromEnvironment(10_000, 100, 120_000),
    MIGRATION_SQL_LOCK_TIMEOUT_MS: integerFromEnvironment(5_000, 100, 60_000),
    MIGRATION_STATEMENT_TIMEOUT_MS: integerFromEnvironment(900_000, 1_000, 3_600_000),
  })
  .refine((value) => value.MIGRATION_LOCK_RETRY_MS <= value.MIGRATION_LOCK_TIMEOUT_MS, {
    message: 'MIGRATION_LOCK_RETRY_MS must not exceed MIGRATION_LOCK_TIMEOUT_MS',
    path: ['MIGRATION_LOCK_RETRY_MS'],
  })

export type BackendMigrationConfig = {
  databaseUrl: string
  migrationsFolder: string
  nonTransactionalMigrationsFolder: string
  lockTimeoutMs: number
  lockRetryMs: number
  connectionTimeoutMs: number
  sqlLockTimeoutMs: number
  statementTimeoutMs: number
}

export type BackendMigrationPaths = Pick<
  BackendMigrationConfig,
  'migrationsFolder' | 'nonTransactionalMigrationsFolder'
>

export const loadBackendMigrationConfig = (
  paths: BackendMigrationPaths,
  environment: NodeJS.ProcessEnv = process.env,
): BackendMigrationConfig => {
  const parsed = migrationEnvironmentSchema.parse(environment)

  return {
    databaseUrl: parsed.DATABASE_URL,
    migrationsFolder: paths.migrationsFolder,
    nonTransactionalMigrationsFolder: paths.nonTransactionalMigrationsFolder,
    lockTimeoutMs: parsed.MIGRATION_LOCK_TIMEOUT_MS,
    lockRetryMs: parsed.MIGRATION_LOCK_RETRY_MS,
    connectionTimeoutMs: parsed.MIGRATION_CONNECTION_TIMEOUT_MS,
    sqlLockTimeoutMs: parsed.MIGRATION_SQL_LOCK_TIMEOUT_MS,
    statementTimeoutMs: parsed.MIGRATION_STATEMENT_TIMEOUT_MS,
  }
}