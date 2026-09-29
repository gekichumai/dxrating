import { randomUUID } from 'node:crypto'
import { Effect, Layer, ManagedRuntime, type Scope } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppConfig, config } from '../config'
import { Database, databaseLayer } from '../db/index'
import { HttpClient, HttpClientLive, HttpError } from '../services/http-client'
import {
  disconnect,
  exchangeCodeForTokens,
  fetchPlayerScores,
  generateAuthorizationUrl,
  getConnectionStatus,
  LxnsError,
} from '../services/lxns/index'
import { cleanDatabase, setupTestServer, teardownTestServer } from './setup'

const testConfig = {
  ...config,
  lxns: { clientId: 'synthetic-client', clientSecret: 'synthetic-secret' },
}

const tokenData = {
  access_token: 'synthetic-access-token',
  refresh_token: 'synthetic-refresh-token',
  token_type: 'Bearer',
  expires_in: 3600,
  scope: 'read_user_profile read_player',
}

const envelope = (data: unknown) => Response.json({ success: true, code: 200, data })

describe('LXNS Effect service', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const upstream = vi.fn<typeof fetch>()
  const http = HttpClientLive.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, upstream)))
  const runtime = ManagedRuntime.make(Layer.merge(databaseLayer(Effect.succeed(pool)), http))
  const userId = randomUUID()
  const run = <A, E>(
    effect: Effect.Effect<A, E, Database | AppConfig | HttpClient | Scope.Scope>,
    options?: { signal: AbortSignal },
  ) => runtime.runPromise(Effect.scoped(effect.pipe(Effect.provideService(AppConfig, testConfig))), options)

  const seedToken = (expiresAt: Date) =>
    pool.query(
      `INSERT INTO lxns_oauth_tokens (user_id, access_token, refresh_token, expires_at, scope)
     VALUES ($1, $2, $3, $4, $5)`,
      [userId, 'old-access', 'old-refresh', expiresAt.toISOString(), tokenData.scope],
    )

  beforeAll(setupTestServer)

  beforeEach(async () => {
    upstream.mockReset()
    upstream.mockRejectedValue(new Error('Unexpected upstream request'))
    await cleanDatabase()
    await pool.query(`INSERT INTO "user" (id, name, email) VALUES ($1, 'LXNS fixture', 'lxns@example.invalid')`, [
      userId,
    ])
  })

  afterAll(async () => {
    await runtime.dispose()
    await teardownTestServer()
  })

  it('persists authorization state, removes expired states, and uses the canonical callback URL', async () => {
    await pool.query('INSERT INTO lxns_oauth_states (state, user_id, created_at) VALUES ($1, $2, $3)', [
      'expired-state',
      userId,
      new Date(Date.now() - 11 * 60_000).toISOString(),
    ])
    const url = new URL(await run(generateAuthorizationUrl(userId)))

    expect(url.origin + url.pathname).toBe('https://maimai.lxns.net/oauth/authorize')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: 'synthetic-client',
      scope: 'read_user_profile read_player',
      redirect_uri: `${config.auth.url.replace(/\/$/, '')}/api/v1/io/import/lxns/oauth_callback`,
    })
    expect((await pool.query('SELECT state, user_id FROM lxns_oauth_states')).rows).toEqual([
      {
        state: url.searchParams.get('state'),
        user_id: userId,
      },
    ])
    expect(upstream).not.toHaveBeenCalled()
  })

  it('consumes authorization state once across concurrent callbacks and persists returned tokens', async () => {
    const authorization = new URL(await run(generateAuthorizationUrl(userId)))
    const state = authorization.searchParams.get('state')!
    upstream.mockResolvedValueOnce(envelope(tokenData))

    const results = await Promise.allSettled([
      run(exchangeCodeForTokens('code', state)),
      run(exchangeCodeForTokens('code', state)),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toEqual([{ status: 'fulfilled', value: userId }])
    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected).toMatchObject({ reason: { _tag: 'LxnsError', message: 'Invalid or expired OAuth state' } })
    expect(upstream).toHaveBeenCalledTimes(1)
    const request = upstream.mock.calls[0]
    expect(request[0] instanceof Request ? request[0].url : request[0].toString()).toBe(
      'https://maimai.lxns.net/api/v0/oauth/token',
    )
    expect(await new Response(request[1]!.body).json()).toMatchObject({
      grant_type: 'authorization_code',
      code: 'code',
    })
    expect(
      (await pool.query('SELECT user_id, access_token, refresh_token, scope FROM lxns_oauth_tokens')).rows,
    ).toEqual([
      {
        user_id: userId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        scope: tokenData.scope,
      },
    ])
    expect((await pool.query('SELECT state FROM lxns_oauth_states')).rows).toEqual([])
    expect(await run(getConnectionStatus(userId))).toEqual({ connected: true })
  })

  it('consumes an expired state without calling the upstream token endpoint', async () => {
    await pool.query('INSERT INTO lxns_oauth_states (state, user_id, created_at) VALUES ($1, $2, $3)', [
      'expired-state',
      userId,
      new Date(Date.now() - 11 * 60_000).toISOString(),
    ])

    await expect(run(exchangeCodeForTokens('code', 'expired-state'))).rejects.toMatchObject({
      message: 'OAuth state expired',
    })
    expect((await pool.query('SELECT state FROM lxns_oauth_states')).rows).toEqual([])
    expect(upstream).not.toHaveBeenCalled()
  })

  it('does not persist malformed upstream tokens', async () => {
    const authorization = new URL(await run(generateAuthorizationUrl(userId)))
    upstream.mockResolvedValueOnce(envelope({ access_token: 'incomplete' }))

    await expect(run(exchangeCodeForTokens('code', authorization.searchParams.get('state')!))).rejects.toMatchObject({
      _tag: 'LxnsError',
      message: 'Invalid LXNS token response',
    })
    expect((await pool.query('SELECT user_id FROM lxns_oauth_tokens')).rows).toEqual([])
  })

  it('uses a valid access token and normalizes empty score status fields', async () => {
    await seedToken(new Date(Date.now() + 60_000))
    const score = {
      id: 1,
      song_name: 'Test song',
      level: '13',
      level_index: 3,
      achievements: 100,
      fc: '',
      fs: '',
      type: 'dx',
      dx_score: 1234,
    }
    upstream.mockResolvedValueOnce(envelope([score]))

    expect(await run(fetchPlayerScores(userId))).toEqual([{ ...score, fc: null, fs: null }])
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(new Headers(upstream.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer old-access')
  })

  it('refreshes near-expiry tokens before fetching scores and persists the replacement', async () => {
    await seedToken(new Date(Date.now() + 10_000))
    upstream.mockResolvedValueOnce(envelope(tokenData)).mockResolvedValueOnce(envelope([]))

    expect(await run(fetchPlayerScores(userId))).toEqual([])
    expect(upstream).toHaveBeenCalledTimes(2)
    expect(await new Response(upstream.mock.calls[0][1]!.body).json()).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'old-refresh',
    })
    expect(new Headers(upstream.mock.calls[1][1]?.headers).get('authorization')).toBe(
      `Bearer ${tokenData.access_token}`,
    )
    const tokens = await pool.query(
      "SELECT access_token, refresh_token, extract(epoch from expires_at AT TIME ZONE 'UTC') * 1000 AS expires_at_ms FROM lxns_oauth_tokens",
    )
    expect(tokens.rows[0]).toMatchObject({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
    })
    expect(Number(tokens.rows[0].expires_at_ms)).toBeGreaterThan(Date.now() + 3_500_000)
  })

  it('removes rejected refresh credentials and requires reconnection', async () => {
    await seedToken(new Date(Date.now() - 1000))
    upstream.mockResolvedValueOnce(new Response('invalid_grant', { status: 401 }))

    await expect(run(fetchPlayerScores(userId))).rejects.toMatchObject({
      _tag: 'LxnsError',
      message: 'LXNS connection expired. Please reconnect your account.',
    })
    expect(await run(getConnectionStatus(userId))).toEqual({ connected: false })
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it('removes rejected credentials even when reading the upstream error body would fail', async () => {
    await seedToken(new Date(Date.now() - 1000))
    const response = new Response(null, { status: 401 })
    const readBody = vi.spyOn(response, 'text').mockRejectedValue(new Error('Upstream body stream failed'))
    upstream.mockResolvedValueOnce(response)

    await expect(run(fetchPlayerScores(userId))).rejects.toMatchObject({
      _tag: 'LxnsError',
      message: 'LXNS connection expired. Please reconnect your account.',
    })
    expect(readBody).not.toHaveBeenCalled()
    expect(await run(getConnectionStatus(userId))).toEqual({ connected: false })
  })

  it.each(['exchange', 'refresh'] as const)(
    'persists issued tokens when the caller cancels during %s',
    async (operation) => {
      const state =
        operation === 'exchange'
          ? new URL(await run(generateAuthorizationUrl(userId))).searchParams.get('state')!
          : undefined
      if (operation === 'refresh') await seedToken(new Date(Date.now() - 1000))
      let reportReading!: () => void
      let finishReading!: () => void
      const reading = new Promise<void>((resolve) => {
        reportReading = resolve
      })
      const gate = new Promise<void>((resolve) => {
        finishReading = resolve
      })
      const body = new ReadableStream<Uint8Array>(
        {
          async pull(controller) {
            reportReading()
            await gate
            controller.enqueue(new TextEncoder().encode(JSON.stringify({ success: true, code: 200, data: tokenData })))
            controller.close()
          },
        },
        { highWaterMark: 0 },
      )
      upstream.mockResolvedValueOnce(new Response(body))
      const controller = new AbortController()
      const workflow =
        operation === 'exchange'
          ? exchangeCodeForTokens('code', state!).pipe(Effect.asVoid)
          : fetchPlayerScores(userId).pipe(Effect.asVoid)
      const response = run(workflow, { signal: controller.signal })
      const rejected = expect(response).rejects.toBeDefined()
      await reading
      controller.abort()
      finishReading()
      await rejected

      expect(
        (await pool.query('SELECT access_token, refresh_token FROM lxns_oauth_tokens WHERE user_id = $1', [userId]))
          .rows,
      ).toEqual([{ access_token: tokenData.access_token, refresh_token: tokenData.refresh_token }])
      expect(upstream).toHaveBeenCalledTimes(1)
    },
  )

  it('preserves the connection on a transport failure so a retry remains possible', async () => {
    await seedToken(new Date(Date.now() - 1000))
    upstream.mockRejectedValueOnce(new Error('Network unavailable'))

    await expect(run(fetchPlayerScores(userId))).rejects.toBeInstanceOf(HttpError)
    expect(await run(getConnectionStatus(userId))).toEqual({ connected: true })
  })

  it('rejects unsuccessful score envelopes as a typed LXNS error', async () => {
    await seedToken(new Date(Date.now() + 60_000))
    upstream.mockResolvedValueOnce(
      Response.json({ success: false, code: 403, message: 'Permission denied', data: null }),
    )

    await expect(run(fetchPlayerScores(userId))).rejects.toBeInstanceOf(LxnsError)
    expect(await run(getConnectionStatus(userId))).toEqual({ connected: true })
  })

  it('disconnects only the requested user and rejects later score requests', async () => {
    await seedToken(new Date(Date.now() + 60_000))
    const otherUser = randomUUID()
    await pool.query(`INSERT INTO "user" (id, name, email) VALUES ($1, 'Other fixture', 'other@example.invalid')`, [
      otherUser,
    ])
    await pool.query(
      `INSERT INTO lxns_oauth_tokens (user_id, access_token, refresh_token, expires_at, scope)
       VALUES ($1, 'other-access', 'other-refresh', $2, 'read_player')`,
      [otherUser, new Date(Date.now() + 60_000).toISOString()],
    )
    await run(disconnect(userId))

    expect(await run(getConnectionStatus(userId))).toEqual({ connected: false })
    expect(await run(getConnectionStatus(otherUser))).toEqual({ connected: true })
    await expect(run(fetchPlayerScores(userId))).rejects.toMatchObject({
      message: 'No LXNS connection found. Please authorize first.',
    })
    expect(upstream).not.toHaveBeenCalled()
  })
})