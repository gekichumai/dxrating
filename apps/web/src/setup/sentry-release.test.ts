import { describe, expect, it } from 'vitest'
import { resolveSentryRelease } from './sentry-release'

describe('resolveSentryRelease', () => {
  it('keeps CI production and preview releases', () => {
    expect(resolveSentryRelease({ CI: 'true', SENTRY_RELEASE: 'dxrating@v1.7.20' })).toBe('dxrating@v1.7.20')
    const preview = 'dxrating@pr-505+ff473ca2b1c3d4e5f60718293a4b5c6d7e8f9012'
    expect(resolveSentryRelease({ CI: 'true', SENTRY_RELEASE: preview })).toBe(preview)
  })

  it('turns Sentry off for local builds', () => {
    expect(resolveSentryRelease({})).toBe('')
    expect(resolveSentryRelease({ SENTRY_RELEASE: 'dxrating@v1.7.20' })).toBe('')
    expect(resolveSentryRelease({ CI: 'true' })).toBe('')
    expect(resolveSentryRelease({ CI: 'true', SENTRY_RELEASE: 'ff473ca2b1c3d4e5f60718293a4b5c6d7e8f9012' })).toBe('')
  })
})