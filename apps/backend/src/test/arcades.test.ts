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
        (name, normalized_name, country_code, region, city, postal_code, address,
         phone, website_url, timezone, latitude, longitude)
      VALUES
        ('Alpha Arcade', 'alpha arcade', 'JP', 'Tokyo', 'Chiyoda', NULL,
         '1-1 Alpha', NULL, NULL, 'Asia/Tokyo', NULL, NULL),
        ('Beta Game Center', 'beta game center', 'JP', 'Tokyo', 'Shinjuku', '160-0022',
         '2-2 Beta', '+81-3-0000-0000', 'https://example.com/beta', 'Asia/Tokyo', 35.6900, 139.7000),
        ('Gamma Games', 'gamma games', 'JP', 'Kanagawa', 'Yokohama', '220-0000',
         '3-3 Gamma', NULL, NULL, 'Asia/Tokyo', 35.4500, 139.6300),
        ('ＧｉＧＯ 秋葉原', 'gigo 秋葉原', 'JP', 'Tokyo', 'Chiyoda', '101-0021',
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

  it('merges source facts without discarding known values or exposing raw data', async () => {
    const response = await fetch(`${getBaseUrl()}/api/v1/arcades/venues?query=Alpha`)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.nextCursor).toBeNull()
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({
      id: expect.stringMatching(/^[1-9]\d*$/),
      name: 'Alpha Arcade',
      postalCode: null,
      phone: null,
      websiteUrl: null,
      latitude: null,
      longitude: null,
    })
    expect(body.items[0].installations).toHaveLength(1)
    expect(body.items[0].installations[0]).toMatchObject({
      gameId: 'maimai',
      machineCount: 3,
      version: 'PRiSM',
      cabinetModel: null,
      status: 'online',
      price: '100 JPY',
      condition: 'good',
      confidence: 0.9,
      observedAt: '2026-07-30T02:00:00.000Z',
    })
    expect(body.items[0].installations[0].provenance).toEqual([
      {
        source: 'a_source',
        observedAt: '2026-07-30T01:00:00.000Z',
        sourceUrl: null,
      },
      {
        source: 'y_source',
        observedAt: '2026-07-30T01:30:00.000Z',
        sourceUrl: 'https://source-y.example/alpha',
      },
      {
        source: 'z_source',
        observedAt: '2026-07-30T02:00:00.000Z',
        sourceUrl: 'https://source-z.example/alpha',
      },
    ])
    expect(JSON.stringify(body)).not.toContain('"raw"')
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

  it('orders and paginates with an opaque cursor', async () => {
    const firstResponse = await fetch(`${getBaseUrl()}/api/v1/arcades/venues?limit=1`)
    const first = await firstResponse.json()

    expect(first.items.map((venue: { name: string }) => venue.name)).toEqual(['Alpha Arcade'])
    expect(first.nextCursor).toEqual(expect.any(String))

    const secondResponse = await fetch(
      `${getBaseUrl()}/api/v1/arcades/venues?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`,
    )
    const second = await secondResponse.json()

    expect(second.items.map((venue: { name: string }) => venue.name)).toEqual(['Beta Game Center'])
    expect(second.items[0].id).toEqual(expect.stringMatching(/^[1-9]\d*$/))
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

  it('rejects partial or invalid bounding boxes, bad cursors, and oversized limits', async () => {
    const partial = await fetch(`${getBaseUrl()}/api/v1/arcades/venues?minLatitude=35`)
    expect(partial.status).toBe(400)

    const inverted = await fetch(
      `${getBaseUrl()}/api/v1/arcades/venues?minLatitude=36&minLongitude=139&maxLatitude=35&maxLongitude=140`,
    )
    expect(inverted.status).toBe(400)

    const badCursor = await fetch(`${getBaseUrl()}/api/v1/arcades/venues?cursor=not-a-cursor`)
    expect(badCursor.status).toBe(400)

    const badLimit = await fetch(`${getBaseUrl()}/api/v1/arcades/venues?limit=101`)
    expect(badLimit.status).toBe(400)
  })
})