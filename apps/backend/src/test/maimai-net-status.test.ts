import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getBaseUrl, setupTestServer, teardownTestServer } from './setup'

// SEGA is never contacted: the probe is replaced; this checks the route, its anonymous access and the 5-minute cache
const { probe } = vi.hoisted(() => ({ probe: vi.fn<(region: 'intl' | 'jp') => 'ok' | 'maintenance' | 'unknown'>() }))
vi.mock('../lib/functions/client', async (original) => {
  const actual = await original<typeof import('../lib/functions/client')>()
  const { Effect } = await import('effect')
  return { ...actual, netGatewayStatusEffect: (region: 'intl' | 'jp') => Effect.sync(() => probe(region)) }
})

describe('GET /api/v1/io/import/maimai-net/status', () => {
  beforeAll(async () => {
    await setupTestServer()
  })

  afterAll(async () => {
    await teardownTestServer()
  })

  it('reports each region anonymously and checks SEGA at most once per cache period', async () => {
    probe.mockImplementation((region) => (region === 'intl' ? 'maintenance' : 'ok'))
    const read = async () => {
      const response = await fetch(`${getBaseUrl()}/api/v1/io/import/maimai-net/status`)
      expect(response.status).toBe(200)
      return (await response.json()) as Record<'intl' | 'jp', { status: string; checkedAt: string }>
    }

    const first = await read()
    expect(first.intl.status).toBe('maintenance')
    expect(first.jp.status).toBe('ok')
    expect(Number.isNaN(Date.parse(first.intl.checkedAt))).toBe(false)

    const second = await read()
    expect(second).toEqual(first)
    expect(probe).toHaveBeenCalledTimes(2)
  })
})