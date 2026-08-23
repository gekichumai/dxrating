import { describe, expect, it } from 'vitest'
import {
  ExactWebOriginListSchema,
  isAllowedExactOrigin,
  isLoopbackHostname,
  normalizeExactWebOrigin,
  uniqueOrigins,
} from './origin-policy.js'

describe('exact web origin policy', () => {
  it('normalizes exact HTTP and HTTPS origins without broadening them', () => {
    expect(normalizeExactWebOrigin('https://ADMIN.dxrating.net/')).toBe('https://admin.dxrating.net')
    expect(normalizeExactWebOrigin('http://localhost:5174')).toBe('http://localhost:5174')
    expect(normalizeExactWebOrigin('https://preview.dxrating.net:8443')).toBe('https://preview.dxrating.net:8443')
  })

  it.each([
    'dxrating://admin',
    'https://user@admin.dxrating.net',
    'https://user:password@admin.dxrating.net',
    'https://admin.dxrating.net/path',
    'https://admin.dxrating.net?next=/admin',
    'https://admin.dxrating.net#admin',
    'https://*.dxrating.net',
    'not-a-url',
  ])('rejects non-origin or pattern value %s', (value) => {
    expect(() => normalizeExactWebOrigin(value)).toThrow()
  })

  it('parses explicit JSON origin arrays and keeps authorization exact', () => {
    const origins = ExactWebOriginListSchema.parse(
      '["https://admin-pr-1.preview.dxrating.net","http://localhost:5174"]',
    )
    const unique = uniqueOrigins([...origins, origins[0]!])
    const allowed = new Set(unique)

    expect(unique).toEqual(['https://admin-pr-1.preview.dxrating.net', 'http://localhost:5174'])
    expect(isAllowedExactOrigin('https://admin-pr-1.preview.dxrating.net', allowed)).toBe(true)
    expect(isAllowedExactOrigin('https://admin-pr-1.preview.dxrating.net.evil.example', allowed)).toBe(false)
    expect(isAllowedExactOrigin(undefined, allowed)).toBe(false)
  })

  it('recognizes only explicit loopback hostnames for development HTTP', () => {
    expect(isLoopbackHostname('localhost')).toBe(true)
    expect(isLoopbackHostname('admin.localhost')).toBe(true)
    expect(isLoopbackHostname('127.0.0.1')).toBe(true)
    expect(isLoopbackHostname('127.9.8.7')).toBe(true)
    expect(isLoopbackHostname('[::1]')).toBe(true)
    expect(isLoopbackHostname('127.evil.example')).toBe(false)
    expect(isLoopbackHostname('127.999.0.1')).toBe(false)
    expect(isLoopbackHostname('localhost.evil.example')).toBe(false)
  })
})