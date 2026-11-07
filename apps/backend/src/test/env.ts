// This file is loaded via vitest setupFiles BEFORE any test imports.
// It provides local defaults while preserving explicit CI/test-runner values.
import * as dotenv from 'dotenv'
import * as path from 'node:path'
import { assertSafeTestDatabaseUrl } from './test-database-safety'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test'), override: false })
assertSafeTestDatabaseUrl(process.env.DATABASE_URL)
// The admin API allows the users listed here; tests sign in as this one (seedAdminUser in setup.ts)
export const TEST_ADMIN_USER_ID = 'test-admin-user'
process.env.ADMIN_USER_IDS ??= TEST_ADMIN_USER_ID