// LXNS OAuth completion is bound to the DXRating user who started the authorization: the callback only forwards
// code and state, and lxns.complete exchanges them for that user's session alone.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.LXNS_CLIENT_ID = 'synthetic-client'
  process.env.LXNS_CLIENT_SECRET = 'synthetic-secret'
})

import { app } from '../app'
import { pool } from '../db/index'
import { cleanDatabase, extractSessionCookie, setupTestServer, teardownTestServer } from './setup'

const realFetch = globalThis.fetch
const tokenEndpoint = vi.fn<(body: unknown) => void>()
const tokenResponse = {
  success: true,
  code: 200,
  data: {
    access_token: 'synthetic-access-token',
    refresh_token: 'synthetic-refresh-token',
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'read_user_profile read_player',
  },
}

const signedIn = async (email: string) => {
  const res = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123', name: email.split('@')[0] }),
  })
  expect(res.status).toBe(200)
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [email])
  return { cookie: extractSessionCookie(res), id: rows[0].id }
}

const issueState = async (userId: string) => {
  const state = `state-${crypto.randomUUID()}`
  await pool.query('INSERT INTO lxns_oauth_states (state, user_id) VALUES ($1, $2)', [state, userId])
  return state
}

const callback = (query: Record<string, string>) =>
  app.request(`/api/v1/io/import/lxns/oauth_callback?${new URLSearchParams(query).toString()}`)

const complete = (body: { code: string; state: string }, cookie?: string) =>
  app.request('/api/v1/io/import/lxns/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  })

const tokens = async () =>
  (await pool.query<{ user_id: string }>('SELECT user_id FROM lxns_oauth_tokens ORDER BY user_id')).rows
const states = async () => (await pool.query<{ state: string }>('SELECT state FROM lxns_oauth_states')).rows

describe('LXNS OAuth completion', () => {
  beforeAll(setupTestServer)
  afterAll(teardownTestServer)

  beforeEach(async () => {
    await cleanDatabase()
    tokenEndpoint.mockReset()
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url === 'https://maimai.lxns.net/api/v0/oauth/token') {
        tokenEndpoint(JSON.parse(String(await new Response(init?.body).text())))
        return Response.json(tokenResponse)
      }
      return realFetch(input, init)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('a state issued to one user never saves tokens for anyone else', async () => {
    const initiator = await signedIn('lxns-initiator@example.com')
    const other = await signedIn('lxns-other@example.com')
    const state = await issueState(initiator.id)

    // The callback itself saves nothing, with or without a session
    const forwarded = await callback({ code: 'synthetic-code', state })
    expect(forwarded.status).toBe(302)
    expect(tokenEndpoint).not.toHaveBeenCalled()
    expect(await tokens()).toEqual([])

    // Another signed-in user cannot complete it, and the attempt burns the state
    const mismatch = await complete({ code: 'synthetic-code', state }, other.cookie)
    expect(mismatch.status).toBe(403)
    expect(await mismatch.json()).toMatchObject({ code: 'FORBIDDEN', data: { reason: 'session_mismatch' } })
    expect(tokenEndpoint).not.toHaveBeenCalled()
    expect(await tokens()).toEqual([])
    expect(await states()).toEqual([])

    // So the initiator cannot replay it either
    const replay = await complete({ code: 'synthetic-code', state }, initiator.cookie)
    expect(replay.ok).toBe(false)
    expect(await tokens()).toEqual([])
  })

  it('without a session the state is consumed and nothing is saved', async () => {
    const initiator = await signedIn('lxns-anonymous@example.com')
    const state = await issueState(initiator.id)

    const res = await complete({ code: 'synthetic-code', state })
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ code: 'UNAUTHORIZED', data: { reason: 'not_signed_in' } })
    expect(tokenEndpoint).not.toHaveBeenCalled()
    expect(await tokens()).toEqual([])
    expect(await states()).toEqual([])
  })

  it('answers 400 invalid_state for an unknown or reused state', async () => {
    const initiator = await signedIn('lxns-invalid@example.com')
    for (const cookie of [initiator.cookie, undefined]) {
      const res = await complete({ code: 'synthetic-code', state: 'state-never-issued' }, cookie)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: 'BAD_REQUEST', data: { reason: 'invalid_state' } })
    }
    expect(tokenEndpoint).not.toHaveBeenCalled()
  })

  it('forwards code and state to the web callback page, keeping provider errors as they were', async () => {
    const initiator = await signedIn('lxns-forward@example.com')
    const state = await issueState(initiator.id)

    const forwarded = await callback({ code: 'synthetic-code', state })
    const location = new URL(forwarded.headers.get('location')!)
    expect(location.pathname).toBe('/io/import/lxns/oauth_callback')
    expect(Object.fromEntries(location.searchParams)).toEqual({ code: 'synthetic-code', state })
    expect(await states()).toEqual([{ state }])

    const denied = await callback({ error: 'access_denied', state })
    expect(new URL(denied.headers.get('location')!).search).toBe('?status=error&error=access_denied')
  })

  it.each([
    // The web app calls from dxrating.net with the browser's cookie
    ['web', (cookie: string) => ({ Cookie: cookie, Origin: 'http://localhost:5173' })],
    // The iOS app sends its stored session cookie itself, with no Origin
    ['native', (cookie: string) => ({ Cookie: cookie })],
  ] as const)('completes for the initiating user (%s)', async (_client, headers) => {
    const initiator = await signedIn(`lxns-happy-${_client}@example.com`)
    const state = await issueState(initiator.id)

    const res = await app.request('/api/v1/io/import/lxns/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers(initiator.cookie) },
      body: JSON.stringify({ code: 'synthetic-code', state }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(tokenEndpoint).toHaveBeenCalledOnce()
    expect(tokenEndpoint.mock.calls[0][0]).toMatchObject({ grant_type: 'authorization_code', code: 'synthetic-code' })
    expect(await tokens()).toEqual([{ user_id: initiator.id }])
    expect(await states()).toEqual([])

    const status = await app.request('/api/v1/io/import/lxns/status', { headers: headers(initiator.cookie) })
    expect(await status.json()).toEqual({ connected: true })
  })
})