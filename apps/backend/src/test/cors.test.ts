import { describe, expect, it } from 'vitest'
import { app } from '../app'

describe('CORS', () => {
  it('allows Galvin Workers preview origins', async () => {
    const origin = 'https://dxrating-preview.galvin.workers.dev'

    const response = await app.request('/health', {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'GET',
      },
    })

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true')
  })
})
describe('CORS of the public tag and alias lists', () => {
  const origin = 'https://dxrating.net'

  for (const path of ['/api/v1/tags', '/api/v1/aliases']) {
    it(`answers a GET preflight for ${path} with * and no credentials`, async () => {
      const response = await app.request(path, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'sentry-trace, baggage, x-dxrating-client',
        },
      })

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull()
      expect(response.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain('sentry-trace')
    })
  }

  it('keeps the credentialed CORS for a POST to /api/v1/aliases', async () => {
    const response = await app.request('/api/v1/aliases', {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
    })

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true')
  })
})
describe('CORS of the v2 catalog', () => {
  it('answers a preflight for /api/v2/dxdata with * and no credentials, like v1', async () => {
    const response = await app.request('/api/v2/dxdata', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://dxrating.net',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'if-none-match',
      },
    })

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull()
  })
})
