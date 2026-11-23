import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/dxrating_test'
const DEV_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/dxrating'
const originalEnv = { ...process.env }
let workingDirectory: string

const loadConfig = async (env: Record<string, string>, envLocal = '') => {
  writeFileSync(join(workingDirectory, '.env.local'), envLocal)
  vi.spyOn(process, 'cwd').mockReturnValue(workingDirectory)
  process.env = {
    ...originalEnv,
    DATABASE_URL: TEST_DATABASE_URL,
    BETTER_AUTH_SECRET: 'test-secret',
    BETTER_AUTH_URL: 'http://localhost:3001',
    FRONTEND_URL: 'http://localhost:5173',
    ...env,
  }
  return (await import('../config')).config
}

beforeEach(() => {
  workingDirectory = mkdtempSync(join(tmpdir(), 'dxrating-config-'))
})

afterEach(() => {
  process.env = { ...originalEnv }
  vi.restoreAllMocks()
  vi.resetModules()
  rmSync(workingDirectory, { recursive: true, force: true })
})

describe('config', () => {
  it('treats blank optional URL environment variables as unset', async () => {
    const config = await loadConfig({ PASSKEY_RP_ID: '', PASSKEY_ORIGIN: '' })

    expect(config.auth.passkey.rpID).toBeUndefined()
    expect(config.auth.passkey.origin).toBeUndefined()
  })

  it('lets .env.local override the environment outside tests', async () => {
    const config = await loadConfig({ NODE_ENV: 'development' }, `DATABASE_URL=${DEV_DATABASE_URL}\n`)

    expect(config.databaseUrl).toBe(DEV_DATABASE_URL)
  })

  it('does not let .env.local override the test environment', async () => {
    const config = await loadConfig({ NODE_ENV: 'test' }, `DATABASE_URL=${DEV_DATABASE_URL}\n`)

    expect(config.databaseUrl).toBe(TEST_DATABASE_URL)
  })
})