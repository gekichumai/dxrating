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
} from './setup'

describe('Comments API', () => {
  beforeAll(async () => {
    await setupTestServer()
  })
  afterAll(async () => {
    await teardownTestServer()
  })
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('GET /api/v1/comments returns empty for unknown sheet', async () => {
    const res = await fetch(
      `${getBaseUrl()}/api/v1/comments?songId=nonexistent&sheetType=dx&sheetDifficulty=master`,
    )
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
    const listRes = await fetch(
      `${getBaseUrl()}/api/v1/comments?songId=test-song&sheetType=dx&sheetDifficulty=master`,
    )
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
    const listRes = await fetch(
      `${getBaseUrl()}/api/v1/comments?songId=song-1&sheetType=dx&sheetDifficulty=master`,
    )
    const comments = await listRes.json()
    expect(comments.length).toBe(2)
    const reply = comments.find((c: { content: string }) => c.content === 'Reply comment')
    expect(reply.parent_id).toBe(parent.id)
  })
})
