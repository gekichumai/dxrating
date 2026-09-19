beforeAll(setupTestServer)
afterAll(teardownTestServer)
import { pool } from '../db/index.js'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  setupTestServer,
  teardownTestServer,
  getBaseUrl,
  signUp,
  signIn,
  extractSessionCookie,
  authenticatedFetch,
  cleanDatabase,
} from './setup.js'

describe('Comments API', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('GET /api/v1/comments returns empty for unknown sheet', async () => {
    const res = await fetch(`${getBaseUrl()}/api/v1/comments?songId=nonexistent&sheetType=dx&sheetDifficulty=master`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  it('POST /api/v1/comments requires authentication', async () => {
    const res = await fetch(`${getBaseUrl()}/api/v1/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: 'test-song',
        sheetType: 'dx',
        sheetDifficulty: 'master',
        content: 'Great chart!',
      }),
    })
    expect(res.status).not.toBe(200)
  })

  it('authenticated user can create and list comments', async () => {
    await signUp('commenter@example.com', 'password123', 'Commenter')
    const loginRes = await signIn('commenter@example.com', 'password123')
    const cookie = extractSessionCookie(loginRes)

    // Create comment
    const createRes = await authenticatedFetch(`${getBaseUrl()}/api/v1/comments`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: 'test-song',
        sheetType: 'dx',
        sheetDifficulty: 'master',
        content: 'Great chart!',
      }),
    })
    expect(createRes.status).toBe(200)
    const created = await createRes.json()
    expect(created.id).toBeDefined()
    expect(created.created_at).toBeDefined()

    // List comments
    const listRes = await fetch(`${getBaseUrl()}/api/v1/comments?songId=test-song&sheetType=dx&sheetDifficulty=master`)
    expect(listRes.status).toBe(200)
    const comments = await listRes.json()
    expect(comments.length).toBe(1)
    expect(comments[0].content).toBe('Great chart!')
  })

  it('comments can have parent_id for threading', async () => {
    await signUp('threader@example.com', 'password123', 'Threader')
    const loginRes = await signIn('threader@example.com', 'password123')
    const cookie = extractSessionCookie(loginRes)

    // Create parent comment
    const parentRes = await authenticatedFetch(`${getBaseUrl()}/api/v1/comments`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: 'song-1',
        sheetType: 'dx',
        sheetDifficulty: 'master',
        content: 'Parent comment',
      }),
    })
    const parent = await parentRes.json()

    // Create reply
    const replyRes = await authenticatedFetch(`${getBaseUrl()}/api/v1/comments`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: 'song-1',
        sheetType: 'dx',
        sheetDifficulty: 'master',
        content: 'Reply comment',
        parentId: parent.id,
      }),
    })
    expect(replyRes.status).toBe(200)

    // List and verify threading
    const listRes = await fetch(`${getBaseUrl()}/api/v1/comments?songId=song-1&sheetType=dx&sheetDifficulty=master`)
    const comments = await listRes.json()
    expect(comments.length).toBe(2)
    const reply = comments.find((c: { content: string }) => c.content === 'Reply comment')
    expect(reply.parent_id).toBe(parent.id)
  })

  it('rejects a reply whose parent belongs to a different chart', async () => {
    await signUp('cross-chart@example.com', 'password123', 'Cross Chart')
    const loginRes = await signIn('cross-chart@example.com', 'password123')
    const cookie = extractSessionCookie(loginRes)

    const parentRes = await authenticatedFetch(`${getBaseUrl()}/api/v1/comments`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: 'song-1',
        sheetType: 'dx',
        sheetDifficulty: 'master',
        content: 'Parent comment',
      }),
    })
    const parent = await parentRes.json()

    const replyRes = await authenticatedFetch(`${getBaseUrl()}/api/v1/comments`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: 'song-2',
        sheetType: 'dx',
        sheetDifficulty: 'master',
        content: 'Cross-chart reply',
        parentId: parent.id,
      }),
    })
    expect(replyRes.status).toBe(400)

    const commentsRes = await fetch(`${getBaseUrl()}/api/v1/comments?songId=song-2&sheetType=dx&sheetDifficulty=master`)
    expect(await commentsRes.json()).toEqual([])
  })
})
// Exercise actual HTTP authorization and persisted filtering with independent viewers.
describe('Comment safety', () => {
  beforeEach(cleanDatabase)

  async function account(name: string) {
    const response = await signUp(`${name}@example.com`, 'password123', name)
    expect(response.status).toBe(200)
    const cookie = extractSessionCookie(await signIn(`${name}@example.com`, 'password123'))
    expect(cookie).not.toBe('')
    return cookie
  }
  async function create(cookie: string, songId = 'song-1') {
    const response = await authenticatedFetch(`${getBaseUrl()}/api/v1/comments`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId, sheetType: 'dx', sheetDifficulty: 'master', content: 'Sample chart discussion' }),
    })
    expect(response.status).toBe(200)
    return (await response.json()).id as number
  }
  const list = (cookie = '', song = 'song-1') =>
    authenticatedFetch(`${getBaseUrl()}/api/v1/comments?songId=${song}&sheetType=dx&sheetDifficulty=master`, cookie)
  const act = (cookie: string, id: number, action: string) =>
    authenticatedFetch(`${getBaseUrl()}/api/v1/comments/${id}/${action}`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })

  it('reports hide only that comment for its reporter and survive a new session', async () => {
    const author = await account('author')
    const viewer = await account('viewer')
    const first = await create(author)
    const second = await create(author)
    expect((await act('', first, 'report')).status).toBe(401)
    expect((await act(author, first, 'report')).status).toBe(400)
    expect((await act(viewer, 99999999, 'report')).status).toBe(404)
    expect((await act(viewer, first, 'report')).status).toBe(200)
    expect((await act(viewer, first, 'report')).status).toBe(200)
    expect((await pool.query('SELECT * FROM comment_reports')).rows).toHaveLength(1)
    const freshSession = extractSessionCookie(await signIn('viewer@example.com', 'password123'))
    const response = await list(freshSession)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect((await response.json()).map((c: { id: number }) => c.id)).toEqual([second])
    expect(await (await list(author)).json()).toHaveLength(2)
    expect(await (await list()).json()).toHaveLength(2)
  })

  it('blocks the server-derived author across charts while preserving other authors', async () => {
    const author = await account('author')
    const viewer = await account('viewer')
    const other = await account('other')
    const first = await create(author)
    await create(author, 'song-2')
    const otherComment = await create(other)
    const before = await (await list(viewer)).json()
    const authorId = before.find((c: { id: number }) => c.id === first).author_id
    expect(typeof authorId).toBe('string')
    expect((await act('', first, 'block-author')).status).toBe(401)
    expect((await act(author, first, 'block-author')).status).toBe(400)
    const blocked = await act(viewer, first, 'block-author')
    expect(await blocked.json()).toEqual({ success: true, author_id: authorId })
    await act(viewer, first, 'block-author')
    expect((await pool.query('SELECT * FROM user_blocks')).rows).toHaveLength(1)
    expect((await pool.query('SELECT * FROM comment_reports')).rows).toHaveLength(1)
    expect((await (await list(viewer)).json()).map((c: { id: number }) => c.id)).toEqual([otherComment])
    expect(await (await list(viewer, 'song-2')).json()).toEqual([])
    expect(await (await list(other, 'song-2')).json()).toHaveLength(1)
    await create(author)
    expect(await (await list(viewer)).json()).toHaveLength(1)
  })

  it('keeps reports in the moderation inbox and preserves hidden content after dismissal', async () => {
    const author = await account('author')
    const viewer = await account('viewer')
    const id = await create(author)
    await act(viewer, id, 'report')
    const reports = (await pool.query('SELECT * FROM comment_reports WHERE resolved_at IS NULL')).rows
    expect(reports).toHaveLength(1)
    expect(Number(reports[0].comment_id)).toBe(id)
    expect(reports[0].action).toBe('report')
    await pool.query('UPDATE comment_reports SET resolved_at = now()')
    expect(await (await list(viewer)).json()).toEqual([])
    await pool.query('UPDATE comments SET removed_at = now() WHERE id = $1', [id])
    expect(await (await list()).json()).toEqual([])
  })
})