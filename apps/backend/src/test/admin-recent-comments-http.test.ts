import {
  ADMIN_CONTRACT_COMPATIBILITY_ID,
  ADMIN_CONTRACT_HEADER,
  ADMIN_DELETED_COMMENT_PREVIEW,
  type AdminContractOutputs,
} from '@gekichumai/admin-contract'
import pg, { type PoolClient } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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

const CURRENT_SONG_ID = 'dsng_23456789ab'
const CURRENT_CHART_ID = 'dsht_23456789ab'
const CURRENT_LEGACY_SONG_ID = 'current-legacy-song'
const HISTORICAL_SONG_ID = 'dsng_23456789ac'
const HISTORICAL_CHART_ID = 'dsht_23456789ac'
const HISTORICAL_LEGACY_SONG_ID = 'retired-legacy-song'
const HISTORICAL_OLD_LEGACY_SONG_ID = 'retired-legacy-song-old'
const MISSING_CHART_ID = 'dsht_23456789ad'
const UNRESOLVED_LEGACY_SONG_ID = 'unresolved-private-legacy-song'
const UNAVAILABLE_SCHEMA = 'dxdata_admin_recent_comments_unavailable'

const PRIVATE_BODY = 'PRIVATE_DELETED_COMMENT_BODY_CANARY'
const PRIVATE_DELETION_REASON = 'PRIVATE_DELETION_REASON_CANARY'
const PRIVATE_BAN_REASON = 'PRIVATE_BAN_REASON_CANARY'
const PRIVATE_ACCESS_TOKEN = 'PRIVATE_ACCESS_TOKEN_CANARY'
const PRIVATE_REFRESH_TOKEN = 'PRIVATE_REFRESH_TOKEN_CANARY'
const PRIVATE_IP_ADDRESS = '198.51.100.247'

type TestUser = {
  readonly id: string
  readonly email: string
  readonly cookie: string
}

type ChartReference = {
  readonly songId: string
  readonly sheetType: string
  readonly sheetDifficulty: string
}

type CommentFixture = {
  readonly id: string
  readonly parentId: string | null
  readonly body: string
}

type FeedOutput = AdminContractOutputs['listRecentComments']
type DetailOutput = AdminContractOutputs['getCommentModerationDetail']
type CommentDeletionOutput = AdminContractOutputs['deleteComment']
type CommentRestorationOutput = AdminContractOutputs['restoreComment']
type BanOutput = AdminContractOutputs['banUser']
type UnbanOutput = AdminContractOutputs['unbanUser']

let database: pg.Pool | undefined

const db = (): pg.Pool => {
  if (!database) throw new Error('Administrator recent-comment test database is not initialized')
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
  code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'INVALID_CURSOR' | 'NOT_FOUND' | 'CHART_UNAVAILABLE',
): Promise<void> => {
  const text = await response.text()
  expect(response.status, text).toBe(status)
  expect(JSON.parse(text)).toMatchObject({ defined: true, code, status })
  expectPrivateNoStoreHeaders(response)
}

const createCatalogFixture = async (): Promise<void> => {
  await db().query(`
    DROP SCHEMA IF EXISTS dxdata CASCADE;
    DROP SCHEMA IF EXISTS ${UNAVAILABLE_SCHEMA} CASCADE;
    CREATE SCHEMA dxdata;

    CREATE TABLE dxdata.catalog_build_runs (
      id bigint PRIMARY KEY,
      status text NOT NULL,
      api_schema_version integer NOT NULL
    );
    CREATE TABLE dxdata.catalog_snapshots (
      catalog_run_id bigint PRIMARY KEY,
      api_schema_version integer NOT NULL
    );
    CREATE TABLE dxdata.catalog_publications (
      channel text PRIMARY KEY,
      catalog_run_id bigint NOT NULL,
      revision bigint NOT NULL,
      published_at timestamptz NOT NULL
    );
    CREATE TABLE dxdata.canonical_songs (
      id text PRIMARY KEY,
      legacy_song_id text UNIQUE,
      title text NOT NULL,
      artist text NOT NULL,
      retired_at timestamptz
    );
    CREATE TABLE dxdata.song_source_mappings (
      source_id text NOT NULL,
      external_id text NOT NULL,
      song_id text NOT NULL,
      active boolean NOT NULL,
      PRIMARY KEY (source_id, external_id)
    );
    CREATE TABLE dxdata.canonical_sheets (
      id text PRIMARY KEY,
      song_id text NOT NULL,
      chart_type text NOT NULL,
      difficulty text NOT NULL,
      retired_at timestamptz,
      UNIQUE (song_id, chart_type, difficulty)
    );
    CREATE TABLE dxdata.catalog_run_sheets (
      catalog_run_id bigint NOT NULL,
      song_id text NOT NULL,
      sheet_id text NOT NULL,
      PRIMARY KEY (catalog_run_id, sheet_id)
    );
  `)

  await db().query(`
    INSERT INTO dxdata.catalog_build_runs VALUES (81, 'published', 1);
    INSERT INTO dxdata.catalog_snapshots VALUES (81, 1);
    INSERT INTO dxdata.catalog_publications
      VALUES ('production-v1', 81, 31, '2026-08-24 08:00:00.654321+00');
  `)
  await db().query(
    `INSERT INTO dxdata.canonical_songs
      (id, legacy_song_id, title, artist, retired_at)
     VALUES
      ($1, $2, 'Current Catalog Song', 'Current Artist', NULL),
      ($3, $4, 'Retired Catalog Song', 'Retired Artist', '2026-07-01 00:00:00+00')`,
    [CURRENT_SONG_ID, CURRENT_LEGACY_SONG_ID, HISTORICAL_SONG_ID, HISTORICAL_LEGACY_SONG_ID],
  )
  await db().query(
    `INSERT INTO dxdata.song_source_mappings
      (source_id, external_id, song_id, active)
     VALUES
      ('legacy_dxdata', $1, $2, true),
      ('legacy_dxdata', $3, $4, false),
      ('legacy_dxdata', $5, $4, false)`,
    [
      CURRENT_LEGACY_SONG_ID,
      CURRENT_SONG_ID,
      HISTORICAL_LEGACY_SONG_ID,
      HISTORICAL_SONG_ID,
      HISTORICAL_OLD_LEGACY_SONG_ID,
    ],
  )
  await db().query(
    `INSERT INTO dxdata.canonical_sheets
      (id, song_id, chart_type, difficulty, retired_at)
     VALUES
      ($1, $2, 'dx', 'master', NULL),
      ($3, $4, 'std', 'expert', '2026-07-01 00:00:00+00')`,
    [CURRENT_CHART_ID, CURRENT_SONG_ID, HISTORICAL_CHART_ID, HISTORICAL_SONG_ID],
  )
  await db().query(
    `INSERT INTO dxdata.catalog_run_sheets
      (catalog_run_id, song_id, sheet_id)
     VALUES (81, $1, $2)`,
    [CURRENT_SONG_ID, CURRENT_CHART_ID],
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

const createAdministrator = async (email: string): Promise<TestUser> => {
  const candidate = await createUser(email, 'Recent Comments Administrator')
  await promoteToAdministrator(candidate.id)
  const response = await signIn(email, PASSWORD)
  const text = await response.clone().text()
  expect(response.status, text).toBe(200)
  return { ...candidate, cookie: extractSessionCookie(response) }
}

const insertComment = async ({
  authorUserId,
  chart,
  createdAt,
  body,
  parentId = null,
}: {
  readonly authorUserId: string
  readonly chart: ChartReference
  readonly createdAt: string
  readonly body: string
  readonly parentId?: string | null
}): Promise<CommentFixture> => {
  const result = await db().query<{ readonly id: string }>(
    `INSERT INTO comments
      (created_at, created_by, song_id, sheet_type, sheet_difficulty, parent_id, content)
     VALUES ($1::timestamp, $2, $3, $4, $5, $6::bigint, $7)
     RETURNING id::text`,
    [createdAt, authorUserId, chart.songId, chart.sheetType, chart.sheetDifficulty, parentId, body],
  )
  return { id: result.rows[0]!.id, parentId, body }
}

const establishDeletedComment = async (commentId: string, actorUserId: string, reason: string): Promise<string> => {
  const event = await db().query<{ readonly id: string }>(
    `INSERT INTO admin_comment_moderation_history
      (comment_id, actor_user_id, previous_event_id, action, reason, request_correlation_id)
     VALUES ($1::bigint, $2, NULL, 'delete', $3, $4::uuid)
     RETURNING id::text`,
    [commentId, actorUserId, reason, crypto.randomUUID()],
  )
  await db().query(
    `INSERT INTO admin_comment_moderation_state (
       comment_id,
       established_action,
       deletion_reason,
       actor_user_id,
       established_by_event_id,
       moderated_at
     )
     SELECT comment_id, action, reason, actor_user_id, id, created_at
     FROM admin_comment_moderation_history
     WHERE id = $1::bigint`,
    [event.rows[0]!.id],
  )
  return event.rows[0]!.id
}

const establishActiveUserBan = async (subjectUserId: string, actorUserId: string, reason: string): Promise<string> => {
  const event = await db().query<{ readonly id: string }>(
    `INSERT INTO admin_user_ban_history (
       subject_user_id,
       actor_user_id,
       previous_event_id,
       action,
       reason,
       ban_started_at,
       expires_at,
       request_correlation_id
     )
     VALUES ($1, $2, NULL, 'ban', $3, NULL, NULL, $4::uuid)
     RETURNING id::text`,
    [subjectUserId, actorUserId, reason, crypto.randomUUID()],
  )
  await db().query(
    `INSERT INTO admin_user_ban_state (
       subject_user_id,
       established_action,
       ban_started_at,
       ban_expires_at,
       ban_reason,
       actor_user_id,
       established_by_event_id
     )
     SELECT subject_user_id, action, ban_started_at, expires_at, reason, actor_user_id, id
     FROM admin_user_ban_history
     WHERE id = $1::bigint`,
    [event.rows[0]!.id],
  )
  return event.rows[0]!.id
}

const completePrimaryAuthentication = async (administrator: TestUser): Promise<void> => {
  const response = await adminRequest('/api/admin/primary-auth/password', administrator.cookie, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  })
  const text = await response.clone().text()
  expect(response.status, text).toBe(200)
  expectPrivateNoStoreHeaders(response)
}

const deleteComment = async (
  administrator: TestUser,
  commentId: string,
  reason: string,
): Promise<CommentDeletionOutput> => {
  const response = await adminRequest(`/api/admin/comments/${commentId}/delete`, administrator.cookie, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedStateVersion: null, confirmed: true, reason }),
  })
  const text = await response.clone().text()
  expect(response.status, text).toBe(200)
  return responseBody<CommentDeletionOutput>(response)
}

const restoreComment = async (
  administrator: TestUser,
  commentId: string,
  expectedStateVersion: string,
): Promise<CommentRestorationOutput> => {
  const response = await adminRequest(`/api/admin/comments/${commentId}/restore`, administrator.cookie, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedStateVersion, confirmed: true }),
  })
  const text = await response.clone().text()
  expect(response.status, text).toBe(200)
  return responseBody<CommentRestorationOutput>(response)
}

const banUser = async (administrator: TestUser, userId: string, reason: string): Promise<BanOutput> => {
  const response = await adminRequest(`/api/admin/users/${encodeURIComponent(userId)}/ban`, administrator.cookie, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'permanent', expectedStateVersion: null, reason }),
  })
  const text = await response.clone().text()
  expect(response.status, text).toBe(200)
  return responseBody<BanOutput>(response)
}

const unbanUser = async (
  administrator: TestUser,
  userId: string,
  expectedStateVersion: string,
): Promise<UnbanOutput> => {
  const response = await adminRequest(`/api/admin/users/${encodeURIComponent(userId)}/unban`, administrator.cookie, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedStateVersion }),
  })
  const text = await response.clone().text()
  expect(response.status, text).toBe(200)
  return responseBody<UnbanOutput>(response)
}

const currentChart = (): ChartReference => ({
  songId: CURRENT_LEGACY_SONG_ID,
  sheetType: 'dx',
  sheetDifficulty: 'master',
})

const historicalChart = (): ChartReference => ({
  songId: HISTORICAL_OLD_LEGACY_SONG_ID,
  sheetType: 'std',
  sheetDifficulty: 'expert',
})

const unresolvedChart = (): ChartReference => ({
  songId: UNRESOLVED_LEGACY_SONG_ID,
  sheetType: 'utage',
  sheetDifficulty: 'unknown',
})

describe('administrator recent-comment and expanded-context HTTP boundary', () => {
  beforeAll(async () => {
    await setupTestServer()
    database = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    await createCatalogFixture()
  })

  afterAll(async () => {
    try {
      await database?.query(`
        DROP SCHEMA IF EXISTS dxdata CASCADE;
        DROP SCHEMA IF EXISTS ${UNAVAILABLE_SCHEMA} CASCADE;
      `)
    } finally {
      await database?.end().catch(() => undefined)
      await teardownTestServer()
    }
  })

  beforeEach(cleanDatabase)

  it('blocks non-administrators and paginates equal-microsecond comments without duplicates after an insert', async () => {
    const administrator = await createAdministrator('recent-page-admin@example.test')
    const ordinaryUser = await createUser('recent-page-user@example.test', 'Recent Page User')
    const equalCreatedAt = '2026-08-24 09:00:00.654321'
    const comments: CommentFixture[] = []
    for (const suffix of ['one', 'two', 'three']) {
      comments.push(
        await insertComment({
          authorUserId: ordinaryUser.id,
          chart: currentChart(),
          createdAt: equalCreatedAt,
          body: `Equal timestamp ${suffix}`,
        }),
      )
    }

    await expectTypedFailure(await adminRequest('/api/admin/comments?limit=2'), 401, 'UNAUTHENTICATED')
    await expectTypedFailure(await adminRequest('/api/admin/comments?limit=2', ordinaryUser.cookie), 403, 'FORBIDDEN')

    const firstResponse = await adminRequest('/api/admin/comments?limit=2', administrator.cookie)
    const firstText = await firstResponse.clone().text()
    expect(firstResponse.status, firstText).toBe(200)
    expectPrivateNoStoreHeaders(firstResponse)
    const first = await responseBody<FeedOutput>(firstResponse)
    expect(first.items.map(({ id }) => id)).toEqual([comments[2]!.id, comments[1]!.id])
    expect(first.items.map(({ createdAt }) => createdAt)).toEqual([
      '2026-08-24T09:00:00.654321Z',
      '2026-08-24T09:00:00.654321Z',
    ])
    expect(first.items[0]).toMatchObject({
      parentId: null,
      rootId: comments[2]!.id,
      status: 'active',
      author: { userId: ordinaryUser.id, effectiveRole: 'user', isBanned: false },
      chart: {
        availability: 'current',
        songId: CURRENT_SONG_ID,
        chartId: CURRENT_CHART_ID,
      },
    })
    expect(first.activePublication).toEqual({ channel: 'production-v1', catalogRunId: '81', revision: '31' })
    expect(first.normalizedFilters).toEqual({
      authorUserId: null,
      chartId: null,
      status: null,
      createdAtFromInclusive: null,
      createdAtBeforeExclusive: null,
    })
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(first.nextCursor).not.toContain(equalCreatedAt)
    expect(first.nextCursor).not.toContain('{')

    const insertedBetweenPages = await insertComment({
      authorUserId: ordinaryUser.id,
      chart: currentChart(),
      createdAt: equalCreatedAt,
      body: 'Inserted between keyset pages',
    })
    const secondResponse = await adminRequest(
      `/api/admin/comments?limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`,
      administrator.cookie,
    )
    expect(secondResponse.status).toBe(200)
    expectPrivateNoStoreHeaders(secondResponse)
    const second = await responseBody<FeedOutput>(secondResponse)
    expect(second.items.map(({ id }) => id)).toEqual([comments[0]!.id])
    expect(second.nextCursor).toBeNull()
    const traversed = [...first.items, ...second.items].map(({ id }) => id)
    expect(new Set(traversed).size).toBe(traversed.length)
    expect(traversed).not.toContain(insertedBetweenPages.id)
  })

  it('combines normalized filters and exposes only bounded public feed context for current, retired, and unresolved charts', async () => {
    const administrator = await createAdministrator('recent-filter-admin@example.test')
    const author = await createUser('private-author-email-canary@example.test', 'Fallback Author Name')
    const otherAuthor = await createUser('recent-filter-other@example.test', 'Other Feed Author')
    await db().query(`INSERT INTO profiles (id, display_name) VALUES ($1, '  Banned Profile Author  ')`, [author.id])
    await db().query(`UPDATE account SET access_token = $1, refresh_token = $2 WHERE user_id = $3`, [
      PRIVATE_ACCESS_TOKEN,
      PRIVATE_REFRESH_TOKEN,
      author.id,
    ])
    await db().query(`UPDATE session SET ip_address = $1 WHERE user_id = $2`, [PRIVATE_IP_ADDRESS, author.id])

    const root = await insertComment({
      authorUserId: author.id,
      chart: historicalChart(),
      createdAt: '2026-08-24 09:59:59.999999',
      body: 'Historical root remains visible',
    })
    const selected = await insertComment({
      authorUserId: author.id,
      chart: historicalChart(),
      createdAt: '2026-08-24 10:00:00.000000',
      parentId: root.id,
      body: PRIVATE_BODY,
    })
    const boundary = await insertComment({
      authorUserId: author.id,
      chart: historicalChart(),
      createdAt: '2026-08-24 10:00:01.000000',
      body: 'Exclusive boundary body',
    })
    const wrongStatus = await insertComment({
      authorUserId: author.id,
      chart: historicalChart(),
      createdAt: '2026-08-24 10:00:00.500000',
      body: 'Wrong active status',
    })
    const wrongAuthor = await insertComment({
      authorUserId: otherAuthor.id,
      chart: historicalChart(),
      createdAt: '2026-08-24 10:00:00.400000',
      body: 'Wrong author',
    })
    const wrongChart = await insertComment({
      authorUserId: author.id,
      chart: currentChart(),
      createdAt: '2026-08-24 10:00:00.300000',
      body: 'Wrong chart',
    })
    const adminCurrent = await insertComment({
      authorUserId: administrator.id,
      chart: currentChart(),
      createdAt: '2026-08-24 10:00:00.200000',
      body: 'Administrator-authored current chart comment',
    })
    const unresolved = await insertComment({
      authorUserId: otherAuthor.id,
      chart: unresolvedChart(),
      createdAt: '2026-08-24 10:00:00.100000',
      body: 'Unresolved legacy chart comment',
    })
    for (const comment of [selected, boundary, wrongAuthor, wrongChart]) {
      await establishDeletedComment(comment.id, administrator.id, PRIVATE_DELETION_REASON)
    }
    await establishActiveUserBan(author.id, administrator.id, PRIVATE_BAN_REASON)

    const allResponse = await adminRequest('/api/admin/comments?limit=20', administrator.cookie)
    expect(allResponse.status).toBe(200)
    const all = await responseBody<FeedOutput>(allResponse)
    const byId = new Map(all.items.map((item) => [item.id, item]))
    expect(byId.get(selected.id)).toMatchObject({
      parentId: root.id,
      rootId: root.id,
      status: 'deleted',
      bodyPreview: ADMIN_DELETED_COMMENT_PREVIEW,
      bodyPreviewTruncated: false,
      author: {
        userId: author.id,
        displayName: 'Banned Profile Author',
        effectiveRole: 'user',
        isBanned: true,
      },
      chart: {
        availability: 'historical',
        legacyReference: {
          legacySongId: HISTORICAL_OLD_LEGACY_SONG_ID,
          sheetType: 'std',
          sheetDifficulty: 'expert',
        },
        songLabel: 'Retired Catalog Song',
        songId: HISTORICAL_SONG_ID,
        chartId: HISTORICAL_CHART_ID,
      },
    })
    expect(byId.get(adminCurrent.id)).toMatchObject({
      author: { userId: administrator.id, effectiveRole: 'admin', isBanned: false },
      chart: { availability: 'current', songId: CURRENT_SONG_ID, chartId: CURRENT_CHART_ID },
    })
    expect(byId.get(unresolved.id)).toMatchObject({
      chart: {
        availability: 'unresolved',
        legacyReference: { legacySongId: UNRESOLVED_LEGACY_SONG_ID },
        songId: null,
        chartId: null,
      },
    })
    expect(byId.get(wrongStatus.id)?.status).toBe('active')

    const query = new URLSearchParams({
      authorUserId: author.id,
      chartId: HISTORICAL_CHART_ID,
      status: 'deleted',
      createdAtFromInclusive: '2026-08-24T10:00:00Z',
      createdAtBeforeExclusive: '2026-08-24T10:00:01Z',
      limit: '10',
    })
    const filteredResponse = await adminRequest(`/api/admin/comments?${query}`, administrator.cookie)
    const filteredText = await filteredResponse.clone().text()
    expect(filteredResponse.status, filteredText).toBe(200)
    expectPrivateNoStoreHeaders(filteredResponse)
    const filtered = await responseBody<FeedOutput>(filteredResponse)
    expect(filtered.items).toHaveLength(1)
    expect(filtered.items[0]).toMatchObject({
      id: selected.id,
      parentId: root.id,
      rootId: root.id,
      status: 'deleted',
      bodyPreview: ADMIN_DELETED_COMMENT_PREVIEW,
      bodyPreviewTruncated: false,
      chart: { availability: 'historical', chartId: HISTORICAL_CHART_ID },
    })
    expect(filtered.normalizedFilters).toEqual({
      authorUserId: author.id,
      chartId: HISTORICAL_CHART_ID,
      status: 'deleted',
      createdAtFromInclusive: '2026-08-24T10:00:00.000Z',
      createdAtBeforeExclusive: '2026-08-24T10:00:01.000Z',
    })
    for (const secret of [
      PRIVATE_BODY,
      PRIVATE_DELETION_REASON,
      PRIVATE_BAN_REASON,
      author.email,
      PRIVATE_ACCESS_TOKEN,
      PRIVATE_REFRESH_TOKEN,
      PRIVATE_IP_ADDRESS,
    ]) {
      expect(filteredText).not.toContain(secret)
    }
  })

  it('returns root and leaf evidence with deterministic deep-thread continuation and both moderation histories', async () => {
    const administrator = await createAdministrator('recent-detail-admin@example.test')
    const author = await createUser('recent-detail-author@example.test', 'Deep Thread Author')
    const root = await insertComment({
      authorUserId: author.id,
      chart: historicalChart(),
      createdAt: '2026-08-24 11:00:00.000001',
      body: 'Deep root immutable body',
    })
    const branch = await insertComment({
      authorUserId: author.id,
      chart: historicalChart(),
      createdAt: '2026-08-24 11:00:00.000002',
      parentId: root.id,
      body: 'Depth one immutable body',
    })
    const grandchild = await insertComment({
      authorUserId: author.id,
      chart: historicalChart(),
      createdAt: '2026-08-24 11:00:00.000003',
      parentId: branch.id,
      body: 'Depth two immutable body',
    })
    const leaf = await insertComment({
      authorUserId: author.id,
      chart: historicalChart(),
      createdAt: '2026-08-24 11:00:00.000004',
      parentId: grandchild.id,
      body: 'Depth three immutable body',
    })
    const sibling = await insertComment({
      authorUserId: author.id,
      chart: historicalChart(),
      createdAt: '2026-08-24 11:00:00.000005',
      parentId: root.id,
      body: 'Root sibling immutable body',
    })

    await completePrimaryAuthentication(administrator)
    const leafDeletion = await deleteComment(administrator, leaf.id, 'Retired chart leaf deletion')
    const leafRestoration = await restoreComment(administrator, leaf.id, leafDeletion.state.stateVersion)
    const siblingDeletion = await deleteComment(administrator, sibling.id, 'Private sibling deletion reason')
    const authorBan = await banUser(administrator, author.id, 'Private detail author ban reason')
    const authorUnban = await unbanUser(administrator, author.id, authorBan.event.id)

    const retiredFilter = await adminRequest(
      `/api/admin/comments?chartId=${HISTORICAL_CHART_ID}&limit=20`,
      administrator.cookie,
    )
    expect(retiredFilter.status).toBe(200)
    const retired = await responseBody<FeedOutput>(retiredFilter)
    expect(retired.items.map(({ id }) => id)).toEqual([sibling.id, leaf.id, grandchild.id, branch.id, root.id])
    expect(retired.items.every(({ chart }) => chart.availability === 'historical')).toBe(true)
    expect(retired.items.find(({ id }) => sibling.id === id)).toMatchObject({
      status: 'deleted',
      bodyPreview: ADMIN_DELETED_COMMENT_PREVIEW,
    })

    const rootResponse = await adminRequest(
      `/api/admin/comments/${root.id}?threadLimit=10&commentHistoryLimit=10&authorBanHistoryLimit=10`,
      administrator.cookie,
    )
    expect(rootResponse.status).toBe(200)
    expectPrivateNoStoreHeaders(rootResponse)
    const rootDetail = await responseBody<DetailOutput>(rootResponse)
    expect(rootDetail).toMatchObject({
      comment: {
        id: root.id,
        parentId: null,
        rootId: root.id,
        chart: { availability: 'historical', chartId: HISTORICAL_CHART_ID },
        originalBody: root.body,
      },
      thread: { completeness: 'complete', nextCursor: null },
    })
    expect(rootDetail.thread.items.map(({ id, depth }) => ({ id, depth }))).toEqual([
      { id: root.id, depth: 0 },
      { id: branch.id, depth: 1 },
      { id: grandchild.id, depth: 2 },
      { id: leaf.id, depth: 3 },
      { id: sibling.id, depth: 1 },
    ])

    const leafFirstResponse = await adminRequest(
      `/api/admin/comments/${leaf.id}?threadLimit=2&commentHistoryLimit=10&authorBanHistoryLimit=10`,
      administrator.cookie,
    )
    expect(leafFirstResponse.status).toBe(200)
    expectPrivateNoStoreHeaders(leafFirstResponse)
    const leafFirst = await responseBody<DetailOutput>(leafFirstResponse)
    expect(leafFirst).toMatchObject({
      activePublication: { channel: 'production-v1', catalogRunId: '81', revision: '31' },
      comment: {
        id: leaf.id,
        parentId: grandchild.id,
        rootId: root.id,
        authorUserId: author.id,
        chart: { availability: 'historical', chartId: HISTORICAL_CHART_ID },
        createdAt: expect.any(String),
        originalBody: leaf.body,
      },
      state: {
        status: 'visible',
        stateVersion: leafRestoration.state.stateVersion,
        reason: null,
      },
      author: {
        userId: author.id,
        email: author.email,
        effectiveRole: 'user',
        banState: { status: 'unbanned', stateVersion: authorUnban.state.stateVersion },
      },
      thread: { completeness: 'partial' },
    })
    expect(leafFirst.thread.items.map(({ id, parentId, depth }) => ({ id, parentId, depth }))).toEqual([
      { id: root.id, parentId: null, depth: 0 },
      { id: branch.id, parentId: root.id, depth: 1 },
    ])
    expect(leafFirst.thread.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(leafFirst.commentHistory).toEqual({
      items: [leafRestoration.event, leafDeletion.event],
      nextCursor: null,
    })
    expect(leafFirst.authorBanHistory).toEqual({
      items: [authorUnban.event, authorBan.event],
      nextCursor: null,
    })

    const insertedAfterHighWater = await insertComment({
      authorUserId: author.id,
      chart: historicalChart(),
      createdAt: '2026-08-24 11:00:00.000001',
      parentId: root.id,
      body: 'Inserted after thread high-water capture',
    })
    const leafSecondResponse = await adminRequest(
      `/api/admin/comments/${leaf.id}?threadLimit=2&threadCursor=${encodeURIComponent(leafFirst.thread.nextCursor!)}`,
      administrator.cookie,
    )
    expect(leafSecondResponse.status).toBe(200)
    const leafSecond = await responseBody<DetailOutput>(leafSecondResponse)
    expect(leafSecond.thread.items.map(({ id, depth }) => ({ id, depth }))).toEqual([
      { id: grandchild.id, depth: 2 },
      { id: leaf.id, depth: 3 },
    ])
    expect(leafSecond.thread.completeness).toBe('partial')
    expect(leafSecond.thread.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/)

    const leafThirdResponse = await adminRequest(
      `/api/admin/comments/${leaf.id}?threadLimit=2&threadCursor=${encodeURIComponent(leafSecond.thread.nextCursor!)}`,
      administrator.cookie,
    )
    expect(leafThirdResponse.status).toBe(200)
    const leafThird = await responseBody<DetailOutput>(leafThirdResponse)
    expect(leafThird.thread).toMatchObject({ completeness: 'complete', nextCursor: null })
    expect(leafThird.thread.items).toMatchObject([
      {
        id: sibling.id,
        parentId: root.id,
        depth: 1,
        originalBody: sibling.body,
        state: {
          status: 'deleted',
          stateVersion: siblingDeletion.state.stateVersion,
          reason: 'Private sibling deletion reason',
        },
      },
    ])
    const continuedIds = [...leafSecond.thread.items, ...leafThird.thread.items].map(({ id }) => id)
    expect(continuedIds).not.toContain(insertedAfterHighWater.id)
  })

  it('returns typed cursor, missing-resource, and catalog failures without caching private responses', async () => {
    const administrator = await createAdministrator('recent-errors-admin@example.test')
    const author = await createUser('recent-errors-author@example.test', 'Recent Error Author')
    const comment = await insertComment({
      authorUserId: author.id,
      chart: currentChart(),
      createdAt: '2026-08-24 12:00:00.123456',
      body: 'Cursor error fixture',
    })

    await expectTypedFailure(
      await adminRequest('/api/admin/comments/999999?threadLimit=10', administrator.cookie),
      404,
      'NOT_FOUND',
    )
    await expectTypedFailure(
      await adminRequest('/api/admin/comments?cursor=not-json', administrator.cookie),
      400,
      'INVALID_CURSOR',
    )
    await expectTypedFailure(
      await adminRequest(`/api/admin/comments/${comment.id}?threadCursor=not-json`, administrator.cookie),
      400,
      'INVALID_CURSOR',
    )

    await db().query(`ALTER SCHEMA dxdata RENAME TO ${UNAVAILABLE_SCHEMA}`)
    try {
      await expectTypedFailure(
        await adminRequest(`/api/admin/comments?chartId=${MISSING_CHART_ID}`, administrator.cookie),
        503,
        'CHART_UNAVAILABLE',
      )
    } finally {
      await db().query(`ALTER SCHEMA ${UNAVAILABLE_SCHEMA} RENAME TO dxdata`)
    }
  })
})