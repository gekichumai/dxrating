import { Hono } from 'hono'
import { initLogger, type RequestLogger } from 'evlog'
import { describe, expect, it, vi } from 'vitest'
import type { AppEnvironment } from './request-context.js'
import { createRequestErrorHandler } from './request-error-handler.js'

const SAFE_REQUEST_ID = '18d7118c-ec70-4603-9176-cffea8a6cd8f'

const createFailureProbeApp = (requestId: string | undefined) => {
  const rawLog = vi.fn((_error: unknown) => undefined)
  const captureException = vi.fn((_error: unknown, _requestId: string | undefined) => undefined)
  const reportAdminException = vi.fn((_procedureName: string, _requestId: string | undefined) => undefined)
  const testApp = new Hono<AppEnvironment>()

  testApp.use('*', async (context, next) => {
    if (requestId !== undefined) context.set('requestId', requestId)
    context.set('log', {
      error: rawLog,
      getContext: () => ({ requestId }),
    } as unknown as RequestLogger)
    await next()
  })
  testApp.onError(createRequestErrorHandler({ captureException, reportAdminException }))

  return { testApp, rawLog, captureException, reportAdminException }
}

describe('global administrator error privacy', () => {
  it.each([
    ['a generated correlation ID', SAFE_REQUEST_ID, SAFE_REQUEST_ID],
    ['an unsafe correlation value', 'private moderation reason in request ID', undefined],
  ])('sanitizes %s without forwarding the privileged error to raw sinks', async (_case, requestId, expectedId) => {
    initLogger({ silent: true })
    const targetUserId = 'private-target-user-528917'
    const reason = 'private moderation reason 194862'
    const privilegedError = new Error(`${reason}; target=${targetUserId}`)
    const { testApp, rawLog, captureException, reportAdminException } = createFailureProbeApp(requestId)

    testApp.get('/api/admin/users/:targetUserId', () => {
      throw privilegedError
    })

    const response = await testApp.request(`/api/admin/users/${targetUserId}`)
    const responseText = await response.text()

    expect(response.status).toBe(500)
    expect(JSON.parse(responseText)).toMatchObject({
      defined: true,
      code: 'INTERNAL_SERVER_ERROR',
      data: { requestId: expectedId ?? null },
    })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('CDN-Cache-Control')).toBe('no-store')
    expect(response.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store')
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(responseText).not.toContain(targetUserId)
    expect(responseText).not.toContain(reason)

    expect(rawLog).not.toHaveBeenCalled()
    expect(captureException).not.toHaveBeenCalled()
    expect(reportAdminException).toHaveBeenCalledOnce()
    expect(reportAdminException).toHaveBeenCalledWith('handler', expectedId)
    expect(JSON.stringify(reportAdminException.mock.calls)).not.toContain(targetUserId)
    expect(JSON.stringify(reportAdminException.mock.calls)).not.toContain(reason)
  })
})