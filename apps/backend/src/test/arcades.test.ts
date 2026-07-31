import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import pg from 'pg'
import { cleanDatabase, getBaseUrl, setupTestServer, teardownTestServer } from './setup.js'

async function seedArcades() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  try {
    await pool.query(`
      INSERT INTO arcade.games (id, name, manufacturer, active) VALUES
        ('maimai', 'maimai DX', 'SEGA', true),
        ('chunithm', 'CHUNITHM', 'SEGA', true),
        ('retired', 'Retired Game', 'Example', false)
    `)

    await pool.query(`
      INSERT INTO arcade.chains (id, name, country_codes) VALUES
        ('gigo', 'GiGO', ARRAY['JP']),
        ('timezone', 'Timezone', ARRAY['SG'])
    `)

    const run = await pool.query<{ id: string }>(`
      INSERT INTO arcade.crawl_runs
        (source, started_at, finished_at, status, is_complete, record_count)
      VALUES
        ('test', '2026-07-30T00:00:00Z', '2026-07-30T00:05:00Z', 'succeeded', true, 4)
      RETURNING id
    `)
    const runId = run.rows[0].id

    const venues = await pool.query<{ id: string; normalized_name: string }>(`
      INSERT INTO arcade.venues
        (name, normalized_name, chain_id, country_code, region, city, postal_code, address,
         phone, website_url, timezone, latitude, longitude)
      VALUES
        ('Alpha Arcade', 'alpha arcade', NULL, 'JP', 'Tokyo', 'Chiyoda', NULL,
         '1-1 Alpha', NULL, NULL, 'Asia/Tokyo', NULL, NULL),
        ('Beta Game Center', 'beta game center', NULL, 'JP', 'Tokyo', 'Shinjuku', '160-0022',
         '2-2 Beta', '+81-3-0000-0000', 'https://example.com/beta', 'Asia/Tokyo', 35.6900, 139.7000),
        ('Gamma Games', 'gamma games', NULL, 'JP', 'Kanagawa', 'Yokohama', '220-0000',
         '3-3 Gamma', NULL, NULL, 'Asia/Tokyo', 35.4500, 139.6300),
        ('ＧｉＧＯ 秋葉原', 'gigo 秋葉原', 'gigo', 'JP', 'Tokyo', 'Chiyoda', '101-0021',
         '4-4 Akihabara', NULL, NULL, 'Asia/Tokyo', 35.6980, 139.7710)
      RETURNING id, normalized_name
    `)
    const venueId = new Map(venues.rows.map((venue) => [venue.normalized_name, venue.id]))

    await pool.query(
      `
        INSERT INTO arcade.installations
          (venue_id, game_id, version, cabinet_model, machine_count, status, region,
           network, price, condition, confidence, source_url, observed_at,
           last_crawl_run_id, source, provenance)
        VALUES
          ($1, 'maimai', 'PRiSM', NULL, 3, 'online', 'JP', NULL, '100 JPY', 'good',
           0.5, 'https://source-z.example/alpha', '2026-07-30T02:00:00Z', $4, 'z_source', '[]'),
          ($1, 'maimai', 'PRiSM', NULL, NULL, NULL, 'JP', NULL, NULL, NULL,
           0.9, NULL, '2026-07-30T01:00:00Z', $4, 'a_source', '[]'),
          ($1, 'maimai', 'PRiSM', NULL, 7, 'degraded', 'JP', NULL, '200 JPY', 'fair',
           0.5, 'https://source-y.example/alpha', '2026-07-30T01:30:00Z', $4, 'y_source', '[]'),
          ($1, 'chunithm', NULL, NULL, 1, 'offline', NULL, NULL, NULL, NULL,
           NULL, NULL, '2026-07-29T01:00:00Z', $4, 'old_source', '[]'),
          ($2, 'chunithm', 'VERSE', 'CVT', 4, 'online', 'JP', 'ALL.Net', '100 JPY', 'good',
           0.8, 'https://source.example/beta', '2026-07-30T03:00:00Z', $4, 'test', '[]'),
          ($3, 'maimai', NULL, NULL, 2, 'maintenance', 'JP', NULL, NULL, NULL,
           NULL, NULL, '2026-07-30T04:00:00Z', $4, 'test', '[]')
      `,
      [venueId.get('alpha arcade'), venueId.get('beta game center'), venueId.get('gamma games'), runId],
    )

    await pool.query(
      `
        UPDATE arcade.installations
        SET absent_since = '2026-07-30T05:00:00Z'
        WHERE venue_id = $1 AND game_id = 'chunithm'
      `,
      [venueId.get('alpha arcade')],
    )

    await pool.query(
      `
        UPDATE arcade.installations
        SET provenance = '[{"source":"private_test_source","observedAt":"2026-07-30T02:00:00Z"}]'::jsonb
        WHERE venue_id = $1 AND game_id = 'maimai' AND source = 'z_source'
      `,
      [venueId.get('alpha arcade')],
    )
  } finally {
    await pool.end()
  }
}

describe('Arcades API', () => {
  beforeAll(async () => {
    await setupTestServer()
  })

  afterAll(async () => {
    await teardownTestServer()
  })

  beforeEach(async () => {
    await cleanDatabase()
    await seedArcades()
  })

  it('is public and lists only active games deterministically', async () => {
    const response = await fetch(`${getBaseUrl()}/api/v1/arcades/games`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      items: [
        { id: 'chunithm', name: 'CHUNITHM', manufacturer: 'SEGA' },
        { id: 'maimai', name: 'maimai DX', manufacturer: 'SEGA' },
      ],
    })

    const specResponse = await fetch(`${getBaseUrl()}/spec.json`)
    const spec = await specResponse.json()
    expect(spec.paths['/arcades/games'].get.security).toEqual([])
    expect(spec.paths['/arcades/venues'].get.security).toEqual([])
    expect(spec.paths['/arcades/venues/{id}'].get.security).toEqual([])
  })

  it('merges source facts, omits nulls, and keeps provenance private', async () => {
    const response = await fetch(`${getBaseUrl()}/api/v1/arcades/venues?query=Alpha`)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).not.toHaveProperty('nextCursor')
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({
      id: expect.stringMatching(/^[1-9]\d*$/),
      name: 'Alpha Arcade',
    })
    expect(body.items[0]).not.toHaveProperty('postalCode')
    expect(body.items[0]).not.toHaveProperty('phone')
    expect(body.items[0]).not.toHaveProperty('websiteUrl')
    expect(body.items[0]).not.toHaveProperty('latitude')
    expect(body.items[0]).not.toHaveProperty('longitude')
    expect(body.items[0].installations).toHaveLength(1)
    expect(body.items[0].installations[0]).toMatchObject({
      gameId: 'maimai',
      machineCount: 3,
      version: 'PRiSM',
      status: 'online',
      price: '100 JPY',
      condition: 'good',
      confidence: 0.9,
      observedAt: '2026-07-30T02:00:00.000Z',
    })
    expect(body.items[0].installations[0]).not.toHaveProperty('cabinetModel')
    const json = JSON.stringify(body)
    expect(json).not.toContain(':null')
    expect(json).not.toContain('"provenance"')
    expect(json).not.toContain('"raw"')

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    const persisted = await pool.query<{ provenance: Array<Record<string, unknown>> }>(`
      SELECT provenance
      FROM arcade.installations
      WHERE source = 'z_source'
    `)
    await pool.end()
    expect(persisted.rows[0].provenance).toEqual([
      { source: 'private_test_source', observedAt: '2026-07-30T02:00:00Z' },
    ])
  })

  it('filters by bbox, games, and installation status', async () => {
    const bbox = new URLSearchParams({
      minLatitude: '35.6',
      minLongitude: '139.6',
      maxLatitude: '35.8',
      maxLongitude: '139.8',
      games: 'chunithm,maimai',
      status: 'online',
    })
    const response = await fetch(`${getBaseUrl()}/api/v1/arcades/venues?${bbox}`)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.items.map((venue: { name: string }) => venue.name)).toEqual(['Beta Game Center'])
  })

  it('normalizes full-width venue names for search', async () => {
    const response = await fetch(`${getBaseUrl()}/api/v1/arcades/venues?query=gigo`)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.items.map((venue: { name: string }) => venue.name)).toEqual(['ＧｉＧＯ 秋葉原'])
  })

  it('returns the complete catalog in one response', async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    await pool.query(`
      INSERT INTO arcade.venues (name, normalized_name)
      SELECT 'Venue ' || value, 'venue ' || lpad(value::text, 3, '0')
      FROM generate_series(1, 120) AS value
    `)
    await pool.end()

    const response = await fetch(`${getBaseUrl()}/api/v1/arcades/venues?limit=1`)
    const body = await response.json()

    expect(body.items).toHaveLength(124)
    expect(body).not.toHaveProperty('nextCursor')
  })

  it('returns represented chain metadata and filters by stable chain id', async () => {
    const allResponse = await fetch(`${getBaseUrl()}/api/v1/arcades/venues`)
    const all = await allResponse.json()
    expect(all.chains).toEqual([{ id: 'gigo', name: 'GiGO', countryCodes: ['JP'] }])
    expect(all.chains).not.toContainEqual(expect.objectContaining({ id: 'timezone' }))

    const filteredResponse = await fetch(`${getBaseUrl()}/api/v1/arcades/venues?chains=gigo`)
    const filtered = await filteredResponse.json()
    expect(filtered.items.map((venue: { name: string }) => venue.name)).toEqual(['ＧｉＧＯ 秋葉原'])
    expect(filtered.items[0].chainId).toBe('gigo')
  })

  it('returns detail and a 404 for an unknown venue', async () => {
    const listResponse = await fetch(`${getBaseUrl()}/api/v1/arcades/venues?query=Beta`)
    const list = await listResponse.json()
    const id = list.items[0].id

    const detailResponse = await fetch(`${getBaseUrl()}/api/v1/arcades/venues/${id}`)
    expect(detailResponse.status).toBe(200)
    expect(await detailResponse.json()).toMatchObject({
      id,
      name: 'Beta Game Center',
      postalCode: '160-0022',
      installations: [{ gameId: 'chunithm', machineCount: 4, status: 'online' }],
    })

    const missingResponse = await fetch(`${getBaseUrl()}/api/v1/arcades/venues/999999999`)
    expect(missingResponse.status).toBe(404)
  })

  it('rejects partial or invalid bounding boxes', async () => {
    const partial = await fetch(`${getBaseUrl()}/api/v1/arcades/venues?minLatitude=35`)
    expect(partial.status).toBe(400)

    const inverted = await fetch(
      `${getBaseUrl()}/api/v1/arcades/venues?minLatitude=36&minLongitude=139&maxLatitude=35&maxLongitude=140`,
    )
    expect(inverted.status).toBe(400)
  })

  it('serves the public catalog with CDN validators and cache-safe CORS', async () => {
    const response = await fetch(`${getBaseUrl()}/api/v1/arcades/venues`, {
      headers: { Origin: 'https://example.app' },
    })
    const etag = response.headers.get('etag')

    expect(response.status).toBe(200)
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/)
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=300, stale-while-revalidate=60, stale-if-error=86400',
    )
    expect(response.headers.get('cdn-cache-control')).toBe(
      'public, max-age=21600, stale-while-revalidate=86400, stale-if-error=604800',
    )
    expect(response.headers.get('cloudflare-cdn-cache-control')).toBe(
      'public, max-age=21600, stale-while-revalidate=86400, stale-if-error=604800',
    )
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.has('access-control-allow-credentials')).toBe(false)
    expect(response.headers.get('vary') ?? '').not.toContain('Origin')
    expect(response.headers.has('x-dxrating-request-id')).toBe(false)

    const head = await fetch(`${getBaseUrl()}/api/v1/arcades/venues`, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('etag')).toBe(etag)
    expect(await head.text()).toBe('')

    const notModified = await fetch(`${getBaseUrl()}/api/v1/arcades/venues`, {
      headers: { 'If-None-Match': etag! },
    })
    expect(notModified.status).toBe(304)
    expect(await notModified.text()).toBe('')
    expect(notModified.headers.get('etag')).toBe(etag)
    expect(notModified.headers.get('cache-control')).toBe(response.headers.get('cache-control'))

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    await pool.query(`UPDATE arcade.venues SET name = 'Alpha Arcade Updated' WHERE normalized_name = 'alpha arcade'`)
    await pool.end()

    const changed = await fetch(`${getBaseUrl()}/api/v1/arcades/venues`)
    expect(changed.headers.get('etag')).toMatch(/^"[a-f0-9]{64}"$/)
    expect(changed.headers.get('etag')).not.toBe(etag)
  })
})