import {
  ADMIN_CONTRACT_COMPATIBILITY_ID,
  ADMIN_CONTRACT_HEADER,
  type AdminContractOutputs,
} from '@gekichumai/admin-contract'
import pg, { type PoolClient } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEST_ADMIN_ACCESS_HEADERS } from './admin-access.js'
import { promoteFixtureUserToAdministrator } from './admin-role-fixtures.js'
import {
  cleanDatabase,
  extractSessionCookie,
  getBaseUrl,
  setupTestServer,
  signIn,
  signUp,
  teardownTestServer,
} from './setup.js'

const PASSWORD = 'password123'
const ADMIN_ORIGIN = 'http://localhost:5174'
const SUPER_ADMINISTRATOR_ID = 'test-allowlisted-super-admin-id'

const MAIN_SONG_ID = 'dsng_23456789ab'
const MAIN_CHART_ID = 'dsht_23456789ab'
const ALTERNATE_CHART_ID = 'dsht_23456789ac'
const RETIRED_SONG_ID = 'dsng_23456789ac'
const RETIRED_CHART_ID = 'dsht_23456789ad'

const REVISION_SIX = '6'
const REVISION_SEVEN = '7'
const ACTIVE_REVISION = '8'
const FINGERPRINT_SIX = '6'.repeat(64)
const FINGERPRINT_SEVEN = '7'.repeat(64)
const ACTIVE_FINGERPRINT = '8'.repeat(64)

const BASE_REPORT_ID = '10000000-0000-4000-8000-000000000010'
const DUPLICATE_REPORT_ID = '10000000-0000-4000-8000-000000000011'
const CLOSED_REPORT_ID = '10000000-0000-4000-8000-000000000012'
const ALTERNATE_CHART_REPORT_ID = '10000000-0000-4000-8000-000000000013'
const ALTERNATE_FIELD_REPORT_ID = '10000000-0000-4000-8000-000000000014'
const ALTERNATE_CATEGORY_REPORT_ID = '10000000-0000-4000-8000-000000000015'
const ALTERNATE_REPORTER_REPORT_ID = '10000000-0000-4000-8000-000000000016'
const BEFORE_RANGE_REPORT_ID = '10000000-0000-4000-8000-000000000017'
const AFTER_RANGE_REPORT_ID = '10000000-0000-4000-8000-000000000018'
const OLD_REVISION_REPORT_ID = '10000000-0000-4000-8000-000000000019'
const RETIRED_REPORT_ID = '10000000-0000-4000-8000-000000000020'
const CLOSE_WITHOUT_NOTE_REPORT_ID = '10000000-0000-4000-8000-000000000021'
const CLOSE_WITH_NOTE_REPORT_ID = '10000000-0000-4000-8000-000000000022'
const CONCURRENT_CLOSE_REPORT_ID = '10000000-0000-4000-8000-000000000023'
const MISSING_REPORT_ID = '10000000-0000-4000-8000-000000000099'

const EVIDENCE_URL = 'https://outbound-fetch-canary.example.test/chart/immutable'
const PRIVATE_REPORTER_EMAIL = 'private-chart-reporter-email@example.test'
const PRIVATE_ACCESS_TOKEN = 'PRIVATE_CHART_REPORT_ACCESS_TOKEN_CANARY'
const PRIVATE_REFRESH_TOKEN = 'PRIVATE_CHART_REPORT_REFRESH_TOKEN_CANARY'
const PRIVATE_IP_ADDRESS = '198.51.100.199'
const PRIVATE_QUEUE_EXPLANATION_SUFFIX = 'PRIVATE_QUEUE_EXPLANATION_SUFFIX_CANARY'
const PRIVATE_CLOSE_NOTE = 'PRIVATE_CLOSED_QUEUE_NOTE_CANARY'

type TestUser = {
  readonly id: string
  readonly email: string
  readonly cookie: string
}

type ReportFixture = {
  readonly id: string
  readonly reporterUserId: string
  readonly stableSongId?: string
  readonly stableChartId?: string
  readonly publicationCatalogRunId?: string
  readonly publicationRevision?: string
  readonly publicationFingerprintSha256?: string
  readonly fieldKey?: 'chart.level' | 'chart.internal_level'
  readonly category?: 'incorrect_value' | 'missing_value' | 'outdated_value' | 'other'
  readonly currentValue?: string | number
  readonly proposedValue?: string | number
  readonly explanation?: string
  readonly sourceUrls?: readonly string[]
  readonly state?: 'open' | 'closed'
  readonly createdAt: string
  readonly closedByUserId?: string
  readonly closedAt?: string
  readonly closeNote?: string | null
}

type ListOutput = AdminContractOutputs['listChartReports']
type DetailOutput = AdminContractOutputs['getChartReportDetail']
type CloseOutput = AdminContractOutputs['closeChartReport']

let database: pg.Pool | undefined
let nativeFetch: typeof globalThis.fetch | undefined
let evidenceFetchAttempts = 0

const db = (): pg.Pool => {
  if (!database) throw new Error('Administrator chart-report test database is not initialized')
  return database
}

const responseBody = async <Body>(response: Response): Promise<Body> => (await response.json()) as Body

const adminRequest = (path: string, cookie?: string, init: RequestInit = {}) =>
  fetch(`${getBaseUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...TEST_ADMIN_ACCESS_HEADERS,
      ...(cookie ? { Cookie: cookie } : {}),
      Origin: ADMIN_ORIGIN,
      [ADMIN_CONTRACT_HEADER]: ADMIN_CONTRACT_COMPATIBILITY_ID,
      ...init.headers,
    },
  })

const expectPrivateNoStoreHeaders = (response: Response): void => {
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(response.headers.get('CDN-Cache-Control')).toBe('no-store')
  expect(response.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store')
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
}

const expectTypedFailure = async (
  response: Response,
  status: number,
  code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'INVALID_CURSOR' | 'NOT_FOUND' | 'CONFLICT',
): Promise<void> => {
  const text = await response.text()
  expect(response.status, text).toBe(status)
  expect(JSON.parse(text)).toMatchObject({ defined: true, code, status })
  expectPrivateNoStoreHeaders(response)
}

const chart = ({
  id,
  difficulty,
  level,
  internalLevelValue,
}: {
  readonly id: string
  readonly difficulty: string
  readonly level: string
  readonly internalLevelValue: number
}) => ({
  id,
  type: 'dx',
  difficulty,
  level,
  internalLevelValue,
  noteDesigner: 'Captured Fixture Designer',
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
  internalId: 1_234,
  releaseDate: '2026-08-01',
})

const catalog = ({ active }: { readonly active: boolean }) => ({
  schemaVersion: 1,
  updatedAt: active ? '2026-08-24T12:00:00.000Z' : '2026-08-23T12:00:00.000Z',
  categories: [{ category: 'maimai' }],
  versions: [{ version: 'PRiSM' }],
  types: [{ type: 'dx', name: 'DX' }],
  difficulties: [
    { difficulty: 'master', name: 'Master' },
    { difficulty: 'expert', name: 'Expert' },
  ],
  servers: [
    { id: 'jp', name: 'Japan' },
    { id: 'intl', name: 'International' },
  ],
  songs: [
    {
      id: MAIN_SONG_ID,
      category: 'maimai',
      title: active ? 'Active Main Song' : 'Captured Main Song',
      artist: 'Fixture Artist',
      bpm: 180,
      imageName: 'fixture.png',
      version: 'PRiSM',
      isNew: false,
      isLocked: false,
      sheets: [
        chart({
          id: MAIN_CHART_ID,
          difficulty: 'master',
          level: active ? '15' : '14+',
          internalLevelValue: active ? 14.9 : 14.7,
        }),
        chart({
          id: ALTERNATE_CHART_ID,
          difficulty: 'expert',
          level: '13',
          internalLevelValue: 13,
        }),
      ],
      searchAcronyms: ['cms'],
    },
    ...(!active
      ? [
          {
            id: RETIRED_SONG_ID,
            category: 'maimai',
            title: 'Captured Retired Song',
            artist: 'Retired Fixture Artist',
            bpm: 160,
            imageName: 'retired.png',
            version: 'PRiSM',
            isNew: false,
            isLocked: false,
            sheets: [
              chart({
                id: RETIRED_CHART_ID,
                difficulty: 'expert',
                level: '12+',
                internalLevelValue: 12.8,
              }),
            ],
            searchAcronyms: ['crs'],
          },
        ]
      : []),
  ],
  tagGroups: [],
  tags: [],
  tagSongs: [],
  aliases: [],
})

const createCatalogFixture = async (): Promise<void> => {
  const capturedBody = JSON.stringify(catalog({ active: false }))
  const activeBody = JSON.stringify(catalog({ active: true }))

  await db().query(`
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
      published_at timestamptz NOT NULL,
      PRIMARY KEY (channel, catalog_run_id, revision, publication_fingerprint_sha256)
    );
  `)

  await db().query(
    `INSERT INTO dxdata.catalog_build_runs (id, status, api_schema_version)
     VALUES (106, 'published', 1), (107, 'published', 1), (108, 'published', 1)`,
  )
  await db().query(
    `INSERT INTO dxdata.catalog_snapshots
       (catalog_run_id, api_schema_version, body_sha256, body_text)
     VALUES
       (106, 1, $1, $4),
       (107, 1, $2, $4),
       (108, 1, $3, $5)`,
    [FINGERPRINT_SIX, FINGERPRINT_SEVEN, ACTIVE_FINGERPRINT, capturedBody, activeBody],
  )
  await db().query(
    `INSERT INTO dxdata.catalog_publication_receipts
       (channel, catalog_run_id, revision, publication_fingerprint_sha256, published_at)
     VALUES
       ('production-v1', 106, $1::bigint, $2, '2026-08-22 12:00:00.123456+00'),
       ('production-v1', 107, $3::bigint, $4, '2026-08-23 12:00:00.234567+00'),
       ('production-v1', 108, $5::bigint, $6, '2026-08-24 12:00:00.345678+00')`,
    [REVISION_SIX, FINGERPRINT_SIX, REVISION_SEVEN, FINGERPRINT_SEVEN, ACTIVE_REVISION, ACTIVE_FINGERPRINT],
  )
  await db().query(
    `INSERT INTO dxdata.catalog_publications
       (channel, catalog_run_id, revision, publication_fingerprint_sha256)
     VALUES ('production-v1', 108, $1::bigint, $2)`,
    [ACTIVE_REVISION, ACTIVE_FINGERPRINT],
  )
}

const createUser = async (email: string, name: string): Promise<TestUser> => {
  const response = await signUp(email, PASSWORD, name)
  const text = await response.clone().text()
  expect(response.status, text).toBe(200)
  const cookie = extractSessionCookie(response)
  expect(cookie).toContain('dxrating.session_token=')

  const user = await db().query<{ readonly id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email])
  expect(user.rows).toHaveLength(1)
  return { id: user.rows[0]!.id, email, cookie }
}

const promoteToAdministrator = async (userId: string): Promise<void> => {
  const transaction: PoolClient = await db().connect()
  try {
    await transaction.query('BEGIN')
    await expect(promoteFixtureUserToAdministrator(transaction, userId)).resolves.toMatchObject({
      previousRole: 'user',
      nextRole: 'admin',
    })
    await transaction.query('COMMIT')
  } catch (error) {
    await transaction.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    transaction.release()
  }
}

const createAdministrator = async (email: string, name = 'Chart Report Administrator'): Promise<TestUser> => {
  const candidate = await createUser(email, name)
  await promoteToAdministrator(candidate.id)
  const response = await signIn(email, PASSWORD)
  const text = await response.clone().text()
  expect(response.status, text).toBe(200)
  return { ...candidate, cookie: extractSessionCookie(response) }
}

const createSuperAdministrator = async (): Promise<TestUser> => {
  const email = 'chart-report-super-administrator@example.test'
  const candidate = await createUser(email, 'Chart Report Super Administrator')
  const transaction = await db().connect()
  try {
    await transaction.query('BEGIN')
    const original = await transaction.query<{
      readonly name: string
      readonly email_verified: boolean
      readonly image: string | null
      readonly created_at: Date
      readonly updated_at: Date
    }>(
      `SELECT name, email_verified, image, created_at, updated_at
       FROM "user"
       WHERE id = $1`,
      [candidate.id],
    )
    const row = original.rows[0]
    expect(row).toBeDefined()

    await transaction.query(`DELETE FROM session WHERE user_id = $1`, [candidate.id])
    await transaction.query(`UPDATE "user" SET email = $1 WHERE id = $2`, [
      `replaced-${candidate.id}@example.invalid`,
      candidate.id,
    ])
    await transaction.query(
      `INSERT INTO "user" (id, name, email, email_verified, role, image, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'user', $5, $6, $7)`,
      [SUPER_ADMINISTRATOR_ID, row!.name, email, row!.email_verified, row!.image, row!.created_at, row!.updated_at],
    )
    await transaction.query(`UPDATE account SET user_id = $1 WHERE user_id = $2`, [
      SUPER_ADMINISTRATOR_ID,
      candidate.id,
    ])
    await transaction.query(`DELETE FROM "user" WHERE id = $1`, [candidate.id])
    await transaction.query('COMMIT')
  } catch (error) {
    await transaction.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    transaction.release()
  }

  const response = await signIn(email, PASSWORD)
  const text = await response.clone().text()
  expect(response.status, text).toBe(200)
  return { id: SUPER_ADMINISTRATOR_ID, email, cookie: extractSessionCookie(response) }
}

const establishPrivateReporterState = async (reporter: TestUser): Promise<void> => {
  await db().query(
    `INSERT INTO profiles (id, display_name)
     VALUES ($1, '  Unverified Chart Reporter  ')`,
    [reporter.id],
  )
  await db().query(`UPDATE account SET access_token = $1, refresh_token = $2 WHERE user_id = $3`, [
    PRIVATE_ACCESS_TOKEN,
    PRIVATE_REFRESH_TOKEN,
    reporter.id,
  ])
  await db().query(`UPDATE session SET ip_address = $1 WHERE user_id = $2`, [PRIVATE_IP_ADDRESS, reporter.id])
}

const insertReportFixtures = async (fixtures: readonly ReportFixture[]): Promise<void> => {
  // Deterministic queue boundaries require historical fixture timestamps and
  // pre-closed rows. The production trigger is restored before every request.
  await db().query(`ALTER TABLE chart_reports DISABLE TRIGGER chart_reports_guard`)
  try {
    for (const fixture of fixtures) {
      const fieldKey = fixture.fieldKey ?? 'chart.level'
      const currentValue = fixture.currentValue ?? '14+'
      const proposedValue = fixture.proposedValue ?? '15'
      const state = fixture.state ?? 'open'
      await db().query(
        `INSERT INTO chart_reports (
           id, reporter_user_id, stable_song_id, stable_chart_id,
           publication_channel, publication_catalog_run_id, publication_revision,
           publication_fingerprint_sha256, target_field_key, category,
           current_value, proposed_value, explanation, source_urls,
           state, created_at, closed_by_user_id, closed_at, close_note
         ) VALUES (
           $1::uuid, $2, $3, $4,
           'production-v1', $5::bigint, $6::bigint,
           $7, $8, $9,
           $10::jsonb, $11::jsonb, $12, $13::text[],
           $14, $15::timestamptz, $16, $17::timestamptz, $18
         )`,
        [
          fixture.id,
          fixture.reporterUserId,
          fixture.stableSongId ?? MAIN_SONG_ID,
          fixture.stableChartId ?? MAIN_CHART_ID,
          fixture.publicationCatalogRunId ?? '107',
          fixture.publicationRevision ?? REVISION_SEVEN,
          fixture.publicationFingerprintSha256 ?? FINGERPRINT_SEVEN,
          fieldKey,
          fixture.category ?? 'incorrect_value',
          JSON.stringify(currentValue),
          JSON.stringify(proposedValue),
          fixture.explanation ?? 'The captured chart value should be updated using the cited evidence.',
          fixture.sourceUrls ?? [EVIDENCE_URL],
          state,
          fixture.createdAt,
          state === 'closed' ? fixture.closedByUserId : null,
          state === 'closed' ? fixture.closedAt : null,
          state === 'closed' ? (fixture.closeNote ?? null) : null,
        ],
      )
    }
  } finally {
    await db().query(`ALTER TABLE chart_reports ENABLE TRIGGER chart_reports_guard`)
  }
}

const queueFixtures = (
  reporter: TestUser,
  otherReporter: TestUser,
  administrator: TestUser,
): readonly ReportFixture[] => {
  const baseExplanation = `Queue preview ${'x'.repeat(300)}${PRIVATE_QUEUE_EXPLANATION_SUFFIX}`
  return [
    {
      id: BASE_REPORT_ID,
      reporterUserId: reporter.id,
      createdAt: '2026-08-24T10:00:00.500Z',
      explanation: baseExplanation,
    },
    {
      id: DUPLICATE_REPORT_ID,
      reporterUserId: reporter.id,
      createdAt: '2026-08-24T10:00:00.500Z',
      explanation: baseExplanation,
    },
    {
      id: CLOSED_REPORT_ID,
      reporterUserId: reporter.id,
      state: 'closed',
      createdAt: '2026-08-24T10:00:00.900Z',
      closedByUserId: administrator.id,
      closedAt: '2026-08-24T10:01:00.000Z',
      closeNote: PRIVATE_CLOSE_NOTE,
    },
    {
      id: ALTERNATE_CHART_REPORT_ID,
      reporterUserId: reporter.id,
      stableChartId: ALTERNATE_CHART_ID,
      currentValue: '13',
      proposedValue: '13+',
      createdAt: '2026-08-24T10:00:00.800Z',
    },
    {
      id: ALTERNATE_FIELD_REPORT_ID,
      reporterUserId: reporter.id,
      fieldKey: 'chart.internal_level',
      currentValue: 14.7,
      proposedValue: 14.8,
      createdAt: '2026-08-24T10:00:00.700Z',
    },
    {
      id: ALTERNATE_CATEGORY_REPORT_ID,
      reporterUserId: reporter.id,
      category: 'other',
      createdAt: '2026-08-24T10:00:00.600Z',
    },
    {
      id: ALTERNATE_REPORTER_REPORT_ID,
      reporterUserId: otherReporter.id,
      createdAt: '2026-08-24T10:00:00.400Z',
    },
    {
      id: BEFORE_RANGE_REPORT_ID,
      reporterUserId: reporter.id,
      createdAt: '2026-08-24T09:59:59.999Z',
    },
    {
      id: AFTER_RANGE_REPORT_ID,
      reporterUserId: reporter.id,
      createdAt: '2026-08-24T10:00:01.000Z',
    },
    {
      id: OLD_REVISION_REPORT_ID,
      reporterUserId: reporter.id,
      publicationCatalogRunId: '106',
      publicationRevision: REVISION_SIX,
      publicationFingerprintSha256: FINGERPRINT_SIX,
      createdAt: '2026-08-24T10:00:00.300Z',
    },
  ]
}

const closeReport = (administrator: TestUser, reportId: string, body: Record<string, unknown>) =>
  adminRequest(`/api/admin/chart-reports/${reportId}/close`, administrator.cookie, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('administrator chart-report review HTTP boundary', () => {
  beforeAll(async () => {
    await setupTestServer()
    database = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    nativeFetch = globalThis.fetch.bind(globalThis)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : input.toString()
        if (url === EVIDENCE_URL) {
          evidenceFetchAttempts += 1
          throw new Error('The chart-report review boundary attempted to fetch stored evidence')
        }
        return nativeFetch!(input, init)
      }),
    )
  })

  afterAll(async () => {
    try {
      await database?.query(`DROP SCHEMA IF EXISTS dxdata CASCADE`)
    } finally {
      await database?.end().catch(() => undefined)
      await teardownTestServer()
      vi.unstubAllGlobals()
    }
  })

  beforeEach(async () => {
    evidenceFetchAttempts = 0
    await cleanDatabase()
    await createCatalogFixture()
  })

  it('admits administrators and super administrators, rejects other callers, and traverses the open-first keyset', async () => {
    const administrator = await createAdministrator('chart-report-page-admin@example.test')
    const superAdministrator = await createSuperAdministrator()
    const ordinaryUser = await createUser('chart-report-page-user@example.test', 'Chart Report Page User')
    const reporter = await createUser(PRIVATE_REPORTER_EMAIL, 'Reporter Fallback Name')
    const otherReporter = await createUser('chart-report-other-reporter@example.test', 'Other Reporter')
    await establishPrivateReporterState(reporter)
    await insertReportFixtures(queueFixtures(reporter, otherReporter, administrator))

    await expectTypedFailure(await adminRequest('/api/admin/chart-reports?limit=3'), 401, 'UNAUTHENTICATED')
    await expectTypedFailure(
      await adminRequest('/api/admin/chart-reports?limit=3', ordinaryUser.cookie),
      403,
      'FORBIDDEN',
    )

    const expectedOrder = [
      AFTER_RANGE_REPORT_ID,
      ALTERNATE_CHART_REPORT_ID,
      ALTERNATE_FIELD_REPORT_ID,
      ALTERNATE_CATEGORY_REPORT_ID,
      DUPLICATE_REPORT_ID,
      BASE_REPORT_ID,
      ALTERNATE_REPORTER_REPORT_ID,
      OLD_REVISION_REPORT_ID,
      BEFORE_RANGE_REPORT_ID,
      CLOSED_REPORT_ID,
    ]
    const traversed: string[] = []
    const serializedPages: string[] = []
    let closedReturnedReport = false
    let cursor: string | null = null
    do {
      const query = new URLSearchParams({ limit: '3' })
      if (cursor) query.set('cursor', cursor)
      const response = await adminRequest(`/api/admin/chart-reports?${query}`, administrator.cookie)
      const text = await response.clone().text()
      expect(response.status, text).toBe(200)
      expectPrivateNoStoreHeaders(response)
      serializedPages.push(text)
      const page = await responseBody<ListOutput>(response)
      traversed.push(...page.items.map(({ id }) => id))
      cursor = page.nextCursor
      if (cursor) {
        expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
        expect(cursor).not.toContain('{')
        expect(cursor).not.toContain('2026-08-24')
      }
      if (!closedReturnedReport) {
        expect(page.items.map(({ id }) => id)).toContain(AFTER_RANGE_REPORT_ID)
        const closeResponse = await closeReport(administrator, AFTER_RANGE_REPORT_ID, { expectedState: 'open' })
        expect(closeResponse.status).toBe(200)
        closedReturnedReport = true
      }
    } while (cursor)

    expect(traversed).toEqual(expectedOrder)
    expect(new Set(traversed).size).toBe(traversed.length)
    const serializedQueue = serializedPages.join('\n')
    for (const privateValue of [
      EVIDENCE_URL,
      PRIVATE_QUEUE_EXPLANATION_SUFFIX,
      PRIVATE_CLOSE_NOTE,
      PRIVATE_REPORTER_EMAIL,
      PRIVATE_ACCESS_TOKEN,
      PRIVATE_REFRESH_TOKEN,
      PRIVATE_IP_ADDRESS,
    ]) {
      expect(serializedQueue).not.toContain(privateValue)
    }

    const superResponse = await adminRequest('/api/admin/chart-reports?limit=2', superAdministrator.cookie)
    const superText = await superResponse.clone().text()
    expect(superResponse.status, superText).toBe(200)
    expect((await responseBody<ListOutput>(superResponse)).items.map(({ id }) => id)).toEqual([
      ALTERNATE_CHART_REPORT_ID,
      ALTERNATE_FIELD_REPORT_ID,
    ])

    const cursorResponse = await adminRequest('/api/admin/chart-reports?state=open&limit=1', administrator.cookie)
    const filterBoundCursor = (await responseBody<ListOutput>(cursorResponse)).nextCursor
    expect(filterBoundCursor).not.toBeNull()
    await expectTypedFailure(
      await adminRequest(
        `/api/admin/chart-reports?state=closed&limit=1&cursor=${encodeURIComponent(filterBoundCursor!)}`,
        administrator.cookie,
      ),
      400,
      'INVALID_CURSOR',
    )
    await expectTypedFailure(
      await adminRequest('/api/admin/chart-reports?cursor=not-json', administrator.cookie),
      400,
      'INVALID_CURSOR',
    )
  })

  it('applies every queue filter alone and in combination while keeping duplicate submissions independent', async () => {
    const administrator = await createAdministrator('chart-report-filter-admin@example.test')
    const reporter = await createUser(PRIVATE_REPORTER_EMAIL, 'Reporter Fallback Name')
    const otherReporter = await createUser('chart-report-filter-other@example.test', 'Filter Other Reporter')
    await establishPrivateReporterState(reporter)
    await insertReportFixtures(queueFixtures(reporter, otherReporter, administrator))

    const cases: readonly {
      readonly query: Record<string, string>
      readonly excludedId: string
      readonly assertItem: (item: ListOutput['items'][number]) => void
    }[] = [
      {
        query: { state: 'open' },
        excludedId: CLOSED_REPORT_ID,
        assertItem: (item) => expect(item.state).toBe('open'),
      },
      {
        query: { chartId: MAIN_CHART_ID },
        excludedId: ALTERNATE_CHART_REPORT_ID,
        assertItem: (item) => expect(item.chart.chartId).toBe(MAIN_CHART_ID),
      },
      {
        query: { fieldKey: 'chart.level' },
        excludedId: ALTERNATE_FIELD_REPORT_ID,
        assertItem: (item) => expect(item.fieldKey).toBe('chart.level'),
      },
      {
        query: { category: 'incorrect_value' },
        excludedId: ALTERNATE_CATEGORY_REPORT_ID,
        assertItem: (item) => expect(item.category).toBe('incorrect_value'),
      },
      {
        query: { reporterUserId: reporter.id },
        excludedId: ALTERNATE_REPORTER_REPORT_ID,
        assertItem: (item) => expect(item.reporter.userId).toBe(reporter.id),
      },
      {
        query: { submittedAtFromInclusive: '2026-08-24T10:00:00Z' },
        excludedId: BEFORE_RANGE_REPORT_ID,
        assertItem: (item) =>
          expect(Date.parse(item.createdAt)).toBeGreaterThanOrEqual(Date.parse('2026-08-24T10:00:00Z')),
      },
      {
        query: { submittedAtBeforeExclusive: '2026-08-24T10:00:01Z' },
        excludedId: AFTER_RANGE_REPORT_ID,
        assertItem: (item) => expect(Date.parse(item.createdAt)).toBeLessThan(Date.parse('2026-08-24T10:00:01Z')),
      },
      {
        query: { publicationRevision: REVISION_SEVEN },
        excludedId: OLD_REVISION_REPORT_ID,
        assertItem: (item) => expect(item.capturedPublication.revision).toBe(REVISION_SEVEN),
      },
    ]

    for (const fixture of cases) {
      const query = new URLSearchParams({ ...fixture.query, limit: '100' })
      const response = await adminRequest(`/api/admin/chart-reports?${query}`, administrator.cookie)
      const text = await response.clone().text()
      expect(response.status, text).toBe(200)
      const output = await responseBody<ListOutput>(response)
      expect(output.items.length).toBeGreaterThan(0)
      expect(output.items.map(({ id }) => id)).not.toContain(fixture.excludedId)
      output.items.forEach(fixture.assertItem)
    }

    const combinedQuery = new URLSearchParams({
      state: 'open',
      chartId: MAIN_CHART_ID,
      fieldKey: 'chart.level',
      category: 'incorrect_value',
      reporterUserId: reporter.id,
      submittedAtFromInclusive: '2026-08-24T10:00:00.500Z',
      submittedAtBeforeExclusive: '2026-08-24T10:00:00.501Z',
      publicationRevision: REVISION_SEVEN,
      limit: '100',
    })
    const combinedResponse = await adminRequest(`/api/admin/chart-reports?${combinedQuery}`, administrator.cookie)
    const combinedText = await combinedResponse.clone().text()
    expect(combinedResponse.status, combinedText).toBe(200)
    const combined = await responseBody<ListOutput>(combinedResponse)
    expect(combined.items.map(({ id }) => id)).toEqual([DUPLICATE_REPORT_ID, BASE_REPORT_ID])
    expect(combined.nextCursor).toBeNull()
    expect(combined.normalizedFilters).toEqual({
      state: 'open',
      chartId: MAIN_CHART_ID,
      fieldKey: 'chart.level',
      category: 'incorrect_value',
      reporterUserId: reporter.id,
      submittedAtFromInclusive: '2026-08-24T10:00:00.500Z',
      submittedAtBeforeExclusive: '2026-08-24T10:00:00.501Z',
      publicationRevision: REVISION_SEVEN,
    })

    expect(combined.items[0]).toMatchObject({
      reporter: {
        userId: reporter.id,
        displayName: 'Unverified Chart Reporter',
        emailVerified: false,
        effectiveRole: 'user',
        accountStatus: { status: 'active' },
      },
      chart: {
        songId: MAIN_SONG_ID,
        chartId: MAIN_CHART_ID,
        songLabel: 'Captured Main Song',
        chartLabel: 'master (dx)',
      },
      capturedPublication: {
        channel: 'production-v1',
        catalogRunId: '107',
        revision: REVISION_SEVEN,
        fingerprintSha256: FINGERPRINT_SEVEN,
      },
    })
    expect(combined.items[0]!.currentValuePreview).toEqual({ text: '"14+"', truncated: false })
    expect(combined.items[0]!.explanationPreviewTruncated).toBe(true)

    for (const secret of [
      EVIDENCE_URL,
      PRIVATE_QUEUE_EXPLANATION_SUFFIX,
      PRIVATE_CLOSE_NOTE,
      PRIVATE_REPORTER_EMAIL,
      PRIVATE_ACCESS_TOKEN,
      PRIVATE_REFRESH_TOKEN,
      PRIVATE_IP_ADDRESS,
    ]) {
      expect(combinedText).not.toContain(secret)
    }
  })

  it('returns immutable captured evidence, active drift, and a retired comparison without fetching source URLs', async () => {
    const administrator = await createAdministrator('chart-report-detail-admin@example.test')
    const superAdministrator = await createSuperAdministrator()
    const reporter = await createUser(PRIVATE_REPORTER_EMAIL, 'Reporter Fallback Name')
    await establishPrivateReporterState(reporter)
    const fullExplanation = `The captured level was 14+, while the cited release now shows 15. ${PRIVATE_QUEUE_EXPLANATION_SUFFIX}`
    await insertReportFixtures([
      {
        id: BASE_REPORT_ID,
        reporterUserId: reporter.id,
        createdAt: '2026-08-24T10:00:00.500Z',
        explanation: fullExplanation,
      },
      {
        id: RETIRED_REPORT_ID,
        reporterUserId: reporter.id,
        stableSongId: RETIRED_SONG_ID,
        stableChartId: RETIRED_CHART_ID,
        currentValue: '12+',
        proposedValue: '13',
        createdAt: '2026-08-24T10:00:00.400Z',
      },
    ])

    const queueResponse = await adminRequest('/api/admin/chart-reports?limit=10', administrator.cookie)
    const queueText = await queueResponse.clone().text()
    expect(queueResponse.status, queueText).toBe(200)
    expect(queueText).not.toContain(EVIDENCE_URL)

    const driftResponse = await adminRequest(`/api/admin/chart-reports/${BASE_REPORT_ID}`, administrator.cookie)
    const driftText = await driftResponse.clone().text()
    expect(driftResponse.status, driftText).toBe(200)
    expectPrivateNoStoreHeaders(driftResponse)
    const drift = await responseBody<DetailOutput>(driftResponse)
    expect(drift).toMatchObject({
      reporter: {
        userId: reporter.id,
        displayName: 'Unverified Chart Reporter',
        emailVerified: false,
        effectiveRole: 'user',
        accountStatus: { status: 'active' },
      },
      report: {
        id: BASE_REPORT_ID,
        state: 'open',
        fieldKey: 'chart.level',
        category: 'incorrect_value',
        submittedCurrentValue: '14+',
        submittedProposedValue: '15',
        explanation: fullExplanation,
        sourceUrls: [EVIDENCE_URL],
        capturedContext: {
          publication: { catalogRunId: '107', revision: REVISION_SEVEN },
          chart: {
            songId: MAIN_SONG_ID,
            chartId: MAIN_CHART_ID,
            songLabel: 'Captured Main Song',
            chartLabel: 'master (dx)',
          },
        },
        closure: null,
      },
      currentContext: {
        availability: 'current',
        publication: {
          catalogRunId: '108',
          revision: ACTIVE_REVISION,
          fingerprintSha256: ACTIVE_FINGERPRINT,
        },
        chart: {
          songId: MAIN_SONG_ID,
          chartId: MAIN_CHART_ID,
          songLabel: 'Captured Main Song',
        },
        currentValue: '15',
      },
    })
    expect(Object.keys(drift.report).sort()).toEqual(
      [
        'capturedContext',
        'category',
        'closure',
        'createdAt',
        'explanation',
        'fieldKey',
        'id',
        'sourceUrls',
        'state',
        'submittedCurrentValue',
        'submittedProposedValue',
      ].sort(),
    )
    expect(Object.keys(drift.reporter).sort()).toEqual(
      ['accountStatus', 'displayName', 'effectiveRole', 'emailVerified', 'userId'].sort(),
    )
    for (const secret of [PRIVATE_REPORTER_EMAIL, PRIVATE_ACCESS_TOKEN, PRIVATE_REFRESH_TOKEN, PRIVATE_IP_ADDRESS]) {
      expect(driftText).not.toContain(secret)
    }

    const retiredResponse = await adminRequest(
      `/api/admin/chart-reports/${RETIRED_REPORT_ID}`,
      superAdministrator.cookie,
    )
    const retiredText = await retiredResponse.clone().text()
    expect(retiredResponse.status, retiredText).toBe(200)
    const retired = await responseBody<DetailOutput>(retiredResponse)
    expect(retired).toMatchObject({
      report: {
        capturedContext: {
          chart: {
            songId: RETIRED_SONG_ID,
            chartId: RETIRED_CHART_ID,
            songLabel: 'Captured Retired Song',
          },
        },
      },
      currentContext: {
        availability: 'retired',
        publication: { catalogRunId: '108', revision: ACTIVE_REVISION },
        songId: RETIRED_SONG_ID,
        chartId: RETIRED_CHART_ID,
      },
    })
    expect(evidenceFetchAttempts).toBe(0)

    await expectTypedFailure(
      await adminRequest(`/api/admin/chart-reports/${MISSING_REPORT_ID}`, administrator.cookie),
      404,
      'NOT_FOUND',
    )

    for (const { path, method } of [
      { path: `/api/admin/chart-reports/${BASE_REPORT_ID}/reopen`, method: 'POST' },
      { path: `/api/admin/chart-reports/${BASE_REPORT_ID}`, method: 'DELETE' },
      { path: `/api/admin/chart-reports/${BASE_REPORT_ID}/assign`, method: 'POST' },
      { path: '/api/admin/chart-reports/bulk-close', method: 'POST' },
    ]) {
      const response = await adminRequest(path, administrator.cookie, { method })
      expect([404, 405]).toContain(response.status)
    }
  })

  it('closes with an optional note, treats an exact retry deterministically, and never overwrites the winner', async () => {
    const administrator = await createAdministrator('chart-report-close-admin@example.test')
    const superAdministrator = await createSuperAdministrator()
    const ordinaryUser = await createUser('chart-report-close-user@example.test', 'Chart Report Close User')
    const reporter = await createUser(PRIVATE_REPORTER_EMAIL, 'Reporter Fallback Name')
    await insertReportFixtures([
      {
        id: CLOSE_WITHOUT_NOTE_REPORT_ID,
        reporterUserId: reporter.id,
        createdAt: '2026-08-24T10:00:00.100Z',
      },
      {
        id: CLOSE_WITH_NOTE_REPORT_ID,
        reporterUserId: reporter.id,
        createdAt: '2026-08-24T10:00:00.200Z',
      },
    ])

    await expectTypedFailure(
      await adminRequest(`/api/admin/chart-reports/${CLOSE_WITHOUT_NOTE_REPORT_ID}/close`, undefined, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedState: 'open' }),
      }),
      401,
      'UNAUTHENTICATED',
    )
    await expectTypedFailure(
      await closeReport(ordinaryUser, CLOSE_WITHOUT_NOTE_REPORT_ID, { expectedState: 'open' }),
      403,
      'FORBIDDEN',
    )

    const firstResponse = await closeReport(administrator, CLOSE_WITHOUT_NOTE_REPORT_ID, {
      expectedState: 'open',
    })
    const firstText = await firstResponse.clone().text()
    expect(firstResponse.status, firstText).toBe(200)
    expectPrivateNoStoreHeaders(firstResponse)
    const first = await responseBody<CloseOutput>(firstResponse)
    expect(first).toMatchObject({
      id: CLOSE_WITHOUT_NOTE_REPORT_ID,
      state: 'closed',
      closure: { actorUserId: administrator.id, internalNote: null },
    })
    expect(first.closure.closedAt).toEqual(expect.any(String))

    const exactRetryResponse = await closeReport(administrator, CLOSE_WITHOUT_NOTE_REPORT_ID, {
      expectedState: 'open',
    })
    expect(exactRetryResponse.status).toBe(200)
    expect(await responseBody<CloseOutput>(exactRetryResponse)).toEqual(first)

    await expectTypedFailure(
      await closeReport(superAdministrator, CLOSE_WITHOUT_NOTE_REPORT_ID, {
        expectedState: 'open',
        internalNote: 'Attempted overwrite',
      }),
      409,
      'CONFLICT',
    )

    const persistedWinner = await db().query<{
      readonly state: string
      readonly closed_by_user_id: string
      readonly closed_at: Date
      readonly close_note: string | null
    }>(
      `SELECT state, closed_by_user_id, closed_at, close_note
       FROM chart_reports
       WHERE id = $1::uuid`,
      [CLOSE_WITHOUT_NOTE_REPORT_ID],
    )
    expect(persistedWinner.rows).toMatchObject([
      {
        state: 'closed',
        closed_by_user_id: administrator.id,
        close_note: null,
      },
    ])
    expect(persistedWinner.rows[0]!.closed_at.toISOString()).toBe(first.closure.closedAt)

    const notedResponse = await closeReport(superAdministrator, CLOSE_WITH_NOTE_REPORT_ID, {
      expectedState: 'open',
      internalNote: '  Reviewed by super administrator.  ',
    })
    const notedText = await notedResponse.clone().text()
    expect(notedResponse.status, notedText).toBe(200)
    expect(await responseBody<CloseOutput>(notedResponse)).toMatchObject({
      id: CLOSE_WITH_NOTE_REPORT_ID,
      state: 'closed',
      closure: {
        actorUserId: SUPER_ADMINISTRATOR_ID,
        internalNote: 'Reviewed by super administrator.',
      },
    })

    await expectTypedFailure(
      await closeReport(administrator, MISSING_REPORT_ID, { expectedState: 'open' }),
      404,
      'NOT_FOUND',
    )
  })

  it('allows exactly one competing concurrent close and preserves the database winner', async () => {
    const administrator = await createAdministrator('chart-report-race-admin@example.test')
    const superAdministrator = await createSuperAdministrator()
    const reporter = await createUser(PRIVATE_REPORTER_EMAIL, 'Reporter Fallback Name')
    await insertReportFixtures([
      {
        id: CONCURRENT_CLOSE_REPORT_ID,
        reporterUserId: reporter.id,
        createdAt: '2026-08-24T10:00:00.300Z',
      },
    ])

    const attempts = await Promise.all([
      closeReport(administrator, CONCURRENT_CLOSE_REPORT_ID, {
        expectedState: 'open',
        internalNote: 'Administrator won the race.',
      }),
      closeReport(superAdministrator, CONCURRENT_CLOSE_REPORT_ID, {
        expectedState: 'open',
        internalNote: 'Super administrator won the race.',
      }),
    ])
    expect(attempts.map(({ status }) => status).sort()).toEqual([200, 409])

    const successfulResponse = attempts.find(({ status }) => status === 200)!
    const conflictResponse = attempts.find(({ status }) => status === 409)!
    const winner = await responseBody<CloseOutput>(successfulResponse)
    await expectTypedFailure(conflictResponse, 409, 'CONFLICT')

    const persisted = await db().query<{
      readonly state: string
      readonly closed_by_user_id: string
      readonly closed_at: Date
      readonly close_note: string
    }>(
      `SELECT state, closed_by_user_id, closed_at, close_note
       FROM chart_reports
       WHERE id = $1::uuid`,
      [CONCURRENT_CLOSE_REPORT_ID],
    )
    expect(persisted.rows).toEqual([
      {
        state: 'closed',
        closed_by_user_id: winner.closure.actorUserId,
        closed_at: new Date(winner.closure.closedAt),
        close_note: winner.closure.internalNote,
      },
    ])

    const detailResponse = await adminRequest(
      `/api/admin/chart-reports/${CONCURRENT_CLOSE_REPORT_ID}`,
      administrator.cookie,
    )
    const detailText = await detailResponse.clone().text()
    expect(detailResponse.status, detailText).toBe(200)
    const persistedDetailClosure = (await responseBody<DetailOutput>(detailResponse)).report.closure
    expect(persistedDetailClosure).toMatchObject({
      actorUserId: winner.closure.actorUserId,
      internalNote: winner.closure.internalNote,
    })
    expect(new Date(persistedDetailClosure!.closedAt).getTime()).toBe(new Date(winner.closure.closedAt).getTime())
  })
})