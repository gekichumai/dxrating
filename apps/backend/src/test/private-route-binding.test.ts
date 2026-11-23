import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// config.ts reads the environment once, at import: every private write is reachable (the opt-in phase is open and
// server imports are on), so the account binding is what answers.
vi.hoisted(() => {
  process.env.CLOUD_SAVE_MODE = 'optin'
  process.env.CLOUD_SAVE_ALLOWLIST_EMAILS = ''
  process.env.SERVER_IMPORTS = 'on'
})

import { getOpenAPIMeta } from '@orpc/openapi'
import { ProcedureContract, type AnyContractRouter } from '@orpc/contract'
import {
  CLOUD_SAVE_EXPECTED_USER_HEADER,
  CLOUD_SAVE_NET_IMPORT_ROUTE,
  privateContractRoutes,
} from '@gekichumai/api-contract'
import { api, session, testPool } from './cloud-save-helpers'
import { cleanDatabase, setupTestServer, teardownTestServer } from './setup'

/**
 * Writes that may skip `X-DXRating-Expected-User`, each with the reason. `sessions.revoke` only deletes the caller's
 * own session rows, and the iOS Security screen calls it without the header.
 */
const UNBOUND_WRITES = new Set(['sessions.revoke'])

/** Bodies for the writes that check the binding in their handler, after the input is parsed */
const VALID_INPUTS: Record<string, unknown> = { 'features.optInCloudSave': { consentVersion: '2026-11-01' } }

interface PrivateWrite {
  name: string
  method: string
  path: string
}

const procedures = (router: AnyContractRouter, path: string[] = []): Array<[string, AnyContractRouter]> =>
  router instanceof ProcedureContract
    ? [[path.join('.'), router]]
    : Object.entries(router).flatMap(([key, value]) => procedures(value as AnyContractRouter, [...path, key]))

const contractWrites: PrivateWrite[] = procedures(privateContractRoutes).flatMap(([name, procedure]) => {
  const meta = getOpenAPIMeta(procedure as never)
  const method = meta?.method ?? 'POST'
  return method === 'GET' ? [] : [{ name, method, path: meta!.path! }]
})

const privateWrites: PrivateWrite[] = [
  ...contractWrites.filter((write) => !UNBOUND_WRITES.has(write.name)),
  { name: 'netImport', method: CLOUD_SAVE_NET_IMPORT_ROUTE.method, path: CLOUD_SAVE_NET_IMPORT_ROUTE.path },
]

const send = (cookie: string, write: PrivateWrite, headers: Record<string, string>) =>
  api(
    cookie,
    write.method,
    write.path.replace(/^\/api\/v1/, '').replace(/\{[^}]+\}/g, 'dsav_bound'),
    write.method === 'DELETE' ? undefined : (VALID_INPUTS[write.name] ?? {}),
    headers,
  )

describe('account binding of every private write (§10)', () => {
  const pool = testPool()

  beforeAll(async () => {
    await setupTestServer()
    await cleanDatabase()
  })
  afterAll(async () => {
    await teardownTestServer()
    await pool.end()
  })

  it('names only routes that exist among the writes allowed to skip the binding', () => {
    expect(contractWrites.map((write) => write.name)).toEqual(expect.arrayContaining([...UNBOUND_WRITES]))
  })

  it.each(privateWrites.map((write) => [write.name, write] as const))(
    '%s answers 400 without the header and 409 ACCOUNT_MISMATCH for another account',
    async (_, write) => {
      const signedIn = await session(pool, `bound-${write.name}@example.com`)
      const other = await session(pool, `other-${write.name}@example.com`)

      const missing = await send(signedIn.cookie, write, { [CLOUD_SAVE_EXPECTED_USER_HEADER]: '' })
      expect(missing.status).toBe(400)
      expect(missing.body).toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining(CLOUD_SAVE_EXPECTED_USER_HEADER),
      })

      const mismatch = await send(signedIn.cookie, write, { [CLOUD_SAVE_EXPECTED_USER_HEADER]: other.userId })
      expect(mismatch.status).toBe(409)
      expect(mismatch.body).toMatchObject({ code: 'CONFLICT', data: { reason: 'ACCOUNT_MISMATCH' } })
    },
  )
})