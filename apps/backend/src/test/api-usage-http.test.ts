import { beforeAll, describe, expect, it, vi } from 'vitest'

const count = vi.hoisted(() => vi.fn())

vi.mock('@sentry/node', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sentry/node')>()
  return { ...original, metrics: { ...original.metrics, count, gauge: vi.fn() } }
})

import { getBaseUrl, setupTestServer, teardownTestServer } from './setup'

describe('API usage accounting over HTTP', () => {
  beforeAll(async () => {
    await setupTestServer()
  })

  it('rolls requests up by executed route and caller, and flushes them on shutdown', async () => {
    const iosAgent = 'dxrating-ios/2026091902 CFNetwork/3826.500.131 Darwin/25.0.0'
    await fetch(`${getBaseUrl()}/api/v1/tags`, { headers: { 'User-Agent': iosAgent } })
    await fetch(`${getBaseUrl()}/api/v1/tags`, { headers: { 'User-Agent': iosAgent } })
    await fetch(`${getBaseUrl()}/api/v1/dxdata`, {
      method: 'HEAD',
      headers: { Origin: 'https://tools.example.com', 'User-Agent': 'curl/8.7.1', 'X-DXRating-Client': 'Tools/1.0' },
    })
    await fetch(`${getBaseUrl()}/health`)
    await fetch(`${getBaseUrl()}/no-such-route`, { headers: { Referer: 'https://dxrating.net/search?q=secret' } })

    await teardownTestServer()

    const requests = count.mock.calls
      .filter(([name]) => name === 'api.requests')
      .map(([, value, options]) => ({ value, ...options?.attributes }))

    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: 2,
          route: '/api/v1/tags',
          method: 'GET',
          status: '200',
          caller: 'none',
          ua_class: 'dxrating_ios',
          client_id: 'none',
        }),
        expect.objectContaining({
          value: 1,
          route: '/api/v1/dxdata',
          method: 'HEAD',
          caller: 'tools.example.com',
          ua_class: 'cli',
          client_id: 'tools/1.0',
        }),
        expect.objectContaining({ value: 1, route: 'unmatched', status: '404', caller: 'dxrating_web' }),
      ]),
    )
    expect(requests.some((r) => r.route === '/health')).toBe(false)
  })
})