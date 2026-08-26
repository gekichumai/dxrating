import { describe, expect, it } from 'vitest'
import { DEFAULT_ADMIN_BACKEND_ORIGIN, resolveAdminBackendOrigin, validateAdminBackendOrigin } from './backend-origin'

describe('administrator backend origin', () => {
  it.each(['development', 'test'])('uses the loopback fallback in %s', (mode) => {
    expect(resolveAdminBackendOrigin({ mode })).toBe(DEFAULT_ADMIN_BACKEND_ORIGIN)
    expect(resolveAdminBackendOrigin({ mode, configuredOrigin: '  ' })).toBe(DEFAULT_ADMIN_BACKEND_ORIGIN)
  })

  it.each(['production', 'preview', 'staging'])('fails closed without an origin in %s', (mode) => {
    expect(() => resolveAdminBackendOrigin({ mode })).toThrow(
      'VITE_BACKEND_URL is required outside development and test',
    )
  })

  it('normalizes exact origins without retaining a trailing slash', () => {
    expect(validateAdminBackendOrigin(' https://api.dxrating.net/ ', 'production')).toBe('https://api.dxrating.net')
    expect(validateAdminBackendOrigin('http://localhost:3001/', 'development')).toBe('http://localhost:3001')
    expect(validateAdminBackendOrigin('http://127.0.0.1:3001', 'test')).toBe('http://127.0.0.1:3001')
    expect(validateAdminBackendOrigin('http://127.20.30.40:3001', 'test')).toBe('http://127.20.30.40:3001')
    expect(validateAdminBackendOrigin('http://[::1]:3001', 'test')).toBe('http://[::1]:3001')
    expect(validateAdminBackendOrigin('http://admin.localhost:3001', 'development')).toBe('http://admin.localhost:3001')
  })

  it.each([
    'not a URL',
    '/relative',
    'ftp://api.dxrating.net',
    'https://api.dxrating.net/admin',
    'https://api.dxrating.net/a/..',
    'https://api.dxrating.net/%2e',
    'https://api.dxrating.net/foo/%2e%2e',
    'https://api.dxrating.net/?target=admin',
    'https://api.dxrating.net/#admin',
    'https://api.dxrating.net/?',
    'https://api.dxrating.net/#',
    'https://*.dxrating.net',
    'https://user@api.dxrating.net',
    'https://user:password@api.dxrating.net',
  ])('rejects non-origin value %s', (value) => {
    expect(() => validateAdminBackendOrigin(value, 'development')).toThrow(
      'VITE_BACKEND_URL must be an exact HTTP or HTTPS origin',
    )
  })

  it.each(['http://api.dxrating.net', 'http://localhost.evil.example', 'http://127.0.0.1.example'])(
    'rejects insecure non-loopback origin %s',
    (value) => {
      expect(() => validateAdminBackendOrigin(value, 'development')).toThrow(
        'VITE_BACKEND_URL may use HTTP only with an exact loopback origin',
      )
    },
  )

  it.each(['production', 'preview', 'staging'])('requires HTTPS in %s even for a loopback configuration', (mode) => {
    expect(() => validateAdminBackendOrigin('http://localhost:3000', mode)).toThrow(
      'VITE_BACKEND_URL must use HTTPS outside development and test',
    )
  })
})