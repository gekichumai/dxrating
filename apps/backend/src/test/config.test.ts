import { afterEach, describe, expect, it, vi } from 'vitest'

const originalEnv = { ...process.env }

const setProductionEnvironment = (overrides: Record<string, string> = {}) => {
  process.env = {
    ...originalEnv,
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/dxrating_test',
    BETTER_AUTH_SECRET: 'test-secret',
    BETTER_AUTH_URL: 'https://miruku.dxrating.net',
    FRONTEND_URL: 'https://dxrating.net',
    PUBLIC_ADDITIONAL_TRUSTED_ORIGINS: '[]',
    ADMIN_FRONTEND_URL: 'https://admin.dxrating.net',
    ADMIN_ADDITIONAL_TRUSTED_ORIGINS: '[]',
    ADMIN_ACCESS_MODE: 'cloudflare',
    ADMIN_ACCESS_ISSUER: 'https://example-team.cloudflareaccess.com',
    ADMIN_ACCESS_AUDIENCES: JSON.stringify(['a'.repeat(64)]),
    ...overrides,
  }
  delete process.env.BETTER_AUTH_TRUSTED_ORIGINS
  delete process.env.ADMIN_ACCESS_TEST_BYPASS_SECRET
}

afterEach(() => {
  process.env = { ...originalEnv }
  vi.doUnmock('dotenv')
  vi.resetModules()
})

describe('config', () => {
  it('treats blank optional URL environment variables as unset', async () => {
    vi.doMock('dotenv', () => ({
      config: vi.fn(),
    }))
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/dxrating_test',
      BETTER_AUTH_SECRET: 'test-secret',
      BETTER_AUTH_URL: 'http://localhost:3001',
      FRONTEND_URL: 'http://localhost:5173',
      PASSKEY_RP_ID: '',
      PASSKEY_ORIGIN: '',
    }

    const { config } = await import('../config.js')

    expect(config.auth.passkey.rpID).toBeUndefined()
    expect(config.auth.passkey.origin).toBeUndefined()
  })

  it('does not let local env files override test environment variables', async () => {
    const dotenvConfig = vi.fn()
    vi.doMock('dotenv', () => ({
      config: dotenvConfig,
    }))
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/dxrating_test',
      BETTER_AUTH_SECRET: 'test-secret',
      BETTER_AUTH_URL: 'http://localhost:3001',
      FRONTEND_URL: 'http://localhost:5173',
    }

    await import('../config.js')

    expect(dotenvConfig).toHaveBeenCalledWith(expect.objectContaining({ override: false }))
  })

  it('parses and deduplicates deployment-managed super-administrator IDs', async () => {
    vi.doMock('dotenv', () => ({ config: vi.fn() }))
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/dxrating_test',
      BETTER_AUTH_SECRET: 'test-secret',
      SUPER_ADMIN_USER_IDS: '["immutable-id","immutable-id","CaseSensitive"]',
      SUPER_ADMIN_USER_IDS_EFFECTIVE_AT: '2026-08-24T00:00:00.000Z',
    }

    const { config } = await import('../config.js')

    expect(config.auth.superAdministrators.configuredUserCount).toBe(2)
    expect(config.auth.superAdministrators.hasExactUserId('immutable-id')).toBe(true)
    expect(config.auth.superAdministrators.hasExactUserId('casesensitive')).toBe(false)
  })

  it('fails closed when non-empty super-administrator IDs lack a valid UTC generation time', async () => {
    for (const effectiveAt of [undefined, 'not-a-timestamp', '2026-08-24T01:00:00+01:00']) {
      vi.doMock('dotenv', () => ({ config: vi.fn() }))
      process.env = {
        ...originalEnv,
        DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/dxrating_test',
        BETTER_AUTH_SECRET: 'test-secret',
        SUPER_ADMIN_USER_IDS: '["sensitive-id"]',
      }
      if (effectiveAt) process.env.SUPER_ADMIN_USER_IDS_EFFECTIVE_AT = effectiveAt
      else delete process.env.SUPER_ADMIN_USER_IDS_EFFECTIVE_AT

      let thrown: unknown
      try {
        await import('../config.js')
      } catch (error) {
        thrown = error
      }

      expect(String(thrown)).toContain('SUPER_ADMIN_USER_IDS_EFFECTIVE_AT must be a UTC ISO timestamp')
      expect(String(thrown)).not.toContain('sensitive-id')
      expect(String(thrown)).not.toContain(String(effectiveAt))
      vi.resetModules()
    }
  })

  it('fails closed on malformed super-administrator configuration without leaking IDs', async () => {
    vi.doMock('dotenv', () => ({ config: vi.fn() }))
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/dxrating_test',
      BETTER_AUTH_SECRET: 'test-secret',
      SUPER_ADMIN_USER_IDS: '["sensitive-id",',
    }

    let thrown: unknown
    try {
      await import('../config.js')
    } catch (error) {
      thrown = error
    }

    expect(String(thrown)).toBe(
      'InvalidSuperAdministratorAllowlistError: SUPER_ADMIN_USER_IDS must be a JSON array of non-empty immutable user ID strings',
    )
    expect(String(thrown)).not.toContain('sensitive-id')
  })

  it('normalizes and deduplicates exact administrator origins for CORS and Better Auth', async () => {
    vi.doMock('dotenv', () => ({ config: vi.fn() }))
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/dxrating_test',
      BETTER_AUTH_SECRET: 'test-secret',
      BETTER_AUTH_URL: 'http://localhost:3001',
      FRONTEND_URL: 'http://localhost:5173/',
      PUBLIC_ADDITIONAL_TRUSTED_ORIGINS: '["http://localhost:5173","https://web-pr-1.preview.dxrating.net"]',
      ADMIN_FRONTEND_URL: 'https://ADMIN.dxrating.net/',
      ADMIN_ADDITIONAL_TRUSTED_ORIGINS:
        '["https://admin.dxrating.net","http://localhost:5174","https://admin-pr-1.preview.dxrating.net"]',
      ADMIN_ACCESS_MODE: 'cloudflare',
      ADMIN_ACCESS_ISSUER: 'https://example-team.cloudflareaccess.com',
      ADMIN_ACCESS_AUDIENCES: JSON.stringify(['a'.repeat(64)]),
    }
    delete process.env.BETTER_AUTH_TRUSTED_ORIGINS
    delete process.env.ADMIN_ACCESS_TEST_BYPASS_SECRET

    const { config } = await import('../config.js')

    expect(config.admin.frontendOrigin).toBe('https://admin.dxrating.net')
    expect(config.admin.trustedOrigins).toEqual([
      'https://admin.dxrating.net',
      'http://localhost:5174',
      'https://admin-pr-1.preview.dxrating.net',
    ])
    expect(config.public.trustedOrigins).toEqual(['http://localhost:5173', 'https://web-pr-1.preview.dxrating.net'])
    expect(config.chartReports.turnstile.allowedHostnames).toEqual(['localhost', 'web-pr-1.preview.dxrating.net'])
    expect(config.browserTrustedOrigins).toEqual([
      'http://localhost:5173',
      'https://web-pr-1.preview.dxrating.net',
      'https://admin.dxrating.net',
      'http://localhost:5174',
      'https://admin-pr-1.preview.dxrating.net',
    ])
    expect(config.auth.trustedOrigins).toEqual([...config.browserTrustedOrigins, 'dxrating://'])
    expect(config.admin.access).toEqual({
      mode: 'cloudflare',
      issuer: 'https://example-team.cloudflareaccess.com',
      audiences: ['a'.repeat(64)],
    })
  })

  it('derives chart-report Turnstile hostnames only from exact public origins and keeps the secret server-side', async () => {
    vi.doMock('dotenv', () => ({ config: vi.fn() }))
    setProductionEnvironment({
      TURNSTILE_SECRET_KEY: 'server-side-turnstile-secret',
      PUBLIC_ADDITIONAL_TRUSTED_ORIGINS: '["https://DXRATING.net:8443","https://preview.dxrating.net"]',
      ADMIN_ADDITIONAL_TRUSTED_ORIGINS: '["https://admin-preview.dxrating.net"]',
    })

    const { config } = await import('../config.js')

    expect(config.chartReports.turnstile).toEqual({
      secretKey: 'server-side-turnstile-secret',
      allowedHostnames: ['dxrating.net', 'preview.dxrating.net'],
    })
    expect(config.chartReports.turnstile.allowedHostnames).not.toContain('admin.dxrating.net')
    expect(config.chartReports.turnstile.allowedHostnames).not.toContain('admin-preview.dxrating.net')
    expect(config.public.trustedOrigins).toContain('https://dxrating.net:8443')
  })

  it('derives the Cloudflare Access verifier configuration from an exact team issuer and audience list', async () => {
    vi.doMock('dotenv', () => ({ config: vi.fn() }))
    const productionAudience = 'a'.repeat(64)
    const previewAudience = 'b'.repeat(64)
    setProductionEnvironment({
      ADMIN_ACCESS_AUDIENCES: JSON.stringify([productionAudience, previewAudience]),
    })

    const { config } = await import('../config.js')

    expect(config.admin.access).toEqual({
      mode: 'cloudflare',
      issuer: 'https://example-team.cloudflareaccess.com',
      audiences: [productionAudience, previewAudience],
    })
  })

  it('requires an explicit HTTPS administrator origin in production', async () => {
    vi.doMock('dotenv', () => ({ config: vi.fn() }))
    setProductionEnvironment()
    delete process.env.ADMIN_FRONTEND_URL

    await expect(import('../config.js')).rejects.toThrow('ADMIN_FRONTEND_URL is required in production')
  })

  it.each([
    ['an HTTP production origin', { ADMIN_FRONTEND_URL: 'http://localhost:5174' }],
    ['an HTTP non-loopback origin', { ADMIN_FRONTEND_URL: 'http://admin.dxrating.net' }],
    ['a wildcard origin', { ADMIN_FRONTEND_URL: 'https://*.dxrating.net' }],
    ['a user-info origin', { ADMIN_FRONTEND_URL: 'https://user@admin.dxrating.net' }],
    ['an origin with a path', { ADMIN_FRONTEND_URL: 'https://admin.dxrating.net/admin' }],
    ['an origin with a query', { ADMIN_FRONTEND_URL: 'https://admin.dxrating.net?preview=1' }],
    ['an origin with a fragment', { ADMIN_FRONTEND_URL: 'https://admin.dxrating.net#preview' }],
    ['malformed public additional-origin JSON', { PUBLIC_ADDITIONAL_TRUSTED_ORIGINS: '["https://preview' }],
    ['malformed additional-origin JSON', { ADMIN_ADDITIONAL_TRUSTED_ORIGINS: '["https://preview' }],
  ])('fails closed for %s', async (_description, overrides) => {
    vi.doMock('dotenv', () => ({ config: vi.fn() }))
    setProductionEnvironment(overrides)

    await expect(import('../config.js')).rejects.toThrow()
  })

  it('rejects Better Auth unvalidated trusted-origin environment overrides', async () => {
    vi.doMock('dotenv', () => ({ config: vi.fn() }))
    setProductionEnvironment()
    process.env.BETTER_AUTH_TRUSTED_ORIGINS = 'https://unreviewed.example'

    await expect(import('../config.js')).rejects.toThrow('BETTER_AUTH_TRUSTED_ORIGINS')
  })

  it.each([
    ['a missing Access issuer', { ADMIN_ACCESS_ISSUER: '' }],
    ['an unrelated Access issuer', { ADMIN_ACCESS_ISSUER: 'https://access.example.com' }],
    ['an HTTP Access issuer', { ADMIN_ACCESS_ISSUER: 'http://example-team.cloudflareaccess.com' }],
    ['an Access issuer path', { ADMIN_ACCESS_ISSUER: 'https://example-team.cloudflareaccess.com/certs' }],
    ['an empty Access audience list', { ADMIN_ACCESS_AUDIENCES: '[]' }],
    ['a malformed Access audience list', { ADMIN_ACCESS_AUDIENCES: '["audience"' }],
    ['duplicate Access audiences', { ADMIN_ACCESS_AUDIENCES: JSON.stringify(['a'.repeat(64), 'a'.repeat(64)]) }],
  ])('rejects %s in production', async (_description, overrides) => {
    vi.doMock('dotenv', () => ({ config: vi.fn() }))
    setProductionEnvironment(overrides)

    await expect(import('../config.js')).rejects.toThrow()
  })

  it('rejects the Access test bypass in production', async () => {
    vi.doMock('dotenv', () => ({ config: vi.fn() }))
    setProductionEnvironment({
      ADMIN_ACCESS_MODE: 'test_bypass',
      ADMIN_ACCESS_ISSUER: '',
      ADMIN_ACCESS_AUDIENCES: '[]',
      ADMIN_ACCESS_TEST_BYPASS_SECRET: 'production-must-never-accept-this-secret',
    })

    await expect(import('../config.js')).rejects.toThrow('test_bypass mode is forbidden in production')
  })

  it('limits the test bypass to a loopback backend origin', async () => {
    vi.doMock('dotenv', () => ({ config: vi.fn() }))
    process.env = {
      ...originalEnv,
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/dxrating_test',
      BETTER_AUTH_SECRET: 'test-secret',
      BETTER_AUTH_URL: 'https://preview-backend.example.com',
      ADMIN_ACCESS_MODE: 'test_bypass',
      ADMIN_ACCESS_ISSUER: '',
      ADMIN_ACCESS_AUDIENCES: '[]',
      ADMIN_ACCESS_TEST_BYPASS_SECRET: 'development-loopback-only-bypass-secret',
    }

    await expect(import('../config.js')).rejects.toThrow(
      'test_bypass mode requires every configured web origin to be loopback',
    )
  })

  it.each([
    ['the public frontend', { FRONTEND_URL: 'https://preview.dxrating.net' }],
    ['a public additional origin', { PUBLIC_ADDITIONAL_TRUSTED_ORIGINS: '["https://preview.dxrating.net"]' }],
    ['the administrator frontend', { ADMIN_FRONTEND_URL: 'https://admin.dxrating.net' }],
    [
      'an administrator additional origin',
      { ADMIN_ADDITIONAL_TRUSTED_ORIGINS: '["https://admin-pr-307.preview.dxrating.net"]' },
    ],
  ])('rejects test-bypass configuration for non-loopback %s', async (_description, overrides) => {
    vi.doMock('dotenv', () => ({ config: vi.fn() }))
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/dxrating_test',
      BETTER_AUTH_SECRET: 'test-secret',
      BETTER_AUTH_URL: 'http://localhost:3001',
      FRONTEND_URL: 'http://localhost:5173',
      PUBLIC_ADDITIONAL_TRUSTED_ORIGINS: '[]',
      ADMIN_FRONTEND_URL: 'http://localhost:5174',
      ADMIN_ADDITIONAL_TRUSTED_ORIGINS: '[]',
      ADMIN_ACCESS_MODE: 'test_bypass',
      ADMIN_ACCESS_ISSUER: '',
      ADMIN_ACCESS_AUDIENCES: '[]',
      ADMIN_ACCESS_TEST_BYPASS_SECRET: 'test-only-loopback-access-proof-secret',
      ...overrides,
    }

    await expect(import('../config.js')).rejects.toThrow(
      'test_bypass mode requires every configured web origin to be loopback',
    )
  })

  it('accepts only the former public frontend hostname as a transitional legacy cookie domain', async () => {
    vi.doMock('dotenv', () => ({ config: vi.fn() }))
    setProductionEnvironment({ LEGACY_AUTH_COOKIE_DOMAIN: 'DXRATING.NET' })

    const { config } = await import('../config.js')
    expect(config.auth.legacyCookieDomain).toBe('dxrating.net')
  })

  it('rejects an unrelated legacy cookie deletion domain', async () => {
    vi.doMock('dotenv', () => ({ config: vi.fn() }))
    setProductionEnvironment({ LEGACY_AUTH_COOKIE_DOMAIN: 'example.net' })

    await expect(import('../config.js')).rejects.toThrow(
      'must equal the frontend hostname and be a parent of the authentication host',
    )
  })
})