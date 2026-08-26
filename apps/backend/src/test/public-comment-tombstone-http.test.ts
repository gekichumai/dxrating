import { PUBLIC_COMMENT_TOMBSTONE_CONTENT } from '@gekichumai/api-contract'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createPostgresCommentModerationStore } from '../admin/comment-moderation-store.js'
import {
  authenticatedFetch,
  cleanDatabase,
  extractSessionCookie,
  getBaseUrl,
  setupTestServer,
  signIn,
  signUp,
  teardownTestServer,
} from './setup.js'

const PASSWORD = 'password123'
const SONG_ID = 'public-tombstone-song'
const SHEET_TYPE = 'dx'
const SHEET_DIFFICULTY = 'master'
const ROOT_BODY = 'ROOT_BODY_THAT_MUST_NOT_SURVIVE_PUBLIC_DELETION'
const LIVE_REPLY_BODY = 'Live reply remains public under its deleted parent'
const LEAF_BODY = 'LEAF_BODY_THAT_MUST_NOT_SURVIVE_PUBLIC_DELETION'
const MISSING_STATE_BODY = 'A comment created before moderation state remains public'
const ROOT_DELETION_REASON = 'PRIVATE_ROOT_DELETION_REASON'
const LEAF_DELETION_REASON = 'PRIVATE_LEAF_DELETION_REASON'

type CreatedComment = {
  readonly id: number
  readonly created_at: string
}

type PublicComment = {
  readonly id: number
  readonly parent_id: number | null
  readonly created_at: string
  readonly content: string
  readonly display_name: string | null
}

let database: pg.Pool

const expectNoStore = (response: Response): void => {
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(response.headers.get('CDN-Cache-Control')).toBe('no-store')
  expect(response.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store')
}

const createAuthor = async (): Promise<{ readonly id: string; readonly cookie: string }> => {
  const signup = await signUp('public-tombstone-author@example.com', PASSWORD, 'Public Tombstone Author')
  expect(signup.status, await signup.clone().text()).toBe(200)

  const user = await database.query<{ readonly id: string }>(`SELECT id FROM "user" WHERE email = $1`, [
    'public-tombstone-author@example.com',
  ])
  expect(user.rows).toHaveLength(1)

  const signin = await signIn('public-tombstone-author@example.com', PASSWORD)
  expect(signin.status, await signin.clone().text()).toBe(200)
  return { id: user.rows[0]!.id, cookie: extractSessionCookie(signin) }
}

const createComment = async (cookie: string, content: string, parentId?: number): Promise<CreatedComment> => {
  const response = await authenticatedFetch(`${getBaseUrl()}/api/v1/comments`, cookie, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      songId: SONG_ID,
      sheetType: SHEET_TYPE,
      sheetDifficulty: SHEET_DIFFICULTY,
      content,
      ...(parentId === undefined ? {} : { parentId }),
    }),
  })
  const text = await response.text()
  expect(response.status, text).toBe(200)
  expectNoStore(response)
  return JSON.parse(text) as CreatedComment
}

const listComments = async (
  cookie?: string,
): Promise<{
  readonly response: Response
  readonly rawBody: string
  readonly comments: readonly PublicComment[]
}> => {
  // The default call has no cookie or authorization header; an optional
  // cookie proves signed-in readers receive the identical public projection.
  const response = await fetch(
    `${getBaseUrl()}/api/v1/comments?songId=${SONG_ID}&sheetType=${SHEET_TYPE}&sheetDifficulty=${SHEET_DIFFICULTY}`,
    cookie ? { headers: { Cookie: cookie } } : undefined,
  )
  const rawBody = await response.text()
  expect(response.status, rawBody).toBe(200)
  expectNoStore(response)
  return { response, rawBody, comments: JSON.parse(rawBody) as readonly PublicComment[] }
}

const byId = (comments: readonly PublicComment[], id: number): PublicComment => {
  const comment = comments.find((candidate) => candidate.id === id)
  expect(comment).toBeDefined()
  return comment!
}

describe('public comment tombstone projection', () => {
  beforeAll(async () => {
    await setupTestServer()
    database = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  })

  afterAll(async () => {
    await database?.end()
    await teardownTestServer()
  })

  beforeEach(cleanDatabase)

  it('projects deleted roots and leaves without leaking evidence, then restores the same thread on the next read', async () => {
    const author = await createAuthor()
    const root = await createComment(author.cookie, ROOT_BODY)
    const liveReply = await createComment(author.cookie, LIVE_REPLY_BODY, root.id)
    const deletedLeaf = await createComment(author.cookie, LEAF_BODY, root.id)
    const missingState = await createComment(author.cookie, MISSING_STATE_BODY)

    const initial = await listComments()
    const initialOrder = initial.comments.map(({ id }) => id)
    expect(initial.comments).toHaveLength(4)
    expect(byId(initial.comments, root.id).content).toBe(ROOT_BODY)
    expect(byId(initial.comments, liveReply.id).parent_id).toBe(root.id)
    expect(byId(initial.comments, deletedLeaf.id).parent_id).toBe(root.id)
    expect(byId(initial.comments, missingState.id).content).toBe(MISSING_STATE_BODY)

    const moderationStore = createPostgresCommentModerationStore(database)
    const rootCorrelationId = randomUUID()
    const rootDeletion = await moderationStore.runInTransaction((transaction) =>
      transaction.applyTransition({
        commentId: String(root.id),
        actorUserId: author.id,
        expectedStateVersion: null,
        action: 'delete',
        reason: ROOT_DELETION_REASON,
        requestCorrelationId: rootCorrelationId,
      }),
    )
    expect(rootDeletion).toBeDefined()

    const leafCorrelationId = randomUUID()
    const leafDeletion = await moderationStore.runInTransaction((transaction) =>
      transaction.applyTransition({
        commentId: String(deletedLeaf.id),
        actorUserId: author.id,
        expectedStateVersion: null,
        action: 'delete',
        reason: LEAF_DELETION_REASON,
        requestCorrelationId: leafCorrelationId,
      }),
    )
    expect(leafDeletion).toBeDefined()

    const deleted = await listComments()
    expect(deleted.comments.map(({ id }) => id)).toEqual(initialOrder)
    expect(byId(deleted.comments, root.id)).toEqual({
      ...byId(initial.comments, root.id),
      content: PUBLIC_COMMENT_TOMBSTONE_CONTENT,
    })
    expect(byId(deleted.comments, liveReply.id)).toEqual(byId(initial.comments, liveReply.id))
    expect(byId(deleted.comments, deletedLeaf.id)).toEqual({
      ...byId(initial.comments, deletedLeaf.id),
      content: PUBLIC_COMMENT_TOMBSTONE_CONTENT,
    })
    expect(byId(deleted.comments, missingState.id)).toEqual(byId(initial.comments, missingState.id))
    expect(byId(deleted.comments, liveReply.id).parent_id).toBe(root.id)
    expect(byId(deleted.comments, deletedLeaf.id).parent_id).toBe(root.id)

    const signedInDeleted = await listComments(author.cookie)
    expect(signedInDeleted.comments).toEqual(deleted.comments)

    for (const comment of deleted.comments) {
      expect(Object.keys(comment).sort()).toEqual(['content', 'created_at', 'display_name', 'id', 'parent_id'])
    }
    for (const privateValue of [
      ROOT_BODY,
      LEAF_BODY,
      ROOT_DELETION_REASON,
      LEAF_DELETION_REASON,
      rootCorrelationId,
      leafCorrelationId,
      author.id,
    ]) {
      expect(deleted.rawBody).not.toContain(privateValue)
    }
    expect(deleted.rawBody).not.toMatch(
      /original[_A-Z]?body|deletion[_A-Z]?reason|actor[_A-Z]?user[_A-Z]?id|moderation[_A-Z]?history|state[_A-Z]?version/i,
    )

    const restoreCorrelationId = randomUUID()
    const restoration = await moderationStore.runInTransaction((transaction) =>
      transaction.applyTransition({
        commentId: String(root.id),
        actorUserId: author.id,
        expectedStateVersion: rootDeletion!.event.id,
        action: 'restore',
        reason: null,
        requestCorrelationId: restoreCorrelationId,
      }),
    )
    expect(restoration).toBeDefined()

    const restored = await listComments()
    expect(restored.comments.map(({ id }) => id)).toEqual(initialOrder)
    expect(byId(restored.comments, root.id)).toEqual(byId(initial.comments, root.id))
    expect(byId(restored.comments, liveReply.id)).toEqual(byId(initial.comments, liveReply.id))
    expect(byId(restored.comments, deletedLeaf.id).content).toBe(PUBLIC_COMMENT_TOMBSTONE_CONTENT)
    expect(byId(restored.comments, missingState.id)).toEqual(byId(initial.comments, missingState.id))
    expect(restored.rawBody).not.toContain(LEAF_BODY)
    expect(restored.rawBody).not.toContain(LEAF_DELETION_REASON)
    expect(restored.rawBody).not.toContain(restoreCorrelationId)
  })

  it('keeps private administrator procedures and moderation structures out of public OpenAPI', async () => {
    const response = await fetch(`${getBaseUrl()}/spec.json`)
    expect(response.status).toBe(200)
    const document = (await response.json()) as {
      readonly paths: Readonly<Record<string, unknown>>
    }
    const commentPath = document.paths['/comments'] as {
      readonly get: {
        readonly responses: {
          readonly '200': {
            readonly content: {
              readonly 'application/json': {
                readonly schema: {
                  readonly type: string
                  readonly items: {
                    readonly type: string
                    readonly required?: readonly string[]
                    readonly properties: Readonly<Record<string, { readonly type?: string }>>
                  }
                }
              }
            }
          }
        }
      }
    }
    const publicCommentSchema = commentPath.get.responses['200'].content['application/json'].schema
    const commentOperations = JSON.stringify(commentPath)

    expect(publicCommentSchema.type).toBe('array')
    expect(publicCommentSchema.items.type).toBe('object')
    expect(publicCommentSchema.items.required).toContain('content')
    expect(publicCommentSchema.items.properties.content?.type).toBe('string')
    expect(commentOperations).toContain(PUBLIC_COMMENT_TOMBSTONE_CONTENT)
    expect(commentOperations).not.toMatch(
      /original[_A-Z]?body|deletion[_A-Z]?reason|actor[_A-Z]?user[_A-Z]?id|moderation[_A-Z]?history|state[_A-Z]?version/i,
    )
    expect(Object.keys(document.paths).some((path) => path.startsWith('/admin') || path.startsWith('/api/admin'))).toBe(
      false,
    )
  })
})