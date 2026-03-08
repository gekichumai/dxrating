import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestServer, teardownTestServer, getBaseUrl } from './setup'

describe('Health & Basic Endpoints', () => {
  beforeAll(async () => {
    await setupTestServer()
  })
  afterAll(async () => {
    await teardownTestServer()
  })

  it('GET /health returns 200', async () => {
    const res = await fetch(`${getBaseUrl()}/health`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  it('GET /robots.txt returns 200', async () => {
    const res = await fetch(`${getBaseUrl()}/robots.txt`)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('User-agent')
  })

  it('GET /spec.json returns valid OpenAPI spec', async () => {
    const res = await fetch(`${getBaseUrl()}/spec.json`)
    expect(res.status).toBe(200)
    const spec = await res.json()
    expect(spec.info).toBeDefined()
    expect(spec.info.title).toBe('DXRating API')
    expect(spec.paths).toBeDefined()
  })

  it('GET /docs returns HTML page', async () => {
    const res = await fetch(`${getBaseUrl()}/docs`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('DXRating API')
  })
})
