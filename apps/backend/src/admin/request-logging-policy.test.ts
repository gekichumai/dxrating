import { ADMIN_CONTRACT_COMPATIBILITY_ID, ADMIN_CONTRACT_HEADER } from '@gekichumai/admin-contract'
import { Hono, type Context } from 'hono'
import { evlog, type EvlogVariables } from 'evlog/hono'
import { initLogger, type DrainContext } from 'evlog'
import { describe, expect, it, vi } from 'vitest'
import { app } from '../app.js'
import { TEST_ADMIN_ACCESS_HEADERS } from '../test/admin-access.js'
import { ADMIN_GENERIC_REQUEST_LOG_EXCLUSIONS } from './request-logging-policy.js'

const sentryMetricCount = vi.hoisted(() => vi.fn())

vi.mock('../lib/functions/sentry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/functions/sentry.js')>()
  return {
    ...actual,
    Sentry: {
      ...actual.Sentry,
      metrics: {
        ...actual.Sentry.metrics,
        count: sentryMetricCount,
      },
    },
  }
})

const createPrivacyProbeApp = (drain: (context: DrainContext) => void | Promise<void>) => {
  const testApp = new Hono<EvlogVariables>()

  testApp.use(
    '*',
    evlog({
      drain,
      exclude: [...ADMIN_GENERIC_REQUEST_LOG_EXCLUSIONS],
    }),
  )

  const recordSensitiveContext = async (context: Context<EvlogVariables>) => {
    const input = await context.req.json<{ reason: string }>()
    context.get('log')?.set({ moderation: { reason: input.reason } })
    return context.json({ accepted: true })
  }

  testApp.post('/api/admin', recordSensitiveContext)
  testApp.post('/api/admin/users/:targetUserId/ban', recordSensitiveContext)
  testApp.post('/api/v1/users/:targetUserId/ban', recordSensitiveContext)

  return testApp
}

describe('administrator generic request logging privacy', () => {
  it('keeps administrator target IDs and moderation reasons out of the structured-log drain', async () => {
    initLogger({ silent: true })
    const drain = vi.fn((_context: DrainContext) => undefined)
    const testApp = createPrivacyProbeApp(drain)
    const targetUserId = 'private-target-user-819274'
    const reason = 'private moderation reason 592816'
    const request = (path: string) =>
      testApp.request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })

    expect((await request(`/api/v1/users/${targetUserId}/ban`)).status).toBe(200)
    expect(drain).toHaveBeenCalledOnce()
    expect(JSON.stringify(drain.mock.calls)).toContain(targetUserId)
    expect(JSON.stringify(drain.mock.calls)).toContain(reason)

    drain.mockClear()

    expect((await request(`/api/admin/users/${targetUserId}/ban`)).status).toBe(200)
    expect((await request('/api/admin')).status).toBe(200)
    expect(drain).not.toHaveBeenCalled()
  })

  it('keeps the real admin correlation ID consistent and emits the sanitized authorization counter directly', async () => {
    sentryMetricCount.mockClear()

    const accessDeniedResponse = await app.request('/api/admin/bootstrap')
    const response = await app.request('/api/admin/bootstrap', {
      headers: {
        ...TEST_ADMIN_ACCESS_HEADERS,
        [ADMIN_CONTRACT_HEADER]: ADMIN_CONTRACT_COMPATIBILITY_ID,
      },
    })

    const accessDeniedBody = (await accessDeniedResponse.json()) as { data: { requestId: string | null } }
    const accessDeniedRequestId = accessDeniedResponse.headers.get('X-DXRating-Request-ID')
    const responseBody = (await response.json()) as { data: { requestId: string | null } }
    const responseRequestId = response.headers.get('X-DXRating-Request-ID')

    expect(accessDeniedResponse.status).toBe(403)
    expect(accessDeniedRequestId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(accessDeniedBody.data.requestId).toBe(accessDeniedRequestId)
    expect(response.status).toBe(401)
    expect(responseRequestId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(responseBody.data.requestId).toBe(responseRequestId)
    expect(sentryMetricCount.mock.calls).toContainEqual([
      'admin.authorization.result',
      1,
      { attributes: { procedure: 'bootstrap', result: 'UNAUTHENTICATED' } },
    ])
  })
})