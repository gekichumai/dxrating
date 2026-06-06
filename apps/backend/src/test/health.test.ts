import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestServer, teardownTestServer, getBaseUrl } from './setup.js'

const API_CATALOG_PROFILE_URL = 'https://www.rfc-editor.org/info/rfc9727'

const expectApiCatalogContentType = (contentType: string | null) => {
  expect(contentType).not.toBeNull()

  const [mediaType, ...parameters] = contentType!.split(';').map((value) => value.trim())
  expect(mediaType).toBe('application/linkset+json')
  expect(parameters).toContain(`profile="${API_CATALOG_PROFILE_URL}"`)
}

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
    expectApiCatalogContentType(res.headers.get('content-type'))
    expect(res.headers.get('vary')).toContain('Host')
    expect(res.headers.get('vary')).toContain('X-Forwarded-Host')
    expect(res.headers.get('vary')).toContain('X-Forwarded-Proto')

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

  it('GET /.well-known/api-catalog uses valid forwarded origin headers', async () => {
    const res = await fetch(`${getBaseUrl()}/.well-known/api-catalog`, {
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'api.example.com',
      },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.linkset[0].anchor).toBe('https://api.example.com/api/v1')
  })

  it('GET /.well-known/api-catalog ignores invalid forwarded origin headers', async () => {
    const res = await fetch(`${getBaseUrl()}/.well-known/api-catalog`, {
      headers: {
        'x-forwarded-proto': 'ftp',
        'x-forwarded-host': 'bad host/path',
      },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.linkset[0].anchor).toBe(`${getBaseUrl()}/api/v1`)
  })

  it('HEAD /.well-known/api-catalog exposes api-catalog link metadata', async () => {
    const res = await fetch(`${getBaseUrl()}/.well-known/api-catalog`, { method: 'HEAD' })
    expect(res.status).toBe(200)
    expectApiCatalogContentType(res.headers.get('content-type'))

    const linkHeader = res.headers.get('link')
    expect(linkHeader).toContain('</.well-known/api-catalog>')
    expect(linkHeader).toContain('rel="api-catalog"')
    expect(linkHeader).toContain('type="application/linkset+json"')
    expect(linkHeader).toContain(`profile="${API_CATALOG_PROFILE_URL}"`)
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