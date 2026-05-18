import { describe, expect, it } from 'vitest'
import { app } from '../app.js'

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