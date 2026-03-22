// env.ts is loaded via vitest setupFiles before this file is imported,
// so process.env is already populated when config.ts parses.

import * as path from 'node:path'
import { serve } from '@hono/node-server'
import type { ServerType } from '@hono/node-server'
import { app } from '../app.js'
import { pool as appPool } from '../db/index.js'
import pg from 'pg'
import fs from 'node:fs/promises'

const TEST_PORT = Number(process.env.PORT || 3001)
const BASE_URL = `http://localhost:${TEST_PORT}`

let server: ServerType | undefined

export function getBaseUrl() {
  return BASE_URL
}

export async function setupTestServer() {
  // 1. Create test database if it doesn't exist
  const adminPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL!.replace('/dxrating_test', '/postgres'),
  })
  try {
    await adminPool.query('CREATE DATABASE dxrating_test')
  } catch (e: unknown) {
    if (!(e instanceof Error) || !e.message.includes('already exists')) throw e
  }
  await adminPool.end()

  // 2. Run migration SQL files
  const migrationsPool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const migrationDir = path.resolve(__dirname, '../../drizzle')
  const migrationFiles = [
    '0000_init.sql',
    '0001_add_better_auth.sql',
    '0002_add_relations.sql',
    '0003_localized_tags_to_jsonb.sql',
    '0004_add_lxns_oauth.sql',
  ]

  for (const file of migrationFiles) {
    const sql = await fs.readFile(path.join(migrationDir, file), 'utf-8')
    const statements = sql.split('--> statement-breakpoint')
    for (const stmt of statements) {
      const trimmed = stmt.trim()
      if (trimmed) {
        try {
          await migrationsPool.query(trimmed)
        } catch (e: unknown) {
          if (e instanceof Error && (e.message.includes('already exists') || e.message.includes('duplicate key'))) {
            continue
          }
          throw e
        }
      }
    }
  }
  await migrationsPool.end()

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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  })
}

export async function signIn(email: string, password: string) {
  return fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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