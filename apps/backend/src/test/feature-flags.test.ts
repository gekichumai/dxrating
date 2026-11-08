import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { call, ORPCError, os } from '@orpc/server'
import { Effect } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// config.ts reads the environment once, at import.
vi.hoisted(() => {
  process.env.CLOUD_SAVE_MODE = 'optin'
  process.env.CLOUD_SAVE_ALLOWLIST_EMAILS = ' Allowed@Example.com , other-owner@example.com'
  process.env.SERVER_IMPORTS = 'off'
})

import { CLOUD_SAVE_EXPECTED_USER_HEADER } from '@gekichumai/api-contract'
import { requireFeature, requireSession } from '../orpc-middleware'
import type { ApiContext } from '../router'
import { appRuntime } from '../runtime'
import {
  authenticatedFetch,
  bindCookieToUser,
  cleanDatabase,
  extractSessionCookie,
  getBaseUrl,
  setupTestServer,
  signIn,
  signUp,
  teardownTestServer,
} from './setup'

const backendDirectory = path.resolve(import.meta.dirname, '../..')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

// Email/password sign-up leaves the address unverified; `verified` stands in for an OAuth-verified account.
const session = async (email: string, { verified = false } = {}) => {
  await signUp(email, 'password123', email.split('@')[0]!)
  if (verified) await pool.query('UPDATE "user" SET email_verified = true WHERE email = $1', [email.toLowerCase()])
  const cookie = extractSessionCookie(await signIn(email, 'password123'))
  const user = await pool.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [email.toLowerCase()])
  bindCookieToUser(cookie, user.rows[0]!.id)
  return { cookie, userId: user.rows[0]!.id }
}

const features = (cookie: string) => authenticatedFetch(`${getBaseUrl()}/api/v1/me/features`, cookie)
const optIn = (cookie: string, body: unknown) =>
  authenticatedFetch(`${getBaseUrl()}/api/v1/me/features/cloud-save/opt-in`, cookie, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const flagSet = (...args: string[]) =>
  execFileSync(process.execPath, ['--import', 'tsx', 'src/flag-set.ts', ...args], {
    cwd: backendDirectory,
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 30_000,
  })

// A stand-in for a cloud save route: session, then the feature gate.
const gated = os
  .$context<ApiContext>()
  .use(requireSession)
  .use(requireFeature('cloud_save'))
  .handler(() => 'reached')
const callGated = async (userId: string | undefined) => {
  const effectContext = await Effect.runPromise(appRuntime.contextEffect)
  const user = userId ? ({ id: userId } as NonNullable<ApiContext['user']>) : undefined
  return call(gated, undefined, { context: { 'effect/context': effectContext, user } })
}

describe('feature flags (CLOUD_SAVE_MODE=optin)', () => {
  beforeAll(async () => {
    await setupTestServer()
    await cleanDatabase()
  })

  afterAll(async () => {
    await teardownTestServer()
    await pool.end()
  })

  it('requires a session for both routes', async () => {
    expect((await fetch(`${getBaseUrl()}/api/v1/me/features`)).status).toBe(401)
    const response = await fetch(`${getBaseUrl()}/api/v1/me/features/cloud-save/opt-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consentVersion: '2026-11-01' }),
    })
    expect(response.status).toBe(401)
    await expect(callGated(undefined)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('enables verified allowlisted emails without a row', async () => {
    const { cookie, userId } = await session('allowed@example.com', { verified: true })
    const response = await features(cookie)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('cdn-cache-control')).toBe('no-store')
    expect(response.headers.get('cloudflare-cdn-cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ cloudSave: true, serverImports: false, optInAvailable: false })
    expect(await callGated(userId)).toBe('reached')
  })

  it('ignores the allowlist for an unverified sign-up', async () => {
    const { cookie, userId } = await session('other-owner@example.com')
    expect(await (await features(cookie)).json()).toEqual({
      cloudSave: false,
      serverImports: false,
      optInAvailable: true,
    })
    await expect(callGated(userId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(flagSet('cloud_save', 'other-owner@example.com', 'on')).toContain('(email NOT verified)')
  })

  it('keeps others off until they opt in, then records the consent', async () => {
    const { cookie, userId } = await session('opt-in@example.com')
    expect(await (await features(cookie)).json()).toEqual({
      cloudSave: false,
      serverImports: false,
      optInAvailable: true,
    })
    const blocked = callGated(userId)
    await expect(blocked).rejects.toBeInstanceOf(ORPCError)
    await expect(blocked).rejects.toMatchObject({ code: 'NOT_FOUND' })

    expect((await optIn(cookie, { consentVersion: '2026-11-01', source: 'admin' })).status).toBe(400)
    expect((await optIn(cookie, {})).status).toBe(400)

    const response = await optIn(cookie, { consentVersion: '2026-11-01' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ cloudSave: true, serverImports: false, optInAvailable: false })
    expect(await (await features(cookie)).json()).toMatchObject({ cloudSave: true })
    expect(await callGated(userId)).toBe('reached')

    const rows = await pool.query(
      'SELECT flag, enabled, source, consent_version FROM feature_flag_overrides WHERE user_id = $1',
      [userId],
    )
    expect(rows.rows).toEqual([{ flag: 'cloud_save', enabled: true, source: 'opt_in', consent_version: '2026-11-01' }])
  })

  it('records the consent only for the account the request names (409 for another one, 400 without one)', async () => {
    const giver = await session('consent-giver@example.com')
    const switched = await session('consent-switched@example.com')
    const header = CLOUD_SAVE_EXPECTED_USER_HEADER
    // The session became `switched` while the consent `giver` gave was on its way
    const mismatch = await authenticatedFetch(`${getBaseUrl()}/api/v1/me/features/cloud-save/opt-in`, switched.cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [header]: giver.userId },
      body: JSON.stringify({ consentVersion: '2026-11-01' }),
    })
    expect(mismatch.status).toBe(409)
    expect(await mismatch.json()).toMatchObject({ code: 'CONFLICT', data: { reason: 'ACCOUNT_MISMATCH' } })
    const missing = await authenticatedFetch(`${getBaseUrl()}/api/v1/me/features/cloud-save/opt-in`, switched.cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [header]: '' },
      body: JSON.stringify({ consentVersion: '2026-11-01' }),
    })
    expect(missing.status).toBe(400)
    const rows = await pool.query('SELECT 1 FROM feature_flag_overrides WHERE user_id = ANY($1)', [
      [giver.userId, switched.userId],
    ])
    expect(rows.rowCount).toBe(0)
  })

  it('applies flag:set admin overrides, which an opt-in cannot replace', async () => {
    const disabled = await session('disabled@example.com')
    expect(flagSet('cloud_save', 'DISABLED@example.com', 'off')).toContain(
      `Set cloud_save=off (admin) for user ${disabled.userId}`,
    )
    expect(await (await features(disabled.cookie)).json()).toEqual({
      cloudSave: false,
      serverImports: false,
      optInAvailable: false,
    })
    expect((await optIn(disabled.cookie, { consentVersion: '2026-11-01' })).status).toBe(403)
    await expect(callGated(disabled.userId)).rejects.toMatchObject({ code: 'NOT_FOUND' })

    const enabled = await session('enabled@example.com')
    flagSet('cloud_save', 'enabled@example.com', 'on')
    expect(await (await features(enabled.cookie)).json()).toMatchObject({ cloudSave: true })

    const rows = await pool.query(
      `SELECT user_id, enabled, source, consent_version FROM feature_flag_overrides
       WHERE user_id IN ($1, $2) ORDER BY enabled`,
      [disabled.userId, enabled.userId],
    )
    expect(rows.rows).toEqual([
      { user_id: disabled.userId, enabled: false, source: 'admin', consent_version: null },
      { user_id: enabled.userId, enabled: true, source: 'admin', consent_version: null },
    ])
  })

  it('rejects unknown flags, unknown emails and bad states in flag:set', () => {
    for (const args of [
      ['cloud-save', 'enabled@example.com', 'on'],
      ['cloud_save', 'nobody@example.com', 'on'],
      ['cloud_save', 'enabled@example.com', 'yes'],
      [],
    ]) {
      expect(() => flagSet(...args)).toThrow()
    }
  })
})