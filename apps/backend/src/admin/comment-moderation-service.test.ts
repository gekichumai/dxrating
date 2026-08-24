import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, setupTestServer, teardownTestServer } from '../test/setup.js'
import { AdminAuthorizationFailure, type AdminAuthorizationContext } from './authorization.js'
import {
  createCommentModerationService,
  createPostgresCommentModerationService,
  CommentModerationServiceFailure,
  type CommentModerationService,
} from './comment-moderation-service.js'
import { createPostgresCommentModerationStore, type CommentModerationStore } from './comment-moderation-store.js'
import type { PersistedUserRole } from './role-policy.js'
import { parseSuperAdministratorAllowlist } from './super-administrator-allowlist.js'

const ALLOWLIST_EFFECTIVE_AT = '2000-01-01T00:00:00.000Z'
const REQUEST_ID = '11111111-1111-4111-8111-111111111111'

const authentication = (
  actorUserId: string,
  persistedRole: PersistedUserRole,
  effectiveRole: 'admin' | 'super_admin',
): AdminAuthorizationContext => ({
  authentication: {
    status: 'authenticated',
    authorizationUser: {
      id: actorUserId,
      role: persistedRole,
      adminAuthorizationNotBefore: new Date(ALLOWLIST_EFFECTIVE_AT),
    },
    principal: {
      userId: actorUserId,
      effectiveRole,
      capabilities: {
        canModerateUsers: true,
        canModerateAdministrators: effectiveRole === 'super_admin',
        canManageAdministrators: effectiveRole === 'super_admin',
      },
    },
    session: {
      id: `${actorUserId}-session`,
      authorizationIssuedAt: new Date(),
    },
    assurance: { freshLoginSatisfied: true, recentPrimaryAuthSatisfied: true },
  },
})

const insertUser = async (
  database: pg.Pool,
  { id, role = 'user' }: { readonly id: string; readonly role?: PersistedUserRole },
) => {
  await database.query(
    `
      INSERT INTO "user" (id, name, email, role, admin_authorization_not_before)
      VALUES ($1, $2, $3, $4::user_role, $5::timestamptz)
    `,
    [id, `User ${id}`, `${id}@example.test`, role, ALLOWLIST_EFFECTIVE_AT],
  )
}

const insertActor = async (
  database: pg.Pool,
  { id, role = 'admin', recent = true }: { id: string; role?: PersistedUserRole; recent?: boolean },
) => {
  await insertUser(database, { id, role })
  await database.query(
    `
      INSERT INTO session (
        id,
        expires_at,
        token,
        admin_authorization_issued_at,
        updated_at,
        user_id
      )
      VALUES ($1, clock_timestamp() + interval '1 hour', $2, clock_timestamp(), clock_timestamp(), $3)
    `,
    [`${id}-session`, `${id}-token`, id],
  )
  if (recent) {
    await database.query(
      `
        WITH auth_clock AS (SELECT clock_timestamp() AS now)
        INSERT INTO admin_primary_auth_windows (session_id, user_id, method, completed_at, expires_at)
        SELECT $1, $2, 'password', now, now + interval '10 minutes'
        FROM auth_clock
      `,
      [`${id}-session`, id],
    )
  }
}

const insertComment = async (
  database: pg.Pool,
  {
    authorUserId,
    parentId,
    content = 'Immutable original body: åäö',
    songId = 'song-id',
  }: {
    readonly authorUserId: string
    readonly parentId?: string
    readonly content?: string
    readonly songId?: string
  },
): Promise<string> => {
  const result = await database.query<{ readonly id: string }>(
    `
      INSERT INTO comments (created_by, song_id, sheet_type, sheet_difficulty, parent_id, content)
      VALUES ($1, $2, 'dx', 'master', $3::bigint, $4)
      RETURNING id::text
    `,
    [authorUserId, songId, parentId ?? null, content],
  )
  return result.rows[0]!.id
}

const createService = (database: pg.Pool, superAdministratorIds: readonly string[] = []): CommentModerationService =>
  createPostgresCommentModerationService({
    store: createPostgresCommentModerationStore(database),
    superAdministrators: parseSuperAdministratorAllowlist(
      JSON.stringify(superAdministratorIds),
      ALLOWLIST_EFFECTIVE_AT,
    ),
  })

describe('comment-moderation service', () => {
  const database = new pg.Pool({ connectionString: process.env.DATABASE_URL })

  beforeAll(setupTestServer)
  afterAll(async () => {
    await database.end()
    await teardownTestServer()
  })
  beforeEach(cleanDatabase)

  it('returns only approved immutable evidence and the initial visible state', async () => {
    await insertUser(database, { id: 'comment-author' })
    const commentId = await insertComment(database, {
      authorUserId: 'comment-author',
      content: 'Exact original bytes: åäö\nsecond line',
    })

    const detail = await createService(database).getCommentModerationDetail({
      commentId,
    })

    expect(detail).toEqual({
      comment: {
        id: commentId,
        parentId: null,
        authorUserId: 'comment-author',
        chart: {
          songId: 'song-id',
          sheetType: 'dx',
          sheetDifficulty: 'master',
        },
        createdAt: expect.stringMatching(/Z$/),
        originalBody: 'Exact original bytes: åäö\nsecond line',
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
    expect(Object.keys(detail.comment).sort()).toEqual(
      ['authorUserId', 'chart', 'createdAt', 'id', 'originalBody', 'parentId'].sort(),
    )
    expect(JSON.stringify(detail)).not.toContain('requestCorrelationId')
  })

  it('preserves a nested thread and immutable evidence through delete/restore cycles with comment-bound history', async () => {
    await insertActor(database, { id: 'admin-actor' })
    await insertUser(database, { id: 'comment-author' })
    const rootId = await insertComment(database, {
      authorUserId: 'comment-author',
      content: 'Root evidence',
    })
    const replyId = await insertComment(database, {
      authorUserId: 'comment-author',
      parentId: rootId,
      content: 'Reply evidence',
    })
    const service = createService(database)
    const context = authentication('admin-actor', 'admin', 'admin')

    const deletion = await service.deleteComment({
      context,
      commentId: rootId,
      expectedStateVersion: null,
      requestCorrelationId: REQUEST_ID.toUpperCase(),
      reason: '  Harassment in a chart discussion  ',
    })
    expect(deletion).toEqual({
      state: {
        status: 'deleted',
        stateVersion: deletion.event.id,
        actorUserId: 'admin-actor',
        moderatedAt: deletion.event.createdAt,
        reason: 'Harassment in a chart discussion',
      },
      event: {
        id: expect.stringMatching(/^[1-9][0-9]*$/),
        commentId: rootId,
        actorUserId: 'admin-actor',
        previousEventId: null,
        action: 'delete',
        reason: 'Harassment in a chart discussion',
        createdAt: expect.stringMatching(/Z$/),
      },
    })
    expect(JSON.stringify(deletion)).not.toContain(REQUEST_ID)

    const replyWhileParentDeleted = await service.getCommentModerationDetail({
      commentId: replyId,
    })
    expect(replyWhileParentDeleted).toMatchObject({
      comment: { parentId: rootId, originalBody: 'Reply evidence' },
      state: { status: 'visible', stateVersion: null },
    })

    const replyDeletion = await service.deleteComment({
      context,
      commentId: replyId,
      expectedStateVersion: null,
      requestCorrelationId: '12121212-1212-4212-8212-121212121212',
      reason: 'Nested reply independently violates policy',
    })
    const replyRestoration = await service.restoreComment({
      context,
      commentId: replyId,
      expectedStateVersion: replyDeletion.event.id,
      requestCorrelationId: '13131313-1313-4313-8313-131313131313',
    })
    expect(replyRestoration.state.status).toBe('visible')
    expect((await service.getCommentModerationDetail({ commentId: replyId })).comment.parentId).toBe(rootId)

    const restoration = await service.restoreComment({
      context,
      commentId: rootId,
      expectedStateVersion: deletion.event.id,
      requestCorrelationId: '22222222-2222-4222-8222-222222222222',
    })
    expect(restoration).toEqual({
      state: {
        status: 'visible',
        stateVersion: restoration.event.id,
        actorUserId: 'admin-actor',
        moderatedAt: restoration.event.createdAt,
        reason: null,
      },
      event: {
        id: expect.stringMatching(/^[1-9][0-9]*$/),
        commentId: rootId,
        actorUserId: 'admin-actor',
        previousEventId: deletion.event.id,
        action: 'restore',
        reason: null,
        createdAt: expect.stringMatching(/Z$/),
      },
    })

    const secondDeletion = await service.deleteComment({
      context,
      commentId: rootId,
      expectedStateVersion: restoration.event.id,
      requestCorrelationId: '33333333-3333-4333-8333-333333333333',
      reason: 'Second independently reviewed violation',
    })

    const firstPage = await service.getCommentModerationDetail({
      commentId: rootId,
      limit: 2,
    })
    expect(firstPage.comment).toMatchObject({
      id: rootId,
      parentId: null,
      originalBody: 'Root evidence',
    })
    expect(firstPage.history.items.map(({ id }) => id)).toEqual([secondDeletion.event.id, restoration.event.id])
    expect(firstPage.history.nextCursor).toEqual(expect.any(String))

    const secondPage = await service.getCommentModerationDetail({
      commentId: rootId,
      cursor: firstPage.history.nextCursor!,
      limit: 2,
    })
    expect(secondPage.history.items.map(({ id }) => id)).toEqual([deletion.event.id])
    expect(secondPage.history.nextCursor).toBeNull()
    await expect(
      service.getCommentModerationDetail({
        commentId: replyId,
        cursor: firstPage.history.nextCursor!,
        limit: 2,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })

    const persisted = await database.query<{
      readonly root_content: string
      readonly reply_parent_id: string
      readonly reply_content: string
      readonly correlation_id: string
    }>(
      `
        SELECT
          root.content AS root_content,
          reply.parent_id::text AS reply_parent_id,
          reply.content AS reply_content,
          history.request_correlation_id::text AS correlation_id
        FROM comments root
        INNER JOIN comments reply ON reply.parent_id = root.id
        INNER JOIN admin_comment_moderation_history history ON history.id = $3::bigint
        WHERE root.id = $1::bigint AND reply.id = $2::bigint
      `,
      [rootId, replyId, deletion.event.id],
    )
    expect(persisted.rows).toEqual([
      {
        root_content: 'Root evidence',
        reply_parent_id: rootId,
        reply_content: 'Reply evidence',
        correlation_id: REQUEST_ID,
      },
    ])
  })

  it('rejects malformed and overflowing decimal IDs before touching persistence', async () => {
    let persistenceCalls = 0
    const store: CommentModerationStore = {
      async resolveCommentAuthor() {
        persistenceCalls += 1
        return undefined
      },
      async loadCommentDetailPage() {
        persistenceCalls += 1
        return undefined
      },
      async runInTransaction() {
        persistenceCalls += 1
        throw new Error('Unexpected transaction')
      },
    }
    const service = createCommentModerationService({
      store,
      superAdministrators: parseSuperAdministratorAllowlist(undefined),
    })
    const context = authentication('admin-actor', 'admin', 'admin')
    const invalidIds = ['', '0', '-1', '01', '9223372036854775808', '9999999999999999999', '1.0']

    for (const commentId of invalidIds) {
      await expect(service.getCommentModerationDetail({ commentId })).rejects.toBeInstanceOf(
        CommentModerationServiceFailure,
      )
      await expect(
        service.deleteComment({
          context,
          commentId,
          expectedStateVersion: null,
          requestCorrelationId: REQUEST_ID,
          reason: 'Valid reason',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    }
    await expect(
      service.deleteComment({
        context,
        commentId: '9223372036854775807',
        expectedStateVersion: '9223372036854775808',
        requestCorrelationId: REQUEST_ID,
        reason: 'Valid reason',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(
      service.deleteComment({
        context,
        commentId: '9223372036854775807',
        expectedStateVersion: null,
        requestCorrelationId: 'not-a-uuid',
        reason: 'Valid reason',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(
      service.deleteComment({
        context,
        commentId: '9223372036854775807',
        expectedStateVersion: null,
        reason: 'Valid reason',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    for (const reason of ['   ', 'x'.repeat(1_001)]) {
      await expect(
        service.deleteComment({
          context,
          commentId: '9223372036854775807',
          expectedStateVersion: null,
          requestCorrelationId: REQUEST_ID,
          reason,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    }
    await expect(
      service.restoreComment({
        context,
        commentId: '9223372036854775807',
        expectedStateVersion: '0',
        requestCorrelationId: REQUEST_ID,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(
      service.getCommentModerationDetail({
        commentId: '9223372036854775807',
        limit: 101,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(
      service.getCommentModerationDetail({
        commentId: '9223372036854775807',
        cursor: 'not-a-valid-bound-cursor',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(persistenceCalls).toBe(0)

    await expect(
      service.getCommentModerationDetail({
        commentId: '9223372036854775807',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(persistenceCalls).toBe(1)
  })

  it('enforces recent authentication, self-targeting, and the effective-role hierarchy', async () => {
    await insertActor(database, { id: 'stale-admin', recent: false })
    await insertActor(database, { id: 'admin-actor' })
    await insertActor(database, { id: 'super-actor' })
    await insertUser(database, { id: 'ordinary-author' })
    await insertUser(database, { id: 'admin-author', role: 'admin' })
    await insertUser(database, { id: 'super-author' })
    const ordinaryComment = await insertComment(database, {
      authorUserId: 'ordinary-author',
    })
    const adminComment = await insertComment(database, {
      authorUserId: 'admin-author',
    })
    const superComment = await insertComment(database, {
      authorUserId: 'super-author',
    })
    const ownComment = await insertComment(database, {
      authorUserId: 'admin-actor',
    })
    const ordinaryService = createService(database)
    const superService = createService(database, ['super-actor', 'super-author'])

    await expect(
      ordinaryService.deleteComment({
        context: authentication('stale-admin', 'admin', 'admin'),
        commentId: ordinaryComment,
        expectedStateVersion: null,
        requestCorrelationId: REQUEST_ID,
        reason: 'Valid reason',
      }),
    ).rejects.toMatchObject({ code: 'RECENT_AUTH_REQUIRED' })
    await expect(
      ordinaryService.deleteComment({
        context: authentication('admin-actor', 'admin', 'admin'),
        commentId: ownComment,
        expectedStateVersion: null,
        requestCorrelationId: REQUEST_ID,
        reason: 'Valid reason',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      ordinaryService.deleteComment({
        context: authentication('admin-actor', 'admin', 'admin'),
        commentId: adminComment,
        expectedStateVersion: null,
        requestCorrelationId: REQUEST_ID,
        reason: 'Valid reason',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      superService.deleteComment({
        context: authentication('super-actor', 'admin', 'super_admin'),
        commentId: superComment,
        expectedStateVersion: null,
        requestCorrelationId: REQUEST_ID,
        reason: 'Valid reason',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    const superDeletion = await superService.deleteComment({
      context: authentication('super-actor', 'admin', 'super_admin'),
      commentId: adminComment,
      expectedStateVersion: null,
      requestCorrelationId: REQUEST_ID,
      reason: 'Administrator comment requires moderation',
    })
    expect(superDeletion.state.status).toBe('deleted')
    expect(superDeletion.event.actorUserId).toBe('super-actor')
  })

  it('re-evaluates the author hierarchy between delete and restore without requiring recent auth for restore', async () => {
    await insertActor(database, { id: 'admin-actor' })
    await insertActor(database, { id: 'super-actor', recent: false })
    await insertUser(database, { id: 'comment-author' })
    const commentId = await insertComment(database, {
      authorUserId: 'comment-author',
    })
    const service = createService(database, ['super-actor'])

    const deletion = await service.deleteComment({
      context: authentication('admin-actor', 'admin', 'admin'),
      commentId,
      expectedStateVersion: null,
      requestCorrelationId: REQUEST_ID,
      reason: 'Reviewed violation',
    })
    await database.query(`UPDATE "user" SET role = 'admin' WHERE id = 'comment-author'`)

    await expect(
      service.restoreComment({
        context: authentication('admin-actor', 'admin', 'admin'),
        commentId,
        expectedStateVersion: deletion.event.id,
        requestCorrelationId: '22222222-2222-4222-8222-222222222222',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    const restored = await service.restoreComment({
      context: authentication('super-actor', 'admin', 'super_admin'),
      commentId,
      expectedStateVersion: deletion.event.id,
      requestCorrelationId: '33333333-3333-4333-8333-333333333333',
    })
    expect(restored.state).toMatchObject({
      status: 'visible',
      actorUserId: 'super-actor',
      reason: null,
    })
  })

  it('lets only one concurrent moderator advance a shared expected version and rejects stale ABA state', async () => {
    await insertActor(database, { id: 'admin-a' })
    await insertActor(database, { id: 'admin-b' })
    await insertUser(database, { id: 'comment-author' })
    const commentId = await insertComment(database, {
      authorUserId: 'comment-author',
    })
    const service = createService(database)

    const attempts = await Promise.allSettled([
      service.deleteComment({
        context: authentication('admin-a', 'admin', 'admin'),
        commentId,
        expectedStateVersion: null,
        requestCorrelationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        reason: 'Moderator A decision',
      }),
      service.deleteComment({
        context: authentication('admin-b', 'admin', 'admin'),
        commentId,
        expectedStateVersion: null,
        requestCorrelationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        reason: 'Moderator B decision',
      }),
    ])
    expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
    const rejected = attempts.find(({ status }) => status === 'rejected')
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: expect.objectContaining({ code: 'CONFLICT' }),
    })

    const winner = attempts.find(({ status }) => status === 'fulfilled')
    if (!winner || winner.status !== 'fulfilled') throw new Error('Expected one successful concurrent deletion')
    await expect(
      service.deleteComment({
        context: authentication('admin-b', 'admin', 'admin'),
        commentId,
        expectedStateVersion: winner.value.event.id,
        requestCorrelationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        reason: 'Repeated already-applied deletion',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })

    const restoration = await service.restoreComment({
      context: authentication('admin-a', 'admin', 'admin'),
      commentId,
      expectedStateVersion: winner.value.event.id,
      requestCorrelationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    })

    await expect(
      service.restoreComment({
        context: authentication('admin-b', 'admin', 'admin'),
        commentId,
        expectedStateVersion: restoration.event.id,
        requestCorrelationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })

    await expect(
      service.deleteComment({
        context: authentication('admin-b', 'admin', 'admin'),
        commentId,
        expectedStateVersion: winner.value.event.id,
        requestCorrelationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        reason: 'Stale ABA-looking decision',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })

    const stateAndHistory = await database.query<{
      readonly state_version: string
      readonly event_count: number
    }>(
      `
        SELECT
          state.established_by_event_id::text AS state_version,
          count(history.id)::integer AS event_count
        FROM admin_comment_moderation_state state
        INNER JOIN admin_comment_moderation_history history ON history.comment_id = state.comment_id
        WHERE state.comment_id = $1::bigint
        GROUP BY state.established_by_event_id
      `,
      [commentId],
    )
    expect(stateAndHistory.rows).toEqual([{ state_version: restoration.event.id, event_count: 2 }])
  })

  it('reads current state and the latest history event from one snapshot while transitions are running', async () => {
    await insertActor(database, { id: 'admin-actor' })
    await insertUser(database, { id: 'comment-author' })
    const commentId = await insertComment(database, {
      authorUserId: 'comment-author',
    })
    const service = createService(database)
    const context = authentication('admin-actor', 'admin', 'admin')
    const observed: Array<Awaited<ReturnType<CommentModerationService['getCommentModerationDetail']>>> = []

    const writer = (async () => {
      let expectedStateVersion: string | null = null
      for (let transition = 0; transition < 12; transition += 1) {
        const requestCorrelationId = `00000000-0000-4000-8000-${transition.toString(16).padStart(12, '0')}`
        if (transition % 2 === 0) {
          const deletion = await service.deleteComment({
            context,
            commentId,
            expectedStateVersion,
            requestCorrelationId,
            reason: `Reviewed violation ${transition}`,
          })
          expectedStateVersion = deletion.event.id
        } else {
          if (expectedStateVersion === null) throw new Error('Restore has no predecessor')
          const restoration = await service.restoreComment({
            context,
            commentId,
            expectedStateVersion,
            requestCorrelationId,
          })
          expectedStateVersion = restoration.event.id
        }
      }
    })()

    const reader = (async () => {
      for (let read = 0; read < 24; read += 1) {
        observed.push(await service.getCommentModerationDetail({ commentId, limit: 1 }))
        await new Promise<void>((resolve) => setImmediate(resolve))
      }
    })()

    await Promise.all([writer, reader])
    expect(observed).toHaveLength(24)
    for (const detail of observed) {
      if (detail.state.stateVersion === null) {
        expect(detail.history.items).toEqual([])
        continue
      }
      const latest = detail.history.items[0]
      expect(latest?.id).toBe(detail.state.stateVersion)
      expect(latest?.actorUserId).toBe(detail.state.actorUserId)
      expect(latest?.createdAt).toBe(detail.state.moderatedAt)
      expect(latest?.action === 'delete' ? 'deleted' : 'visible').toBe(detail.state.status)
    }
  })

  it('maps an exhausted retryable lock conflict to the typed moderation conflict', async () => {
    let attempts = 0
    const fakeDatabase = {
      options: { max: 10 },
      async connect() {
        return {
          async query() {
            return { rows: [] }
          },
          release() {},
        }
      },
    } as unknown as pg.Pool
    const store = createPostgresCommentModerationStore(fakeDatabase)

    await expect(
      store.runInTransaction(async () => {
        attempts += 1
        throw Object.assign(new Error('lock unavailable'), { code: '55P03' })
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(attempts).toBe(4)
  })

  it('uses typed not-found failures and does not turn authorization failures into moderation failures', async () => {
    await expect(createService(database).getCommentModerationDetail({ commentId: '1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(new AdminAuthorizationFailure('FORBIDDEN')).not.toBeInstanceOf(CommentModerationServiceFailure)
  })
})