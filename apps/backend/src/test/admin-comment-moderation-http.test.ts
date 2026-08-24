import {
  ADMIN_CONTRACT_COMPATIBILITY_ID,
  ADMIN_CONTRACT_HEADER,
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
const ROOT_BODY = 'ROOT_PRIVATE_IMMUTABLE_EVIDENCE'
const REPLY_BODY = 'REPLY_PRIVATE_IMMUTABLE_EVIDENCE'
const DELETION_REASON = 'PRIVATE_INTERNAL_COMMENT_MODERATION_REASON'

type TestUser = {
  readonly id: string
  readonly email: string
  readonly cookie: string
}

type StoredCommentRow = {
  readonly id: string
  readonly parent_id: string | null
  readonly created_at: Date
  readonly created_by: string
  readonly song_id: string
  readonly sheet_type: string
  readonly sheet_difficulty: string
  readonly content: string
}

type StoredCommentModerationEvent = {
  readonly id: string
  readonly comment_id: string
  readonly actor_user_id: string
  readonly previous_event_id: string | null
  readonly action: 'delete' | 'restore'
  readonly reason: string | null
  readonly request_correlation_id: string
  readonly created_at: Date
}

type StoredCommentModerationState = {
  readonly comment_id: string
  readonly established_action: 'delete' | 'restore'
  readonly deletion_reason: string | null
  readonly actor_user_id: string
  readonly established_by_event_id: string
  readonly moderated_at: Date
}

let database: pg.Pool

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

const createUser = async (email: string, name: string): Promise<TestUser> => {
  const response = await signUp(email, PASSWORD, name)
  const responseText = await response.clone().text()
  expect(response.status, responseText).toBe(200)
  const cookie = extractSessionCookie(response)
  expect(cookie).toContain('dxrating.session_token=')

  const user = await database.query<{ readonly id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email])
  expect(user.rows).toHaveLength(1)
  return { id: user.rows[0]!.id, email, cookie }
}

const promoteToAdministrator = async (userId: string): Promise<void> => {
  const transaction: PoolClient = await database.connect()
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
  const candidate = await createUser(email, 'Comment Moderation Administrator')
  await promoteToAdministrator(candidate.id)
  const signInResponse = await signIn(email, PASSWORD)
  expect(signInResponse.status).toBe(200)
  return { ...candidate, cookie: extractSessionCookie(signInResponse) }
}

const createCommentThread = async (authorUserId: string) => {
  const root = await database.query<{ readonly id: string }>(
    `INSERT INTO comments (created_by, song_id, sheet_type, sheet_difficulty, content)
     VALUES ($1, 'immutable-song', 'dx', 'master', $2)
     RETURNING id::text`,
    [authorUserId, ROOT_BODY],
  )
  const rootId = root.rows[0]!.id
  const reply = await database.query<{ readonly id: string }>(
    `INSERT INTO comments (created_by, song_id, sheet_type, sheet_difficulty, parent_id, content)
     VALUES ($1, 'immutable-song', 'dx', 'master', $2::bigint, $3)
     RETURNING id::text`,
    [authorUserId, rootId, REPLY_BODY],
  )
  return { rootId, replyId: reply.rows[0]!.id }
}

const loadComments = async (commentIds: readonly string[]): Promise<readonly StoredCommentRow[]> => {
  const result = await database.query<StoredCommentRow>(
    `SELECT
       id::text,
       parent_id::text,
       created_at,
       created_by,
       song_id,
       sheet_type,
       sheet_difficulty,
       content
     FROM comments
     WHERE id = ANY($1::bigint[])
     ORDER BY id`,
    [commentIds],
  )
  return result.rows
}

const loadHistory = async (commentId: string): Promise<readonly StoredCommentModerationEvent[]> => {
  const result = await database.query<StoredCommentModerationEvent>(
    `SELECT
       id::text,
       comment_id::text,
       actor_user_id,
       previous_event_id::text,
       action,
       reason,
       request_correlation_id::text,
       created_at
     FROM admin_comment_moderation_history
     WHERE comment_id = $1::bigint
     ORDER BY id`,
    [commentId],
  )
  return result.rows
}

const loadState = async (commentId: string): Promise<StoredCommentModerationState> => {
  const result = await database.query<StoredCommentModerationState>(
    `SELECT
       comment_id::text,
       established_action,
       deletion_reason,
       actor_user_id,
       established_by_event_id::text,
       moderated_at
     FROM admin_comment_moderation_state
     WHERE comment_id = $1::bigint`,
    [commentId],
  )
  expect(result.rows).toHaveLength(1)
  return result.rows[0]!
}

const completePasswordStepUp = async (cookie: string): Promise<void> => {
  const response = await adminRequest('/api/admin/primary-auth/password', cookie, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  })
  const responseText = await response.clone().text()
  expect(response.status, responseText).toBe(200)
  await expect(response.json()).resolves.toMatchObject({ completed: true })
}

const expectTypedPrivateFailure = async (
  response: Response,
  status: number,
  code: 'CONFLICT' | 'FORBIDDEN' | 'RECENT_AUTH_REQUIRED' | 'UNAUTHENTICATED',
) => {
  const text = await response.text()
  expect(response.status, text).toBe(status)
  expect(JSON.parse(text)).toMatchObject({ defined: true, code, status })
  expect(text).not.toContain(ROOT_BODY)
  expect(text).not.toContain(REPLY_BODY)
  expect(text).not.toContain(DELETION_REASON)
  expect(text).not.toContain('requestCorrelationId')
}

describe('administrator comment-moderation HTTP flow', () => {
  beforeAll(async () => {
    await setupTestServer()
    database = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  })

  afterAll(async () => {
    await database?.end()
    await teardownTestServer()
  })

  beforeEach(cleanDatabase)

  it('returns privileged immutable evidence only to an authorized administrator for root comments and replies', async () => {
    const administrator = await createAdministrator('comment-detail-admin@example.com')
    const author = await createUser('comment-detail-author@example.com', 'Comment Detail Author')
    const { rootId, replyId } = await createCommentThread(author.id)

    const rootResponse = await adminRequest(`/api/admin/comments/${rootId}?limit=10`, administrator.cookie)
    expect(rootResponse.status).toBe(200)
    const root = await responseBody<AdminContractOutputs['getCommentModerationDetail']>(rootResponse)
    expect(root).toEqual({
      comment: {
        id: rootId,
        parentId: null,
        authorUserId: author.id,
        chart: { songId: 'immutable-song', sheetType: 'dx', sheetDifficulty: 'master' },
        createdAt: expect.any(String),
        originalBody: ROOT_BODY,
      },
      state: {
        status: 'visible',
        stateVersion: null,
        actorUserId: null,
        moderatedAt: null,
        reason: null,
      },
      history: { items: [], nextCursor: null },
    })

    const replyResponse = await adminRequest(`/api/admin/comments/${replyId}?limit=10`, administrator.cookie)
    expect(replyResponse.status).toBe(200)
    await expect(replyResponse.json()).resolves.toEqual({
      comment: {
        id: replyId,
        parentId: rootId,
        authorUserId: author.id,
        chart: { songId: 'immutable-song', sheetType: 'dx', sheetDifficulty: 'master' },
        createdAt: expect.any(String),
        originalBody: REPLY_BODY,
      },
      state: {
        status: 'visible',
        stateVersion: null,
        actorUserId: null,
        moderatedAt: null,
        reason: null,
      },
      history: { items: [], nextCursor: null },
    })

    const unauthenticated = await adminRequest(`/api/admin/comments/${rootId}`)
    await expectTypedPrivateFailure(unauthenticated, 401, 'UNAUTHENTICATED')

    const ordinaryUser = await adminRequest(`/api/admin/comments/${rootId}`, author.cookie)
    await expectTypedPrivateFailure(ordinaryUser, 403, 'FORBIDDEN')
  })

  it('deletes and restores without changing original rows or relationships and retains private append-only history', async () => {
    const administrator = await createAdministrator('comment-lifecycle-admin@example.com')
    const author = await createUser('comment-lifecycle-author@example.com', 'Comment Lifecycle Author')
    const { rootId, replyId } = await createCommentThread(author.id)
    const originalRows = await loadComments([rootId, replyId])
    expect(originalRows).toHaveLength(2)
    expect(originalRows[1]).toMatchObject({ id: replyId, parent_id: rootId, content: REPLY_BODY })

    const deletePath = `/api/admin/comments/${rootId}/delete`
    const deleteInput = {
      expectedStateVersion: null,
      confirmed: true,
      reason: DELETION_REASON,
    }
    const withoutRecentAuthentication = await adminRequest(deletePath, administrator.cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deleteInput),
    })
    await expectTypedPrivateFailure(withoutRecentAuthentication, 401, 'RECENT_AUTH_REQUIRED')
    expect(await loadHistory(rootId)).toEqual([])

    await completePasswordStepUp(administrator.cookie)
    const deletionResponse = await adminRequest(deletePath, administrator.cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deleteInput),
    })
    const deletionText = await deletionResponse.clone().text()
    expect(deletionResponse.status, deletionText).toBe(200)
    const deletion = await responseBody<AdminContractOutputs['deleteComment']>(deletionResponse)
    expect(deletion).toEqual({
      state: {
        status: 'deleted',
        stateVersion: expect.stringMatching(/^[1-9]\d*$/),
        actorUserId: administrator.id,
        moderatedAt: expect.any(String),
        reason: DELETION_REASON,
      },
      event: {
        id: expect.stringMatching(/^[1-9]\d*$/),
        commentId: rootId,
        actorUserId: administrator.id,
        previousEventId: null,
        action: 'delete',
        reason: DELETION_REASON,
        createdAt: expect.any(String),
      },
    })
    expect(deletion.state.stateVersion).toBe(deletion.event.id)
    expect(deletion.state.moderatedAt).toBe(deletion.event.createdAt)
    const deletionRequestId = deletionResponse.headers.get('X-DXRating-Request-ID')
    expect(deletionRequestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(deletionText).not.toContain('requestCorrelationId')
    expect(deletionText).not.toContain(deletionRequestId!)

    expect(await loadComments([rootId, replyId])).toEqual(originalRows)
    const historyAfterDeletion = await loadHistory(rootId)
    expect(historyAfterDeletion).toHaveLength(1)
    const originalDeletionEvent = historyAfterDeletion[0]!
    expect(originalDeletionEvent).toMatchObject({
      id: deletion.event.id,
      comment_id: rootId,
      actor_user_id: administrator.id,
      previous_event_id: null,
      action: 'delete',
      reason: DELETION_REASON,
      request_correlation_id: deletionRequestId,
    })
    expect(await loadState(rootId)).toMatchObject({
      comment_id: rootId,
      established_action: 'delete',
      deletion_reason: DELETION_REASON,
      actor_user_id: administrator.id,
      established_by_event_id: deletion.event.id,
    })

    const deletedDetailResponse = await adminRequest(`/api/admin/comments/${rootId}?limit=10`, administrator.cookie)
    expect(deletedDetailResponse.status).toBe(200)
    const deletedDetailText = await deletedDetailResponse.clone().text()
    const deletedDetail = await responseBody<AdminContractOutputs['getCommentModerationDetail']>(deletedDetailResponse)
    expect(deletedDetail.comment.originalBody).toBe(ROOT_BODY)
    expect(deletedDetail.state).toEqual(deletion.state)
    expect(deletedDetail.history).toEqual({ items: [deletion.event], nextCursor: null })
    expect(deletedDetailText).not.toContain('requestCorrelationId')
    expect(deletedDetailText).not.toContain(deletionRequestId!)

    for (const body of [deleteInput, { ...deleteInput, expectedStateVersion: deletion.event.id }]) {
      const conflict = await adminRequest(deletePath, administrator.cookie, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      await expectTypedPrivateFailure(conflict, 409, 'CONFLICT')
    }
    const staleRestore = await adminRequest(`/api/admin/comments/${rootId}/restore`, administrator.cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedStateVersion: '9223372036854775807', confirmed: true }),
    })
    await expectTypedPrivateFailure(staleRestore, 409, 'CONFLICT')
    expect(await loadHistory(rootId)).toEqual(historyAfterDeletion)

    await database.query('DELETE FROM admin_primary_auth_windows')
    const inactivePrimaryAuth = await adminRequest('/api/admin/primary-auth/status', administrator.cookie)
    expect(inactivePrimaryAuth.status).toBe(200)
    await expect(inactivePrimaryAuth.json()).resolves.toEqual({ active: false, expiresAt: null })

    const restorationResponse = await adminRequest(`/api/admin/comments/${rootId}/restore`, administrator.cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedStateVersion: deletion.event.id, confirmed: true }),
    })
    const restorationText = await restorationResponse.clone().text()
    expect(restorationResponse.status, restorationText).toBe(200)
    const restoration = await responseBody<AdminContractOutputs['restoreComment']>(restorationResponse)
    expect(restoration).toEqual({
      state: {
        status: 'visible',
        stateVersion: expect.stringMatching(/^[1-9]\d*$/),
        actorUserId: administrator.id,
        moderatedAt: expect.any(String),
        reason: null,
      },
      event: {
        id: expect.stringMatching(/^[1-9]\d*$/),
        commentId: rootId,
        actorUserId: administrator.id,
        previousEventId: deletion.event.id,
        action: 'restore',
        reason: null,
        createdAt: expect.any(String),
      },
    })
    expect(restoration.state.stateVersion).toBe(restoration.event.id)
    expect(restoration.state.moderatedAt).toBe(restoration.event.createdAt)
    const restorationRequestId = restorationResponse.headers.get('X-DXRating-Request-ID')
    expect(restorationRequestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(restorationText).not.toContain('requestCorrelationId')
    expect(restorationText).not.toContain(restorationRequestId!)

    const historyAfterRestoration = await loadHistory(rootId)
    expect(historyAfterRestoration).toHaveLength(2)
    expect(historyAfterRestoration[0]).toEqual(originalDeletionEvent)
    expect(historyAfterRestoration[1]).toMatchObject({
      id: restoration.event.id,
      comment_id: rootId,
      actor_user_id: administrator.id,
      previous_event_id: deletion.event.id,
      action: 'restore',
      reason: null,
      request_correlation_id: restorationRequestId,
    })
    expect(await loadState(rootId)).toMatchObject({
      comment_id: rootId,
      established_action: 'restore',
      deletion_reason: null,
      actor_user_id: administrator.id,
      established_by_event_id: restoration.event.id,
    })

    const restoredDetailResponse = await adminRequest(`/api/admin/comments/${rootId}?limit=10`, administrator.cookie)
    expect(restoredDetailResponse.status).toBe(200)
    const restoredDetailText = await restoredDetailResponse.clone().text()
    const restoredDetail =
      await responseBody<AdminContractOutputs['getCommentModerationDetail']>(restoredDetailResponse)
    expect(restoredDetail.comment.originalBody).toBe(ROOT_BODY)
    expect(restoredDetail.state).toEqual(restoration.state)
    expect(restoredDetail.history).toEqual({ items: [restoration.event, deletion.event], nextCursor: null })
    expect(restoredDetailText).not.toContain('requestCorrelationId')
    expect(restoredDetailText).not.toContain(deletionRequestId!)
    expect(restoredDetailText).not.toContain(restorationRequestId!)

    const repeatedRestore = await adminRequest(`/api/admin/comments/${rootId}/restore`, administrator.cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedStateVersion: restoration.event.id, confirmed: true }),
    })
    await expectTypedPrivateFailure(repeatedRestore, 409, 'CONFLICT')
    await completePasswordStepUp(administrator.cookie)
    const staleDelete = await adminRequest(deletePath, administrator.cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...deleteInput, expectedStateVersion: deletion.event.id }),
    })
    await expectTypedPrivateFailure(staleDelete, 409, 'CONFLICT')
    expect(await loadHistory(rootId)).toEqual(historyAfterRestoration)

    for (const forbiddenPath of [`/api/admin/comments/${rootId}/edit`, `/api/admin/comments/${rootId}/hard-delete`]) {
      const absentRoute = await adminRequest(forbiddenPath, administrator.cookie, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Forbidden replacement' }),
      })
      const absentRouteText = await absentRoute.text()
      expect(absentRoute.status, absentRouteText).toBe(404)
      expect(absentRouteText).not.toContain(ROOT_BODY)
      expect(absentRouteText).not.toContain(DELETION_REASON)
    }
    expect(await loadComments([rootId, replyId])).toEqual(originalRows)
    expect(await loadHistory(rootId)).toEqual(historyAfterRestoration)
  })

  it('allows exactly one of two concurrent same-version deletions and records one event', async () => {
    const administrator = await createAdministrator('comment-concurrency-admin@example.com')
    const author = await createUser('comment-concurrency-author@example.com', 'Comment Concurrency Author')
    const { rootId } = await createCommentThread(author.id)
    await completePasswordStepUp(administrator.cookie)

    const request = () =>
      adminRequest(`/api/admin/comments/${rootId}/delete`, administrator.cookie, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedStateVersion: null,
          confirmed: true,
          reason: DELETION_REASON,
        }),
      })
    const responses = await Promise.all([request(), request()])
    expect(responses.map(({ status }) => status).sort((left, right) => left - right)).toEqual([200, 409])

    const successful = responses.find(({ status }) => status === 200)!
    const conflict = responses.find(({ status }) => status === 409)!
    const deletion = await responseBody<AdminContractOutputs['deleteComment']>(successful)
    expect(deletion.state.status).toBe('deleted')
    expect(deletion.event.action).toBe('delete')
    await expectTypedPrivateFailure(conflict, 409, 'CONFLICT')

    const history = await loadHistory(rootId)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      id: deletion.event.id,
      comment_id: rootId,
      previous_event_id: null,
      action: 'delete',
      reason: DELETION_REASON,
    })
    expect(await loadState(rootId)).toMatchObject({
      established_action: 'delete',
      established_by_event_id: deletion.event.id,
    })
  })
})