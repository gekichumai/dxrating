import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestServer, teardownTestServer, getBaseUrl } from './setup.js'

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

  it('GET /.well-known/api-catalog returns RFC 9727 linkset JSON', async () => {
    const res = await fetch(`${getBaseUrl()}/.well-known/api-catalog`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(
      'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
    )

    const body = await res.json()
    expect(body).toEqual({
      linkset: [
        {
          anchor: `${getBaseUrl()}/api/v1`,
          'service-desc': [
            {
              href: `${getBaseUrl()}/spec.json`,
              type: 'application/json',
            },
          ],
          'service-doc': [
            {
              href: `${getBaseUrl()}/docs`,
              type: 'text/html',
            },
          ],
          status: [
            {
              href: `${getBaseUrl()}/health`,
              type: 'application/json',
            },
          ],
        },
      ],
    })
  })

  it('HEAD /.well-known/api-catalog exposes api-catalog link metadata', async () => {
    const res = await fetch(`${getBaseUrl()}/.well-known/api-catalog`, { method: 'HEAD' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(
      'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
    )
    expect(res.headers.get('link')).toBe(
      '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"; profile="https://www.rfc-editor.org/info/rfc9727"',
    )
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

  it('GET /version returns build metadata', async () => {
    const res = await fetch(`${getBaseUrl()}/version`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('commit')
    expect(body).toHaveProperty('version')
    expect(body).toHaveProperty('builtAt')
    expect(body).toHaveProperty('attestation')
  })
})