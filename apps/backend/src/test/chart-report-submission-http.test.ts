import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const PUBLIC_ORIGIN = 'http://localhost:5173'
const PASSWORD = 'password123'
const SONG_ID = 'dsng_23456789ab'
const CHART_ID = 'dsht_abcdefghjk'
const ACTIVE_REVISION = '23'
const FINGERPRINT = 'a'.repeat(64)

// This non-secret fixture must be present before the backend is imported: the
// router constructs its verifier once, during module initialization.
process.env.TURNSTILE_SECRET_KEY = 'chart-report-http-test-secret'

type TestSetup = typeof import('./setup.js')

type TestUser = {
  readonly id: string
  readonly cookie: string
  readonly emailVerified: boolean
}

type SiteverifyAttempt = {
  readonly secret: string | null
  readonly token: string | null
}

let setup: TestSetup
let database: pg.Pool
let nativeFetch: typeof globalThis.fetch
const siteverifyAttempts: SiteverifyAttempt[] = []

const catalog = {
  schemaVersion: 1,
  updatedAt: '2026-08-24T12:00:00.000Z',
  categories: [{ category: 'maimai' }],
  versions: [{ version: 'PRiSM' }],
  types: [{ type: 'dx', name: 'DX' }],
  difficulties: [{ difficulty: 'master', name: 'Master' }],
  servers: [
    { id: 'jp', name: 'Japan' },
    { id: 'intl', name: 'International' },
  ],
  songs: [
    {
      id: SONG_ID,
      category: 'maimai',
      title: 'HTTP Fixture Song',
      artist: 'Fixture Artist',
      bpm: 180,
      imageName: 'fixture.png',
      version: 'PRiSM',
      isNew: false,
      isLocked: false,
      sheets: [
        {
          id: CHART_ID,
          type: 'dx',
          difficulty: 'master',
          level: '14+',
          internalLevelValue: 14.8,
          noteDesigner: 'Fixture Designer',
          noteCounts: {
            tap: 500,
            hold: 50,
            slide: 100,
            touch: 25,
            break: 10,
            total: 685,
          },
          serverIds: ['jp', 'intl'],
          isSpecial: false,
          version: 'PRiSM',
          internalId: 1234,
          releaseDate: '2026-08-01',
        },
      ],
      searchAcronyms: ['hfs'],
    },
  ],
  tagGroups: [],
  tags: [],
  tagSongs: [],
  aliases: [],
} as const

const siteverifyResponseFor = (token: string | null): Response => {
  if (token === 'unavailable-token') return new Response('temporarily unavailable', { status: 503 })
  if (token === 'reject-token') {
    return Response.json({
      success: false,
      'error-codes': ['invalid-input-response'],
    })
  }
  return Response.json({
    success: true,
    challenge_ts: new Date().toISOString(),
    hostname: 'localhost',
    action: 'chart-report',
  })
}

const installSiteverifyStub = (): void => {
  nativeFetch = globalThis.fetch
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString()
      if (url !== SITEVERIFY_URL) return nativeFetch(input, init)

      const body = new URLSearchParams(typeof init?.body === 'string' ? init.body : '')
      const attempt = {
        secret: body.get('secret'),
        token: body.get('response'),
      }
      siteverifyAttempts.push(attempt)
      return siteverifyResponseFor(attempt.token)
    }),
  )
}

const createCatalogFixture = async (): Promise<void> => {
  await database.query(`
    DROP SCHEMA IF EXISTS dxdata CASCADE;
    CREATE SCHEMA dxdata;

    CREATE TABLE dxdata.catalog_build_runs (
      id bigint PRIMARY KEY,
      status text NOT NULL,
      api_schema_version integer NOT NULL
    );
    CREATE TABLE dxdata.catalog_snapshots (
      catalog_run_id bigint PRIMARY KEY,
      api_schema_version integer NOT NULL,
      body_sha256 text NOT NULL,
      body_text text NOT NULL
    );
    CREATE TABLE dxdata.catalog_publications (
      channel text PRIMARY KEY,
      catalog_run_id bigint NOT NULL,
      revision bigint NOT NULL,
      publication_fingerprint_sha256 text NOT NULL
    );
    CREATE TABLE dxdata.catalog_publication_receipts (
      channel text NOT NULL,
      catalog_run_id bigint NOT NULL,
      revision bigint NOT NULL,
      publication_fingerprint_sha256 text NOT NULL,
      PRIMARY KEY (channel, catalog_run_id, revision, publication_fingerprint_sha256)
    );
  `)
  await database.query(
    `INSERT INTO dxdata.catalog_build_runs (id, status, api_schema_version) VALUES (71, 'published', 1)`,
  )
  await database.query(
    `
      INSERT INTO dxdata.catalog_snapshots (catalog_run_id, api_schema_version, body_sha256, body_text)
      VALUES (71, 1, $1, $2)
    `,
    [FINGERPRINT, JSON.stringify(catalog)],
  )
  await database.query(
    `
      INSERT INTO dxdata.catalog_publications
        (channel, catalog_run_id, revision, publication_fingerprint_sha256)
      VALUES ('production-v1', 71, $2, $1)
    `,
    [FINGERPRINT, ACTIVE_REVISION],
  )
  await database.query(
    `
      INSERT INTO dxdata.catalog_publication_receipts
        (channel, catalog_run_id, revision, publication_fingerprint_sha256)
      VALUES ('production-v1', 71, $2, $1)
    `,
    [FINGERPRINT, ACTIVE_REVISION],
  )
}

const expectStatus = async (response: Response, expected: number): Promise<Record<string, unknown>> => {
  const text = await response.text()
  expect(response.status, text).toBe(expected)
  return JSON.parse(text) as Record<string, unknown>
}

const createUser = async (localPart: string): Promise<TestUser> => {
  const email = `${localPart}@example.com`
  const response = await fetch(`${setup.getBaseUrl()}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: PUBLIC_ORIGIN,
      'x-captcha-response': `signup-${localPart}`,
    },
    body: JSON.stringify({ email, password: PASSWORD, name: localPart }),
  })
  await expectStatus(response, 200)
  const cookie = setup.extractSessionCookie(response)
  expect(cookie).toContain('dxrating.session_token=')

  const result = await database.query<{
    readonly email_verified: boolean
    readonly id: string
  }>(`SELECT id, email_verified FROM "user" WHERE email = $1`, [email])
  expect(result.rows).toHaveLength(1)
  return {
    id: result.rows[0]!.id,
    cookie,
    emailVerified: result.rows[0]!.email_verified,
  }
}

const convertToOauthOnlyAccount = async (userId: string): Promise<void> => {
  const result = await database.query(
    `
      UPDATE account
      SET provider_id = 'google',
          account_id = $2,
          password = NULL,
          updated_at = clock_timestamp()
      WHERE user_id = $1
    `,
    [userId, `google-${userId}`],
  )
  expect(result.rowCount).toBe(1)
}

const submission = (token: string, overrides: Record<string, unknown> = {}) => ({
  songId: SONG_ID,
  chartId: CHART_ID,
  fieldKey: 'chart.level',
  category: 'incorrect_value',
  publicationRevision: ACTIVE_REVISION,
  currentValue: '14+',
  proposedValue: '15',
  explanation: 'The current game release displays level 15.',
  sourceUrls: ['HTTPS://Example.COM:443/evidence/../chart'],
  turnstileToken: token,
  ...overrides,
})

const submit = (cookie: string, body: Record<string, unknown>): Promise<Response> =>
  fetch(`${setup.getBaseUrl()}/api/v1/chart-reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      Origin: PUBLIC_ORIGIN,
    },
    body: JSON.stringify(body),
  })

const countReportsFor = async (userId: string): Promise<number> => {
  const result = await database.query<{ readonly count: string }>(
    `SELECT count(*)::text AS count FROM chart_reports WHERE reporter_user_id = $1`,
    [userId],
  )
  return Number(result.rows[0]!.count)
}

const banUser = async (subjectUserId: string, actorUserId: string): Promise<void> => {
  const transaction = await database.connect()
  try {
    await transaction.query('BEGIN')
    const history = await transaction.query<{ readonly id: string }>(
      `
        INSERT INTO admin_user_ban_history (
          subject_user_id, actor_user_id, previous_event_id, action, reason,
          ban_started_at, expires_at
        )
        VALUES ($1, $2, NULL, 'ban', 'HTTP chart-report test ban', clock_timestamp(), NULL)
        RETURNING id::text
      `,
      [subjectUserId, actorUserId],
    )
    await transaction.query(
      `
        INSERT INTO admin_user_ban_state (
          subject_user_id, established_action, ban_started_at, ban_expires_at,
          ban_reason, actor_user_id, established_by_event_id
        )
        SELECT subject_user_id, action, ban_started_at, expires_at, reason, actor_user_id, id
        FROM admin_user_ban_history
        WHERE id = $1
      `,
      [history.rows[0]!.id],
    )
    await transaction.query('COMMIT')
  } catch (error) {
    await transaction.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    transaction.release()
  }
}

describe('public chart-report submission HTTP boundary', () => {
  beforeAll(async () => {
    installSiteverifyStub()
    setup = await import('./setup.js')
    await setup.setupTestServer()
    database = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  })

  afterAll(async () => {
    await database?.end()
    await setup?.teardownTestServer()
    vi.unstubAllGlobals()
  })

  beforeEach(async () => {
    siteverifyAttempts.length = 0
    await setup.cleanDatabase()
    await createCatalogFixture()
  })

  it('accepts unverified password and OAuth-backed sessions and persists server-authoritative reports', async () => {
    const passwordUser = await createUser('chart-report-password')
    expect(passwordUser.emailVerified).toBe(false)

    const passwordResponse = await submit(passwordUser.cookie, submission('password-report-token'))
    const passwordBody = await expectStatus(passwordResponse, 200)
    expect(passwordBody).toMatchObject({ state: 'open' })
    expect(passwordBody.id).toEqual(expect.any(String))
    expect(passwordBody.createdAt).toEqual(expect.any(String))

    const oauthUser = await createUser('chart-report-oauth')
    await convertToOauthOnlyAccount(oauthUser.id)
    const oauthResponse = await submit(
      oauthUser.cookie,
      submission('oauth-report-token', {
        fieldKey: 'chart.internal_level',
        currentValue: 14.8,
        proposedValue: 14.9,
      }),
    )
    await expectStatus(oauthResponse, 200)

    const stored = await database.query<{
      readonly current_value: unknown
      readonly publication_revision: string
      readonly reporter_user_id: string
      readonly source_urls: unknown
    }>(
      `
        SELECT reporter_user_id, publication_revision::text, current_value, source_urls
        FROM chart_reports
        ORDER BY created_at, id
      `,
    )
    expect(stored.rows).toHaveLength(2)
    expect(stored.rows.map((row) => row.reporter_user_id)).toEqual([passwordUser.id, oauthUser.id])
    expect(stored.rows[0]).toMatchObject({
      publication_revision: ACTIVE_REVISION,
      current_value: '14+',
      source_urls: ['https://example.com/chart'],
    })
    expect(JSON.stringify(stored.rows)).not.toContain('report-token')
    expect(siteverifyAttempts).toEqual(
      expect.arrayContaining([
        {
          secret: process.env.TURNSTILE_SECRET_KEY,
          token: 'password-report-token',
        },
        {
          secret: process.env.TURNSTILE_SECRET_KEY,
          token: 'oauth-report-token',
        },
      ]),
    )
  })

  it('denies a banned session before verification or rate limiting and inserts no report', async () => {
    const user = await createUser('chart-report-banned')
    const moderator = await createUser('chart-report-moderator')
    await banUser(user.id, moderator.id)
    siteverifyAttempts.length = 0

    const response = await submit(user.cookie, submission('banned-report-token'))
    const body = await expectStatus(response, 401)
    expect(body).toMatchObject({
      defined: true,
      code: 'UNAUTHORIZED',
      status: 401,
    })
    expect(body).not.toHaveProperty('reason')
    expect(await countReportsFor(user.id)).toBe(0)
    expect(siteverifyAttempts).toHaveLength(0)
    await expect(
      database.query(`SELECT user_id FROM chart_report_user_rate_limits WHERE user_id = $1`, [user.id]),
    ).resolves.toMatchObject({ rows: [] })
  })

  it('returns a typed stale-publication conflict without inserting', async () => {
    const user = await createUser('chart-report-stale')
    const response = await submit(user.cookie, submission('stale-report-token', { publicationRevision: '22' }))
    const body = await expectStatus(response, 409)
    expect(body).toMatchObject({
      defined: true,
      code: 'CHART_REPORT_STALE_PUBLICATION',
      status: 409,
      data: {
        songId: SONG_ID,
        chartId: CHART_ID,
        activePublicationRevision: ACTIVE_REVISION,
      },
    })
    expect(await countReportsFor(user.id)).toBe(0)

    const changedValue = await submit(user.cookie, submission('changed-value-token', { currentValue: '14' }))
    expect(await expectStatus(changedValue, 409)).toMatchObject({
      defined: true,
      code: 'CHART_REPORT_STALE_PUBLICATION',
      status: 409,
      data: {
        songId: SONG_ID,
        chartId: CHART_ID,
        activePublicationRevision: ACTIVE_REVISION,
      },
    })
    expect(await countReportsFor(user.id)).toBe(0)
  })

  it('rejects field-specific values and reserved source URLs without inserting', async () => {
    const user = await createUser('chart-report-invalid')

    const wrongValueType = await submit(user.cookie, submission('wrong-value-type-token', { proposedValue: 15 }))
    expect(await expectStatus(wrongValueType, 400)).toMatchObject({
      defined: true,
      code: 'CHART_REPORT_VALIDATION_FAILED',
      status: 400,
    })

    const reservedSource = await submit(
      user.cookie,
      submission('reserved-source-token', {
        sourceUrls: ['http://127.0.0.1/evidence'],
      }),
    )
    expect(await expectStatus(reservedSource, 400)).toMatchObject({
      defined: true,
      code: 'CHART_REPORT_VALIDATION_FAILED',
      status: 400,
    })
    expect(await countReportsFor(user.id)).toBe(0)
  })

  it('maps rejected and unavailable Turnstile results to typed public failures', async () => {
    const rejectedUser = await createUser('chart-report-rejected')
    const rejected = await submit(rejectedUser.cookie, submission('reject-token'))
    expect(await expectStatus(rejected, 400)).toMatchObject({
      defined: true,
      code: 'CHART_REPORT_TURNSTILE_FAILED',
      status: 400,
    })
    expect(await countReportsFor(rejectedUser.id)).toBe(0)

    const unavailableUser = await createUser('chart-report-unavailable')
    const unavailable = await submit(unavailableUser.cookie, submission('unavailable-token'))
    expect(await expectStatus(unavailable, 503)).toMatchObject({
      defined: true,
      code: 'CHART_REPORT_VERIFICATION_UNAVAILABLE',
      status: 503,
    })
    expect(await countReportsFor(unavailableUser.id)).toBe(0)
    expect(siteverifyAttempts.filter((attempt) => attempt.token === 'unavailable-token')).toHaveLength(2)
  })

  it('counts failed attempts and returns typed 429 with Retry-After before a sixth verification', async () => {
    const user = await createUser('chart-report-rate-limited')
    siteverifyAttempts.length = 0

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await submit(user.cookie, submission('reject-token'))
      await expectStatus(response, 400)
    }
    const limited = await submit(user.cookie, submission('should-not-be-verified'))
    const body = await expectStatus(limited, 429)
    expect(body).toMatchObject({
      defined: true,
      code: 'CHART_REPORT_RATE_LIMITED',
      status: 429,
      data: { retryAfterSeconds: expect.any(Number) },
    })
    const retryAfter = Number(limited.headers.get('Retry-After'))
    expect(Number.isInteger(retryAfter)).toBe(true)
    expect(retryAfter).toBeGreaterThan(0)
    expect(body.data).toMatchObject({ retryAfterSeconds: retryAfter })
    expect(limited.headers.get('Access-Control-Expose-Headers')).toContain('Retry-After')
    expect(siteverifyAttempts.filter((attempt) => attempt.token === 'reject-token')).toHaveLength(5)
    expect(siteverifyAttempts.some((attempt) => attempt.token === 'should-not-be-verified')).toBe(false)
    expect(await countReportsFor(user.id)).toBe(0)
  })

  it('publishes only submission in public OpenAPI and keeps management routes absent', async () => {
    const response = await fetch(`${setup.getBaseUrl()}/spec.json`)
    const specification = await expectStatus(response, 200)
    const paths = specification.paths as Record<string, Record<string, unknown>>

    expect(paths['/chart-reports']).toMatchObject({
      post: {
        operationId: 'createChartReport',
        tags: ['Chart Reports'],
        responses: {
          '200': expect.any(Object),
          '400': expect.any(Object),
          '409': expect.any(Object),
          '429': expect.any(Object),
          '503': expect.any(Object),
        },
      },
    })
    expect(Object.keys(paths).filter((path) => path.startsWith('/chart-reports'))).toEqual(['/chart-reports'])
    expect(paths['/chart-reports']).not.toHaveProperty('get')
    expect(JSON.stringify(paths['/chart-reports']!.post)).not.toContain('internalNote')
  })
})