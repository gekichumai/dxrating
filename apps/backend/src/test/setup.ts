// env.ts is loaded via vitest setupFiles before this file is imported,
// so process.env is already populated when config.ts parses.

import { serve } from '@hono/node-server'
import type { ServerType } from '@hono/node-server'
import { fileURLToPath } from 'node:url'
import { app } from '../app.js'
import { pool as appPool } from '../db/index.js'
import { loadBackendMigrationConfig } from '../db/migration-config.js'
import { runBackendMigrations, type MigrationLogger } from '../db/migration-runner.js'
import pg from 'pg'

const TEST_PORT = Number(process.env.PORT || 3001)
const BASE_URL = `http://localhost:${TEST_PORT}`

let server: ServerType | undefined

const silentMigrationLogger: MigrationLogger = {
  info: () => undefined,
  error: () => undefined,
}

export function getBaseUrl() {
  return BASE_URL
}

export async function setupTestServer() {
  // 1. Create test database if it doesn't exist
  const adminDatabaseUrl = new URL(process.env.DATABASE_URL!)
  adminDatabaseUrl.pathname = '/postgres'
  const adminPool = new pg.Pool({
    connectionString: adminDatabaseUrl.toString(),
  })
  try {
    try {
      await adminPool.query('CREATE DATABASE dxrating_test')
    } catch (error: unknown) {
      if (!(error instanceof pg.DatabaseError) || error.code !== '42P04') throw error
    }
  } finally {
    await adminPool.end()
  }

  // 2. Use the exact locked journal runner used by the one-shot production job.
  // Drizzle discovers generated files from meta/_journal.json; failures are not
  // converted to success based on database error text.
  await runBackendMigrations(
    loadBackendMigrationConfig({
      migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
      nonTransactionalMigrationsFolder: fileURLToPath(new URL('../../non-transactional-migrations', import.meta.url)),
    }),
    { logger: silentMigrationLogger },
  )

  // 3. Start the server
  server = serve({ fetch: app.fetch, port: TEST_PORT })

  // 4. Wait for server to be ready
  await waitForServer()
}

async function waitForServer(retries = 30, delayMs = 200) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE_URL}/health`)
      if (res.ok) return
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, delayMs))
  }
  throw new Error('Server did not start in time')
}

export async function teardownTestServer() {
  server?.close()
  await appPool.end()
}

// --- Auth helpers ---

export async function signUp(email: string, password: string, name: string) {
  return fetch(`${BASE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({ email, password, name }),
  })
}

export async function signIn(email: string, password: string) {
  return fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({ email, password }),
  })
}

export function extractSessionCookie(res: Response): string {
  const setCookies = res.headers.getSetCookie?.() ?? []
  return setCookies
    .filter((c) => c.includes('dxrating'))
    .map((c) => c.split(';')[0])
    .join('; ')
}

export async function authenticatedFetch(url: string, cookie: string, init?: RequestInit) {
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      Cookie: cookie,
    },
  })
}

// --- DB cleanup helper ---

export async function cleanDatabase() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  // Order matters due to foreign keys
  // Production callers cannot truncate this append-only table. The test
  // database owner resets it before deleting users referenced with RESTRICT.
  await pool.query('TRUNCATE admin_role_change_history RESTART IDENTITY')
  await pool.query('DELETE FROM arcade.geocoding_coordinate_invalidations')
  await pool.query('DELETE FROM arcade.geocoding_coordinate_decisions')
  await pool.query('DELETE FROM arcade.geocoding_observations')
  await pool.query('DELETE FROM arcade.installation_observations')
  await pool.query('DELETE FROM arcade.installations')
  await pool.query('DELETE FROM arcade.installation_identities')
  await pool.query('DELETE FROM arcade.venue_chain_decisions')
  await pool.query('DELETE FROM arcade.venue_matches')
  await pool.query('DELETE FROM arcade.venue_sources')
  await pool.query('DELETE FROM arcade.game_source_mappings')
  await pool.query('DELETE FROM arcade.venues')
  await pool.query('DELETE FROM arcade.chains')
  await pool.query('DELETE FROM arcade.games')
  await pool.query('DELETE FROM arcade.crawl_runs')
  await pool.query('DELETE FROM tag_songs')
  await pool.query('DELETE FROM tags')
  await pool.query('DELETE FROM tag_groups')
  await pool.query('DELETE FROM comments')
  await pool.query('DELETE FROM song_aliases')
  await pool.query('DELETE FROM lxns_oauth_states')
  await pool.query('DELETE FROM lxns_oauth_tokens')
  await pool.query('DELETE FROM profiles')
  await pool.query('DELETE FROM passkey')
  await pool.query('DELETE FROM session')
  await pool.query('DELETE FROM account')
  await pool.query('DELETE FROM verification')
  await pool.query('DELETE FROM "user"')
  await pool.end()
}