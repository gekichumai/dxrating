// Global announcements (gekichumai/meta#49): the public list and the admin API behind requireAdmin.
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  authenticatedFetch,
  cleanDatabase,
  extractSessionCookie,
  getBaseUrl,
  seedAdminUser,
  setupTestServer,
  signUp,
  teardownTestServer,
} from './setup'

const HOUR = 60 * 60 * 1000

const fields = (overrides: Record<string, unknown> = {}) => ({
  severity: 'warning',
  title: { en: 'Scheduled maintenance', ja: 'メンテナンスのお知らせ' },
  body: { en: 'Imports pause for an hour.', ja: 'インポートを1時間停止します。' },
  link: { url: '/developers', label: { en: 'Details' } },
  startsAt: null,
  endsAt: null,
  platforms: [],
  regions: [],
  minAppVersion: null,
  maxAppVersion: null,
  dismissible: true,
  ...overrides,
})

describe('Announcements', () => {
  let admin: string

  const adminFetch = (path: string, init: { method: string; body?: unknown }) =>
    authenticatedFetch(`${getBaseUrl()}/api/v1${path}`, admin, {
      method: init.method,
      headers: { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  const create = async (overrides: Record<string, unknown> = {}) => {
    const res = await adminFetch('/admin/announcements', { method: 'POST', body: fields(overrides) })
    expect(res.status).toBe(200)
    return res.json()
  }
  const publicList = async () => {
    const res = await fetch(`${getBaseUrl()}/api/v1/announcements`)
    expect(res.status).toBe(200)
    return res.json()
  }

  beforeAll(async () => {
    await setupTestServer()
  })
  afterAll(async () => {
    await teardownTestServer()
  })
  beforeEach(async () => {
    await cleanDatabase()
    admin = await seedAdminUser()
  })

  it('serves an empty list with the shared locale table, cacheable at the edge', async () => {
    const res = await fetch(`${getBaseUrl()}/api/v1/announcements`, { headers: { Origin: 'https://dxrating.net' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(res.headers.get('CDN-Cache-Control')).toMatch(/^public, max-age=60, stale-while-revalidate=/)
    expect(res.headers.get('Cache-Tag')).toBe('announcements')
    const tag = res.headers.get('ETag')
    const body = await res.json()
    expect(body.announcements).toEqual([])
    expect(body.locales.supported[0]).toBe('en')
    expect(body.locales.fallbacks['zh-Hant']).toEqual(['zh-Hans'])

    const revalidated = await fetch(`${getBaseUrl()}/api/v1/announcements`, { headers: { 'If-None-Match': tag! } })
    expect(revalidated.status).toBe(304)
  })

  it('publishes what an admin creates, with every language and target', async () => {
    const created = await create({ platforms: ['ios'], regions: ['jp', 'intl'], minAppVersion: '0.2' })
    expect(created).toMatchObject({ revision: 1, severity: 'warning', createdBy: 'test-admin-user' })

    const { announcements } = await publicList()
    expect(announcements).toEqual([
      {
        id: created.id,
        revision: 1,
        severity: 'warning',
        title: { en: 'Scheduled maintenance', ja: 'メンテナンスのお知らせ' },
        body: { en: 'Imports pause for an hour.', ja: 'インポートを1時間停止します。' },
        link: { url: '/developers', label: { en: 'Details' } },
        startsAt: created.startsAt,
        endsAt: null,
        platforms: ['ios'],
        regions: ['jp', 'intl'],
        minAppVersion: '0.2',
        maxAppVersion: null,
        dismissible: true,
      },
    ])
    // Authors are not public
    expect(announcements[0]).not.toHaveProperty('createdBy')
  })

  it('lists current and soon-starting announcements, most severe first, and leaves out ended and far-future ones', async () => {
    const now = Date.now()
    const info = await create({ severity: 'info' })
    const critical = await create({ severity: 'critical', dismissible: false })
    const soon = await create({ startsAt: new Date(now + 2 * HOUR).toISOString() })
    await create({ startsAt: new Date(now + 48 * HOUR).toISOString() })
    const ended = await create({})
    await adminFetch(`/admin/announcements/${ended.id}/end`, { method: 'POST' })

    const ids = (await publicList()).announcements.map((a: { id: number }) => a.id)
    expect(ids).toEqual([critical.id, soon.id, info.id])
  })

  it('bumps the revision when the text changes, not for a new end date', async () => {
    const created = await create()
    const extended = await adminFetch(`/admin/announcements/${created.id}`, {
      method: 'PUT',
      body: fields({ endsAt: new Date(Date.now() + HOUR).toISOString() }),
    })
    expect((await extended.json()).revision).toBe(1)

    const reworded = await adminFetch(`/admin/announcements/${created.id}`, {
      method: 'PUT',
      body: fields({ title: { en: 'Maintenance extended' } }),
    })
    const body = await reworded.json()
    expect(body.revision).toBe(2)
    expect(body.title).toEqual({ en: 'Maintenance extended' })
    // A null start keeps the existing one
    expect(body.startsAt).toBe(created.startsAt)
  })

  it('ends a scheduled announcement before it ever shows', async () => {
    const scheduled = await create({ startsAt: new Date(Date.now() + HOUR).toISOString() })
    const res = await adminFetch(`/admin/announcements/${scheduled.id}/end`, { method: 'POST' })
    expect(res.status).toBe(200)
    const ended = await res.json()
    expect(Date.parse(ended.endsAt)).toBeLessThanOrEqual(Date.now())
    expect(Date.parse(ended.startsAt)).toBeLessThan(Date.parse(ended.endsAt))
    expect((await publicList()).announcements).toEqual([])
  })

  it.each([
    ['without English', { title: { ja: 'お知らせ' } }],
    ['with an unknown language tag', { title: { en: 'Hi', 'xx-YY': 'Hi' } }],
    ['with a script link', { link: { url: 'javascript:alert(1)', label: null } }],
    ['with an http link', { link: { url: 'http://example.com', label: null } }],
    ['ending before it starts', { startsAt: '2030-01-02T00:00:00Z', endsAt: '2030-01-01T00:00:00Z' }],
    ['with inverted app versions', { minAppVersion: '1.10', maxAppVersion: '1.9' }],
    ['with an unknown platform', { platforms: ['android'] }],
    ['with an unknown field', { createdBy: 'someone' }],
  ])('rejects an announcement %s', async (_case, overrides) => {
    const res = await adminFetch('/admin/announcements', { method: 'POST', body: fields(overrides) })
    expect(res.status).toBe(400)
  })

  it('drops blank translations instead of storing them', async () => {
    const created = await create({ title: { en: 'Hi', ja: '   ' }, body: { en: 'Body' } })
    expect(created.title).toEqual({ en: 'Hi' })
  })

  it('serves only supported languages and tells the admin about stored ones that are not', async () => {
    const created = await create()
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    await pool.query(`UPDATE announcements SET title = title || '{"tlh": "Qapla"}'::jsonb WHERE id = $1`, [created.id])
    await pool.end()

    expect((await publicList()).announcements[0].title).not.toHaveProperty('tlh')
    const listed = await (await adminFetch('/admin/announcements', { method: 'GET' })).json()
    expect(listed.announcements[0].unsupportedLocales).toEqual(['tlh'])
  })

  it('requires a session and an administrator for every admin route', async () => {
    const created = await create()
    const anonymous = await fetch(`${getBaseUrl()}/api/v1/admin/announcements`)
    expect(anonymous.status).toBe(401)

    const signUpRes = await signUp('viewer@example.com', 'ViewerPass123!', 'Viewer')
    const viewer = extractSessionCookie(signUpRes)
    const routes: Array<[string, string, unknown?]> = [
      ['GET', '/admin/announcements'],
      ['POST', '/admin/announcements', fields()],
      ['PUT', `/admin/announcements/${created.id}`, fields()],
      ['POST', `/admin/announcements/${created.id}/end`],
    ]
    for (const [method, path, body] of routes) {
      const res = await authenticatedFetch(`${getBaseUrl()}/api/v1${path}`, viewer, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      expect(res.status, `${method} ${path}`).toBe(403)
    }
    expect((await publicList()).announcements).toHaveLength(1)
  })

  it('answers 404 for an announcement that does not exist', async () => {
    const res = await adminFetch('/admin/announcements/999999/end', { method: 'POST' })
    expect(res.status).toBe(404)
  })

  it('keeps admin routes out of the public API document', async () => {
    const specResponse = await fetch(`${getBaseUrl()}/spec.json`)
    const spec = await specResponse.json()
    if (!spec.paths) throw new Error(`spec: ${specResponse.status} ${JSON.stringify(spec).slice(0, 400)}`)
    const paths = Object.keys(spec.paths)
    expect(paths.some((path) => path.includes('/announcements') && !path.includes('admin'))).toBe(true)
    expect(paths.some((path) => path.includes('admin'))).toBe(false)
  })
})