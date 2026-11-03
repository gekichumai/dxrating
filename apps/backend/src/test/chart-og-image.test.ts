import { createHash } from 'node:crypto'
import { Effect } from 'effect'
import { Hono } from 'hono'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { app } from '../app'
import type { PublishedSong } from '../services/mcp/catalog'
import { publishedCatalog, UMIYURI, UMIYURI_UTAGE } from '../services/mcp/test-fixture'
import {
  createChartOgImageHandler,
  formatInternalLevelLabelParts,
  getTitleLayout,
  resolveChartOgImageData,
  resolveChartOgImageDataEffect,
} from '../services/functions/chart-og-image/index'
import { setupTestServer, teardownTestServer } from './setup'

const song = publishedCatalog.songs.find((candidate) => candidate.id === UMIYURI)!
const sheet = song.sheets.find((candidate) => candidate.type === 'std' && candidate.difficulty === 'master')!
const utageSong = publishedCatalog.songs.find((candidate) => candidate.id === UMIYURI_UTAGE)!
const utageSheet = utageSong.sheets[0]!
const LEGACY_SONG_ID = 'ウミユリ海底譚'

// Answers the public ID and one legacy ID of the fixture song, as the catalog identities of the backend do
const lookupSong = (songId: string) =>
  Effect.succeed<PublishedSong | null>(
    songId === song.id || songId === LEGACY_SONG_ID
      ? song
      : (publishedCatalog.songs.find((candidate) => candidate.id === songId) ?? null),
  )

// The tables of the producer the catalog loader reads (see services/dxdata.ts)
const createPublishedCatalog = async (pool: pg.Pool, body: string) => {
  await pool.query(`
    CREATE SCHEMA dxdata;
    CREATE TABLE dxdata.catalog_build_runs (
      id BIGINT PRIMARY KEY,
      status TEXT NOT NULL,
      api_schema_version INTEGER NOT NULL
    );
    CREATE TABLE dxdata.catalog_publications (
      channel TEXT PRIMARY KEY,
      catalog_run_id BIGINT NOT NULL
    );
    CREATE TABLE dxdata.catalog_snapshots (
      catalog_run_id BIGINT PRIMARY KEY,
      api_schema_version INTEGER NOT NULL,
      body_sha256 TEXT NOT NULL,
      byte_length BIGINT NOT NULL,
      content_type TEXT NOT NULL,
      body_text TEXT NOT NULL
    );
  `)
  await pool.query(`INSERT INTO dxdata.catalog_build_runs (id, status, api_schema_version) VALUES (1, 'published', 1)`)
  await pool.query(`INSERT INTO dxdata.catalog_publications (channel, catalog_run_id) VALUES ('production-v1', 1)`)
  await pool.query(
    `
      INSERT INTO dxdata.catalog_snapshots (catalog_run_id, api_schema_version, body_sha256, byte_length, content_type, body_text)
      VALUES (1, 1, $1, $2, 'application/json', $3)
    `,
    [createHash('sha256').update(body).digest('hex'), Buffer.byteLength(body), body],
  )
}

describe('chart OG image endpoint', () => {
  let pool: pg.Pool

  beforeAll(async () => {
    await setupTestServer()
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    await pool.query('DROP SCHEMA IF EXISTS dxdata CASCADE')
    await createPublishedCatalog(pool, JSON.stringify(publishedCatalog))
  })
  afterAll(async () => {
    await pool.query('DROP SCHEMA IF EXISTS dxdata CASCADE')
    await pool.end()
    await teardownTestServer()
  })

  it('serves chart images of public song IDs from the published catalog', async () => {
    const res = await app.request(`/api/v1/songs/${song.id}/${sheet.type}/${sheet.difficulty}/og-image`)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toContain('public')
    expect(res.headers.get('content-disposition')).toBe(
      'inline; filename="chart-og.png"; filename*=utf-8\'\'chart-og.png',
    )
    expect(res.headers.get('etag')).toMatch(/^"sha256-[a-f0-9]{64}"$/)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })

  it('serves Utage chart images with custom difficulty labels', async () => {
    const res = await app.request(
      `/api/v1/songs/${utageSong.id}/${utageSheet.type}/${encodeURIComponent(utageSheet.difficulty)}/og-image`,
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })

  it('answers 404 for a song the published catalog does not have', async () => {
    const res = await app.request(`/api/v1/songs/dsng_zzzzzzzzzz/${sheet.type}/${sheet.difficulty}/og-image`)

    expect(res.status).toBe(404)
  })

  it('keeps the internal chart image endpoint out of the OpenAPI spec', async () => {
    const res = await app.request('/spec.json')
    const spec = await res.json()

    expect(spec.paths).not.toHaveProperty('/songs/{songId}/{type}/{difficulty}/og-image')
  })
})

describe('chart OG image handler', () => {
  it('resolves chart data and returns a cacheable PNG response', async () => {
    const image = new Uint8Array([137, 80, 78, 71])
    const renderImage = vi.fn(async () => image)
    const app = new Hono()
    app.get('/og/:songId/:type/:difficulty', createChartOgImageHandler(lookupSong, renderImage))

    const res = await app.request(`/og/${song.id}/${sheet.type}/${sheet.difficulty}`)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toContain('public')
    expect(res.headers.get('etag')).toBe('"sha256-0f4636c78f65d3639ece5a064b5ae753e3408614a14fb18ab4d7540d2c248543"')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await res.arrayBuffer()).toEqual(image.buffer)
    expect(renderImage).toHaveBeenCalledWith(
      expect.objectContaining({
        artist: song.artist,
        coverUrl: `https://shama.dxrating.net/images/cover/v2/${song.imageName}.jpg`,
        detailUrl: `https://dxrating.net/songs/${song.id}/${sheet.type}/${sheet.difficulty}`,
        difficulty: sheet.difficulty,
        levelLabel: `Lv ${sheet.internalLevelValue.toFixed(1)}`,
        level: sheet.level,
        noteDesigner: 'はっぴー',
        noteCounts: { tap: 648, hold: 21, slide: 76, touch: null, break: 14, total: 759 },
        songId: song.id,
        title: song.title,
        type: sheet.type,
      }),
    )
  })

  it('keeps serving legacy song IDs, also when crawlers encode them a second time', async () => {
    const renderImage = vi.fn(async () => new Uint8Array([1]))
    const app = new Hono()
    app.get('/og/:songId/:type/:difficulty', createChartOgImageHandler(lookupSong, renderImage))

    const once = await app.request(`/og/${encodeURIComponent(LEGACY_SONG_ID)}/${sheet.type}/${sheet.difficulty}`)
    const twice = await app.request(
      `/og/${encodeURIComponent(encodeURIComponent(LEGACY_SONG_ID))}/${sheet.type}/${sheet.difficulty}`,
    )

    expect(once.status).toBe(200)
    expect(twice.status).toBe(200)
    expect(renderImage).toHaveBeenCalledWith(expect.objectContaining({ songId: song.id }))
  })

  it('returns 404 without rendering when the chart does not exist', async () => {
    const renderImage = vi.fn(async () => new Uint8Array([1]))
    const app = new Hono()
    app.get('/og/:songId/:type/:difficulty', createChartOgImageHandler(lookupSong, renderImage))

    const missingSheet = await app.request(`/og/${song.id}/std/basic`)
    const missingSong = await app.request(`/og/${encodeURIComponent('no such song')}/std/master`)

    expect(missingSheet.status).toBe(404)
    expect(missingSong.status).toBe(404)
    expect(renderImage).not.toHaveBeenCalled()
  })
})

describe('chart OG image data resolution', () => {
  it('supports Utage charts with custom difficulty labels', () => {
    const data = resolveChartOgImageData(utageSong, utageSheet.type, utageSheet.difficulty)

    expect(data).toMatchObject({
      detailUrl: `https://dxrating.net/songs/${utageSong.id}/utage/${encodeURIComponent('【習】')}`,
      difficulty: '【習】',
      difficultyLabel: '【習】',
      level: '12+?',
      levelLabel: 'Lv 12.7',
      songId: utageSong.id,
      title: '[習]ウミユリ海底譚',
      type: 'utage',
      typeLabel: 'Utage',
      noteDesigner: null,
    })
  })

  it('decodes a double-encoded Utage difficulty', async () => {
    const data = await Effect.runPromise(
      resolveChartOgImageDataEffect(
        { songId: utageSong.id, type: 'utage', difficulty: encodeURIComponent('【習】') },
        lookupSong,
      ),
    )

    expect(data?.difficulty).toBe('【習】')
  })
})

describe('chart OG image level label', () => {
  it('splits the decimal part for separate visual emphasis', () => {
    expect(formatInternalLevelLabelParts(12)).toEqual({ prefix: 'Lv ', integer: '12', fraction: '.0' })
    expect(formatInternalLevelLabelParts(13.7)).toEqual({ prefix: 'Lv ', integer: '13', fraction: '.7' })
  })
})

describe('chart OG image title layout', () => {
  it('uses a compact layout for the longest song title of the catalog', () => {
    expect(
      getTitleLayout(
        'False Amber (from the Black Bazaar, Or by A Kervan Trader from the Lands Afar, Or Buried Beneath the Shifting Sands That Lead Everywhere but Nowhere)',
      ),
    ).toEqual({ fontSize: 25, lineHeight: 1.1, maxHeight: 150 })
  })
})