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

describe('Aliases API', () => {
  beforeAll(async () => {
    await setupTestServer()
  })
  afterAll(async () => {
    await teardownTestServer()
  })
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('GET /api/v1/aliases returns empty when no data', async () => {
    const res = await fetch(`${getBaseUrl()}/api/v1/aliases`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  it('GET /api/v1/aliases sends an ETag and answers a matching If-None-Match with 304', async () => {
    const res = await fetch(`${getBaseUrl()}/api/v1/aliases`)
    const tag = res.headers.get('ETag')
    expect(tag).toBeTruthy()
    await res.arrayBuffer()

    const revalidated = await fetch(`${getBaseUrl()}/api/v1/aliases`, { headers: { 'If-None-Match': tag! } })
    expect(revalidated.status).toBe(304)
  })

  it('GET /api/v1/aliases is public and cacheable at the edge, also in a 304', async () => {
    const res = await fetch(`${getBaseUrl()}/api/v1/aliases`, {
      headers: { Origin: 'https://dxrating.net' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull()
    expect(res.headers.get('Vary') ?? '').not.toMatch(/origin/i)
    expect(res.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(res.headers.get('CDN-Cache-Control')).toMatch(/^public, max-age=60, stale-while-revalidate=/)
    expect(res.headers.get('Cache-Tag')).toBe('aliases')
    const tag = res.headers.get('ETag')
    await res.arrayBuffer()

    const revalidated = await fetch(`${getBaseUrl()}/api/v1/aliases`, {
      headers: { Origin: 'https://dxrating.net', 'If-None-Match': tag! },
    })
    expect(revalidated.status).toBe(304)
    expect(revalidated.headers.get('CDN-Cache-Control')).toBe(res.headers.get('CDN-Cache-Control'))
    expect(revalidated.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('POST /api/v1/aliases requires authentication', async () => {
    const res = await fetch(`${getBaseUrl()}/api/v1/aliases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: 'test-song',
        name: 'test alias',
      }),
    })
    expect(res.status).not.toBe(200)
  })

  it('authenticated user can create and list aliases', async () => {
    await signUp('aliaser@example.com', 'password123', 'Aliaser')
    const loginRes = await signIn('aliaser@example.com', 'password123')
    const cookie = extractSessionCookie(loginRes)

    // Create alias
    const createRes = await authenticatedFetch(`${getBaseUrl()}/api/v1/aliases`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: 'test-song',
        name: 'my alias',
      }),
    })
    expect(createRes.status).toBe(200)
    const created = await createRes.json()
    expect(created.id).toBeDefined()

    // List aliases
    const listRes = await fetch(`${getBaseUrl()}/api/v1/aliases`)
    expect(listRes.status).toBe(200)
    const aliases = await listRes.json()
    expect(aliases.length).toBe(1)
    expect(aliases[0].song_id).toBe('test-song')
    expect(aliases[0].name).toBe('my alias')
  })

  it('can create multiple aliases for the same song', async () => {
    await signUp('multi@example.com', 'password123', 'Multi')
    const loginRes = await signIn('multi@example.com', 'password123')
    const cookie = extractSessionCookie(loginRes)

    await authenticatedFetch(`${getBaseUrl()}/api/v1/aliases`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId: 'song-1', name: 'alias-1' }),
    })
    await authenticatedFetch(`${getBaseUrl()}/api/v1/aliases`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId: 'song-1', name: 'alias-2' }),
    })

    const listRes = await fetch(`${getBaseUrl()}/api/v1/aliases`)
    const aliases = await listRes.json()
    expect(aliases.length).toBe(2)
  })

  it('lists an alias submitted twice for a song once', async () => {
    await signUp('twice@example.com', 'password123', 'Twice')
    const cookie = extractSessionCookie(await signIn('twice@example.com', 'password123'))
    for (let i = 0; i < 2; i++) {
      await authenticatedFetch(`${getBaseUrl()}/api/v1/aliases`, cookie, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId: 'song-1', name: 'same alias' }),
      })
    }

    const aliases = await (await fetch(`${getBaseUrl()}/api/v1/aliases`)).json()
    expect(aliases).toEqual([{ song_id: 'song-1', name: 'same alias' }])
  })
})