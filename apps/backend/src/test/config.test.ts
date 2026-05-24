import { afterEach, describe, expect, it, vi } from 'vitest'

const originalEnv = { ...process.env }

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
})