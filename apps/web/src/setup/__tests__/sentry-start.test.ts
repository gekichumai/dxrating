import { describe, expect, it } from 'vitest'
import { sentryGlobalFunctionMiddleware, sentryGlobalRequestMiddleware } from '@sentry/tanstackstart-react'
import { buildStartOptions } from '../../start'

describe('TanStack Start Sentry integration', () => {
  it('registers Sentry before local request and function middleware', () => {
    const options = buildStartOptions()

    expect(options.requestMiddleware).toHaveLength(4)
    expect(options.functionMiddleware).toHaveLength(1)
    expect(options.requestMiddleware[0]).toBe(sentryGlobalRequestMiddleware)
    expect(options.requestMiddleware[1]).not.toBe(sentryGlobalRequestMiddleware)
    expect(options.requestMiddleware[2]).not.toBe(sentryGlobalRequestMiddleware)
    expect(options.requestMiddleware[3]).not.toBe(sentryGlobalRequestMiddleware)
    expect(options.functionMiddleware[0]).toBe(sentryGlobalFunctionMiddleware)
  })
})