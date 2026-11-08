import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// The default deployment: no cloud save settings at all.
vi.hoisted(() => {
  delete process.env.CLOUD_SAVE_MODE
  delete process.env.CLOUD_SAVE_ALLOWLIST_EMAILS
  delete process.env.SERVER_IMPORTS
})

import { app } from '../app'
import { config } from '../config'
import {
  authenticatedFetch,
  cleanDatabase,
  extractSessionCookie,
  getBaseUrl,
  setupTestServer,
  signIn,
  signUp,
  teardownTestServer,
} from './setup'

const PRIVATE_PATHS = ['/me/features', '/me/features/cloud-save/opt-in']

describe('feature flags (default settings)', () => {
  beforeAll(async () => {
    await setupTestServer()
    await cleanDatabase()
  })

  afterAll(teardownTestServer)

  it('defaults to cloud save and server imports off', () => {
    expect(config.featureFlags).toEqual({ cloudSaveMode: 'off', cloudSaveAllowlistEmails: [], serverImports: false })
  })

  it('reports every feature off and hides the opt-in route', async () => {
    await signUp('flags-off@example.com', 'password123', 'Flags Off')
    const cookie = extractSessionCookie(await signIn('flags-off@example.com', 'password123'))

    const response = await authenticatedFetch(`${getBaseUrl()}/api/v1/me/features`, cookie)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ cloudSave: false, serverImports: false, optInAvailable: false })

    const optIn = await authenticatedFetch(`${getBaseUrl()}/api/v1/me/features/cloud-save/opt-in`, cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consentVersion: '2026-11-01' }),
    })
    expect(optIn.status).toBe(404)
    expect(await optIn.json()).toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })

  it('keeps the private routes out of every public API description', async () => {
    const spec = await app.request('https://miruku.dxrating.net/spec.json')
    expect(spec.status).toBe(200)
    const document = (await spec.json()) as { paths: Record<string, unknown>; tags?: Array<{ name: string }> }
    expect(Object.keys(document.paths).length).toBeGreaterThan(0)
    for (const path of PRIVATE_PATHS) expect(document.paths).not.toHaveProperty(path)
    const serialized = JSON.stringify(document)
    expect(serialized).not.toContain('/me/features')
    expect(serialized).not.toContain('cloud-save')
    expect(serialized).not.toContain('"internal"')

    const text = async (url: string, init?: RequestInit) => (await app.request(url, init)).text()
    const descriptions = await Promise.all([
      text('https://miruku.dxrating.net/.well-known/api-catalog'),
      text('https://mcp.dxrating.net/llms.txt', { headers: { host: 'mcp.dxrating.net' } }),
      text('https://mcp.dxrating.net/', { headers: { host: 'mcp.dxrating.net', accept: 'text/markdown' } }),
    ])
    for (const description of descriptions) {
      expect(description.length).toBeGreaterThan(0)
      expect(description).not.toContain('/me/features')
      expect(description).not.toContain('cloud-save')
    }
  })
})