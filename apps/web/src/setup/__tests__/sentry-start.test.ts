import { afterEach, describe, expect, it, vi } from 'vitest'
import { sentryGlobalFunctionMiddleware, sentryGlobalRequestMiddleware } from '@sentry/tanstackstart-react'
import { buildStartOptions } from '../../start'

describe('TanStack Start Sentry integration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('registers Sentry before local request and function middleware on the server', () => {
    vi.stubEnv('SSR', true)
    const options = buildStartOptions()

    expect(options.requestMiddleware).toHaveLength(4)
    expect(options.functionMiddleware).toHaveLength(1)
    expect(options.requestMiddleware[0]).toBe(sentryGlobalRequestMiddleware)
    expect(options.requestMiddleware[1]).not.toBe(sentryGlobalRequestMiddleware)
    expect(options.requestMiddleware[2]).not.toBe(sentryGlobalRequestMiddleware)
    expect(options.requestMiddleware[3]).not.toBe(sentryGlobalRequestMiddleware)
    expect(options.functionMiddleware[0]).toBe(sentryGlobalFunctionMiddleware)
  })

  // The browser build must not import the SDK statically: an ad blocker that blocks it would stop hydration
  it('leaves Sentry out of the browser middleware', () => {
    vi.stubEnv('SSR', false)
    const options = buildStartOptions()

    expect(options.requestMiddleware).toHaveLength(3)
    expect(options.requestMiddleware).not.toContain(sentryGlobalRequestMiddleware)
    expect(options.functionMiddleware).toHaveLength(0)
  })
})