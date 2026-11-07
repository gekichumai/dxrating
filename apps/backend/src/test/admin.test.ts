import { randomUUID } from 'node:crypto'
import { Effect, Exit } from 'effect'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { authorizeAdmin, type AdminPolicy } from '../admin/require-admin'
import { parseAdminUserIds } from '../config'
import { viewerFromSession, type SessionUser } from '../proofs/viewer-is'
import {
  authenticatedFetch,
  cleanDatabase,
  extractSessionCookie,
  getBaseUrl,
  setupTestServer,
  signUp,
  teardownTestServer,
} from './setup'

const ORIGIN = 'https://dxrating.net'
const viewer = (id: string) => {
  const user: SessionUser = {
    id,
    name: 'Synthetic',
    email: 'synthetic@example.invalid',
    emailVerified: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }
  return viewerFromSession(user)
}
const policy: AdminPolicy = { userIds: ['admin-1'], allowedOrigin: ORIGIN }
const code = (exit: Exit.Exit<unknown, { code: string }>) =>
  Exit.isFailure(exit) ? Exit.findErrorOption(exit).pipe((o) => (o._tag === 'Some' ? o.value.code : 'defect')) : 'ok'

describe('authorizeAdmin', () => {
  const run = (p: AdminPolicy, request: Parameters<typeof authorizeAdmin>[1]) =>
    Effect.runSyncExit(authorizeAdmin(p, request))

  it('returns the administrator for an allowlisted user from the web origin', () => {
    const exit = run(policy, { viewer: viewer('admin-1'), origin: ORIGIN })
    expect(Exit.isSuccess(exit) && exit.value.id).toBe('admin-1')
  })

  it.each([
    ['no session', { viewer: undefined, origin: ORIGIN }, 'UNAUTHORIZED'],
    ['a user not on the list', { viewer: viewer('someone'), origin: ORIGIN }, 'FORBIDDEN'],
    ['no Origin header', { viewer: viewer('admin-1'), origin: null }, 'FORBIDDEN'],
    ['another origin', { viewer: viewer('admin-1'), origin: 'https://evil.example' }, 'FORBIDDEN'],
    ['a preview origin', { viewer: viewer('admin-1'), origin: 'https://x.dxrating.pages.dev' }, 'FORBIDDEN'],
  ])('fails closed for %s', (_, request, expected) => {
    expect(code(run(policy, request))).toBe(expected)
  })

  it('denies everyone when the allowlist is empty', () => {
    expect(code(run({ ...policy, userIds: [] }, { viewer: viewer(''), origin: ORIGIN }))).toBe('FORBIDDEN')
  })

  it('parses ADMIN_USER_IDS', () => {
    expect(parseAdminUserIds(undefined)).toEqual([])
    expect(parseAdminUserIds(' , ')).toEqual([])
    expect(parseAdminUserIds('a, b ,,c')).toEqual(['a', 'b', 'c'])
  })
})

describe('admin API', () => {
  beforeAll(setupTestServer)
  afterAll(teardownTestServer)
  beforeEach(cleanDatabase)

  it('answers 401 without a session and 403 for a signed-in user (empty allowlist in tests)', async () => {
    const anonymous = await fetch(`${getBaseUrl()}/api/v1/admin/me`, { headers: { Origin: 'http://localhost:5173' } })
    expect(anonymous.status).toBe(401)

    const email = `admin-${randomUUID()}@example.invalid`
    const cookie = extractSessionCookie(await signUp(email, 'synthetic-password-123', 'Admin fixture'))
    const signedIn = await authenticatedFetch(`${getBaseUrl()}/api/v1/admin/me`, cookie, {
      headers: { Origin: 'http://localhost:5173' },
    })
    expect(signedIn.status).toBe(403)
    expect(signedIn.headers.get('cache-control') ?? '').not.toMatch(/public/)
  })

  it('keeps admin routes out of /spec.json', async () => {
    const spec = (await (await fetch(`${getBaseUrl()}/spec.json`)).json()) as { paths: Record<string, unknown> }
    expect(Object.keys(spec.paths).filter((path) => path.startsWith('/admin'))).toEqual([])
  })
})