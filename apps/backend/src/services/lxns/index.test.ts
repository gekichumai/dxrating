import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicAccountBanned } from '../../public-access-policy.js'
import { cleanDatabase, setupTestServer, teardownTestServer } from '../../test/setup.js'
import { exchangeCodeForTokens } from './index.js'

const tokenResponse = () =>
  new Response(
    JSON.stringify({
      success: true,
      code: 200,
      data: {
        access_token: 'access-token',
        token_type: 'Bearer',
        expires_in: 3_600,
        refresh_token: 'refresh-token',
        scope: 'read_user_profile read_player',
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )

describe('LXNS OAuth callback ban enforcement', () => {
  const database = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const dependencies = {
    database,
    clientId: 'test-client',
    clientSecret: 'test-secret',
    redirectUri: 'http://localhost:3001/api/v1/io/import/lxns/oauth_callback',
  } as const

  const establishBan = async (reason: string) => {
    const event = await database.query<{ readonly id: string }>(
      `
        INSERT INTO admin_user_ban_history (
          subject_user_id,
          actor_user_id,
          action,
          reason,
          ban_started_at,
          expires_at
        )
        VALUES (
          'lxns-user',
          'moderator',
          'ban',
          $1,
          clock_timestamp(),
          clock_timestamp() + interval '1 hour'
        )
        RETURNING id::text
      `,
      [reason],
    )
    await database.query(
      `
        INSERT INTO admin_user_ban_state (
          subject_user_id,
          established_action,
          ban_started_at,
          ban_expires_at,
          ban_reason,
          actor_user_id,
          established_by_event_id
        )
        SELECT
          subject_user_id,
          action,
          ban_started_at,
          expires_at,
          reason,
          actor_user_id,
          id
        FROM admin_user_ban_history
        WHERE id = $1
      `,
      [event.rows[0]!.id],
    )
  }

  beforeAll(setupTestServer)
  afterAll(async () => {
    await database.end()
    await teardownTestServer()
  })
  beforeEach(async () => {
    await cleanDatabase()
    await database.query(
      `
        INSERT INTO "user" (id, name, email, role)
        VALUES
          ('lxns-user', 'LXNS User', 'lxns-user@example.test', 'user'),
          ('moderator', 'Moderator', 'moderator@example.test', 'admin')
      `,
    )
  })

  it('consumes state and rejects a committed ban before contacting LXNS', async () => {
    await establishBan('Ban before callback')
    await database.query(
      `INSERT INTO lxns_oauth_states (state, user_id, created_at)
       VALUES ('pre-banned-state', 'lxns-user', clock_timestamp())`,
    )
    const request = vi.fn<typeof globalThis.fetch>()

    await expect(
      exchangeCodeForTokens('authorization-code', 'pre-banned-state', { ...dependencies, request }),
    ).rejects.toBeInstanceOf(PublicAccountBanned)
    expect(request).not.toHaveBeenCalled()
    await expect(
      database.query(`SELECT state FROM lxns_oauth_states WHERE state = 'pre-banned-state'`),
    ).resolves.toMatchObject({ rows: [] })
    await expect(
      database.query(`SELECT user_id FROM lxns_oauth_tokens WHERE user_id = 'lxns-user'`),
    ).resolves.toMatchObject({ rows: [] })
  })

  it('rechecks after the network exchange and never stores tokens when a ban wins that race', async () => {
    await database.query(
      `INSERT INTO lxns_oauth_states (state, user_id, created_at)
       VALUES ('racing-state', 'lxns-user', clock_timestamp())`,
    )
    let resolveRequest!: (response: Response) => void
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveRequest = resolve
    })
    const request = vi.fn<typeof globalThis.fetch>().mockImplementation(() => pendingResponse)

    const exchange = exchangeCodeForTokens('authorization-code', 'racing-state', { ...dependencies, request })
    const outcome = exchange.catch((error: unknown) => error)
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce())
    await establishBan('Ban during callback')
    resolveRequest(tokenResponse())

    const failure = await outcome
    expect(failure).toBeInstanceOf(PublicAccountBanned)
    expect(failure).not.toHaveProperty('reason')
    expect(failure).not.toHaveProperty('expiresAt')
    await expect(
      database.query(`SELECT user_id FROM lxns_oauth_tokens WHERE user_id = 'lxns-user'`),
    ).resolves.toMatchObject({ rows: [] })
  })

  it('stores tokens once and makes the consumed callback state non-replayable', async () => {
    await database.query(
      `INSERT INTO lxns_oauth_states (state, user_id, created_at)
       VALUES ('successful-state', 'lxns-user', clock_timestamp())`,
    )
    const request = vi.fn<typeof globalThis.fetch>().mockResolvedValue(tokenResponse())

    await expect(
      exchangeCodeForTokens('authorization-code', 'successful-state', { ...dependencies, request }),
    ).resolves.toBe('lxns-user')
    await expect(
      database.query(`SELECT access_token, refresh_token FROM lxns_oauth_tokens WHERE user_id = 'lxns-user'`),
    ).resolves.toMatchObject({
      rows: [{ access_token: 'access-token', refresh_token: 'refresh-token' }],
    })

    await expect(
      exchangeCodeForTokens('authorization-code', 'successful-state', { ...dependencies, request }),
    ).rejects.toThrow('Invalid or expired OAuth state')
    expect(request).toHaveBeenCalledOnce()
  })
})