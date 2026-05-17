import { describe, expect, it, vi } from 'vitest'

vi.mock('dotenv', () => ({
  config: vi.fn(),
}))

const { deriveCrossSubDomainCookieDomain } = await import('../config.js')

describe('auth cookie options', () => {
  it('derives the parent domain from FRONTEND_URL when the auth host is a subdomain', () => {
    expect(
      deriveCrossSubDomainCookieDomain({
        authURL: 'https://miruku.dxrating.net',
        frontendURL: 'https://dxrating.net',
      }),
    ).toBe('dxrating.net')
  })

  it('does not enable cross-subdomain cookies when hosts are already the same', () => {
    expect(
      deriveCrossSubDomainCookieDomain({
        authURL: 'http://localhost:3000',
        frontendURL: 'http://localhost:5173',
      }),
    ).toBeUndefined()
  })

  it('does not derive a cookie domain for unrelated hosts', () => {
    expect(
      deriveCrossSubDomainCookieDomain({
        authURL: 'https://api.example.com',
        frontendURL: 'https://dxrating.net',
      }),
    ).toBeUndefined()
  })
})