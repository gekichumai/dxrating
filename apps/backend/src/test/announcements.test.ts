// Global announcements (gekichumai/meta#49): the public list. The admin API (apps/admin, meta#50) is the only writer,
// so these tests write rows directly.
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, getBaseUrl, setupTestServer, teardownTestServer } from './setup'

const HOUR = 60 * 60 * 1000

interface Row {
  severity?: string
  title?: Record<string, string>
  body?: Record<string, string>
  link_url?: string | null
  link_label?: Record<string, string> | null
  starts_at?: Date
  ends_at?: Date | null
  platforms?: string[]
  regions?: string[]
  min_app_version?: string | null
  max_app_version?: string | null
  dismissible?: boolean
  created_by?: string
}

describe('Announcements', () => {
  let pool: pg.Pool

  const insert = async (row: Row = {}): Promise<number> => {
    const values = {
      severity: 'warning',
      title: { en: 'Scheduled maintenance', ja: 'メンテナンスのお知らせ' },
      body: { en: 'Imports pause for an hour.', ja: 'インポートを1時間停止します。' },
      link_url: '/developers',
      link_label: { en: 'Details' },
      starts_at: new Date(Date.now() - HOUR),
      ends_at: null,
      platforms: [],
      regions: [],
      min_app_version: null,
      max_app_version: null,
      dismissible: true,
      created_by: 'human:demo-admin',
      ...row,
    }
    const result = await pool.query<{ id: string }>(
      `INSERT INTO announcements (severity, title, body, link_url, link_label, starts_at, ends_at, platforms, regions,
         min_app_version, max_app_version, dismissible, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13) RETURNING id`,
      [
        values.severity,
        values.title,
        values.body,
        values.link_url,
        values.link_label,
        values.starts_at,
        values.ends_at,
        values.platforms,
        values.regions,
        values.min_app_version,
        values.max_app_version,
        values.dismissible,
        values.created_by,
      ],
    )
    return Number(result.rows[0].id)
  }

  const publicList = async () => {
    const res = await fetch(`${getBaseUrl()}/api/v1/announcements`)
    expect(res.status).toBe(200)
    return res.json()
  }

  beforeAll(async () => {
    await setupTestServer()
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  })
  afterAll(async () => {
    await pool.end()
    await teardownTestServer()
  })
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('serves an empty list with the shared locale table, cacheable at the edge', async () => {
    const res = await fetch(`${getBaseUrl()}/api/v1/announcements`, { headers: { Origin: 'https://dxrating.net' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull()
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
    expect(revalidated.headers.get('Cache-Tag')).toBe('announcements')
  })

  it('serves every language and target, and keeps authors private', async () => {
    const startsAt = new Date(Date.now() - HOUR)
    const id = await insert({
      starts_at: startsAt,
      platforms: ['ios'],
      regions: ['jp', 'intl'],
      min_app_version: '0.2',
    })

    const { announcements } = await publicList()
    expect(announcements).toEqual([
      {
        id,
        revision: 1,
        severity: 'warning',
        title: { en: 'Scheduled maintenance', ja: 'メンテナンスのお知らせ' },
        body: { en: 'Imports pause for an hour.', ja: 'インポートを1時間停止します。' },
        link: { url: '/developers', label: { en: 'Details' } },
        startsAt: startsAt.toISOString(),
        endsAt: null,
        platforms: ['ios'],
        regions: ['jp', 'intl'],
        minAppVersion: '0.2',
        maxAppVersion: null,
        dismissible: true,
      },
    ])
    expect(JSON.stringify(announcements)).not.toContain('demo-admin')
  })

  it('lists current and soon-starting announcements, most severe first, and leaves out ended and far-future ones', async () => {
    const now = Date.now()
    const info = await insert({ severity: 'info' })
    const critical = await insert({ severity: 'critical', dismissible: false })
    const soon = await insert({ starts_at: new Date(now + 2 * HOUR) })
    await insert({ starts_at: new Date(now + 48 * HOUR) })
    await insert({ starts_at: new Date(now - 2 * HOUR), ends_at: new Date(now - HOUR) })

    const ids = (await publicList()).announcements.map((a: { id: number }) => a.id)
    expect(ids).toEqual([critical, soon, info])
  })

  it('serves only the languages of the shared list', async () => {
    await insert({ title: { en: 'Hi', tlh: 'Qapla' } })
    expect((await publicList()).announcements[0].title).toEqual({ en: 'Hi' })
  })

  it.each([
    ['without English', { title: { ja: 'お知らせ' } }],
    ['ending before it starts', { starts_at: new Date(2030, 0, 2), ends_at: new Date(2030, 0, 1) }],
    ['with an author that is not a principal', { created_by: 'some-user-id' }],
  ])('the table refuses a row %s', async (_case, row) => {
    await expect(insert(row)).rejects.toThrow(/violates check constraint/)
  })

  it('serves a target the table does not restrict, so a new platform or region needs no migration', async () => {
    await insert({ platforms: ['android'], regions: ['usa'] })
    const [served] = (await publicList()).announcements
    expect(served.platforms).toEqual(['android'])
    expect(served.regions).toEqual(['usa'])
  })

  it('records an agent as an author', async () => {
    await expect(insert({ created_by: 'agent:token-123' })).resolves.toBeGreaterThan(0)
  })

  it('has no write endpoints on this backend', async () => {
    const res = await fetch(`${getBaseUrl()}/api/v1/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    const spec = await (await fetch(`${getBaseUrl()}/spec.json`)).json()
    expect(Object.keys(spec.paths['/announcements'])).toEqual(['get'])
    expect(Object.keys(spec.paths).some((path) => path.includes('admin'))).toBe(false)
  })
})