import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { PublishedDxdataCatalogSchema } from '../services/dxdata-openapi.js'
import { cleanDatabase, getBaseUrl, setupTestServer, teardownTestServer } from './setup.js'

const producerContractSuite = process.env.DXDATA_PRODUCER_CONTRACT === '1' ? describe : describe.skip

type PublishedIdentity = {
  public_song_id: string
  legacy_song_id: string
  public_sheet_id: string
  sheet_type: string
  sheet_difficulty: string
}

producerContractSuite('dxdata assembly-line producer contract', () => {
  let pool: pg.Pool

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    await setupTestServer()
    await cleanDatabase()
  })

  afterAll(async () => {
    await pool.end()
    await teardownTestServer()
  })

  it('serves the exact snapshot published by the real producer migration and writer', async () => {
    const migrations = await pool.query(`SELECT version, name FROM dxdata.catalog_schema_migrations ORDER BY version`)
    expect(migrations.rows).toEqual([
      { version: 1, name: 'dynamic_catalog' },
      { version: 2, name: 'source_mapping_run_integrity' },
      { version: 3, name: 'immutable_source_observations' },
      { version: 4, name: 'publication_staging_and_snapshot_integrity' },
    ])

    const promotedStage = await pool.query<{
      catalog_run_id: string
      receipt_catalog_run_id: string
      revision: string
    }>(
      `
        SELECT stage.catalog_run_id::text,
               receipt.catalog_run_id::text AS receipt_catalog_run_id,
               receipt.revision::text
        FROM dxdata.catalog_publications AS publication
        INNER JOIN dxdata.catalog_publication_stages AS stage
          ON stage.channel = publication.channel
          AND stage.publication_fingerprint_sha256 = publication.publication_fingerprint_sha256
        INNER JOIN dxdata.catalog_publication_receipts AS receipt
          ON receipt.channel = stage.channel
          AND receipt.publication_fingerprint_sha256 = stage.publication_fingerprint_sha256
        WHERE publication.channel = 'production-v1'
      `,
    )
    expect(promotedStage.rows).toHaveLength(1)
    expect(promotedStage.rows[0].catalog_run_id).toBe(promotedStage.rows[0].receipt_catalog_run_id)
    expect(Number(promotedStage.rows[0].revision)).toBeGreaterThan(0)

    const published = await pool.query<{
      publication_revision: string
      body_text: string
      body_sha256: string
      byte_length: string
      content_type: string
    }>(
      `
        SELECT publication.revision::text AS publication_revision,
               snapshot.body_text,
               snapshot.body_sha256,
               snapshot.byte_length::text AS byte_length,
               snapshot.content_type
        FROM dxdata.catalog_publications AS publication
        INNER JOIN dxdata.catalog_snapshots AS snapshot
          ON snapshot.catalog_run_id = publication.catalog_run_id
        WHERE publication.channel = 'production-v1'
      `,
    )
    expect(published.rows).toHaveLength(1)
    const snapshot = published.rows[0]
    const etag = `"${snapshot.body_sha256}"`

    const response = await fetch(`${getBaseUrl()}/api/v1/dxdata`)
    expect(response.status).toBe(200)
    expect(response.headers.get('etag')).toBe(etag)
    expect(response.headers.get('x-dxrating-catalog-revision')).toBe(snapshot.publication_revision)
    expect(response.headers.get('content-length')).toBe(snapshot.byte_length)
    expect(response.headers.get('content-type')).toBe(snapshot.content_type)

    const body = await response.text()
    expect(body).toBe(snapshot.body_text)
    expect(Buffer.byteLength(body).toString()).toBe(snapshot.byte_length)
    const catalog = PublishedDxdataCatalogSchema.parse(JSON.parse(body))
    expect(catalog.songs.length).toBeGreaterThan(0)

    const head = await fetch(`${getBaseUrl()}/api/v1/dxdata`, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('etag')).toBe(etag)
    expect(head.headers.get('x-dxrating-catalog-revision')).toBe(snapshot.publication_revision)
    expect(head.headers.get('content-length')).toBe(snapshot.byte_length)
    expect(await head.text()).toBe('')

    const notModified = await fetch(`${getBaseUrl()}/api/v1/dxdata`, {
      headers: { 'If-None-Match': `W/${etag}` },
    })
    expect(notModified.status).toBe(304)
    expect(notModified.headers.get('etag')).toBe(etag)
    expect(notModified.headers.get('x-dxrating-catalog-revision')).toBe(snapshot.publication_revision)
    expect(await notModified.text()).toBe('')
  })

  it('translates real producer identities while preserving the default legacy API', async () => {
    const result = await pool.query<PublishedIdentity>(
      `
        SELECT song.id AS public_song_id,
               song.legacy_song_id,
               sheet.id AS public_sheet_id,
               sheet.chart_type AS sheet_type,
               sheet.difficulty AS sheet_difficulty
        FROM dxdata.catalog_publications AS publication
        INNER JOIN dxdata.catalog_run_songs AS catalog_song
          ON catalog_song.catalog_run_id = publication.catalog_run_id
        INNER JOIN dxdata.canonical_songs AS song
          ON song.id = catalog_song.song_id
        INNER JOIN dxdata.catalog_run_sheets AS catalog_sheet
          ON catalog_sheet.catalog_run_id = catalog_song.catalog_run_id
          AND catalog_sheet.song_id = catalog_song.song_id
        INNER JOIN dxdata.canonical_sheets AS sheet
          ON sheet.id = catalog_sheet.sheet_id
          AND sheet.song_id = catalog_song.song_id
        WHERE publication.channel = 'production-v1'
          AND song.legacy_song_id IS NOT NULL
        ORDER BY catalog_song.ordinal, catalog_sheet.ordinal
        LIMIT 1
      `,
    )
    expect(result.rows).toHaveLength(1)
    const identity = result.rows[0]

    await pool.query(`INSERT INTO song_aliases (song_id, name) VALUES ($1, 'producer contract alias')`, [
      identity.legacy_song_id,
    ])

    const legacyAliases = await fetch(`${getBaseUrl()}/api/v1/aliases`)
    expect(legacyAliases.status).toBe(200)
    expect(await legacyAliases.json()).toEqual([{ song_id: identity.legacy_song_id, name: 'producer contract alias' }])

    const publicAliases = await fetch(`${getBaseUrl()}/api/v1/aliases?idScheme=public`)
    expect(publicAliases.status).toBe(200)
    expect(await publicAliases.json()).toEqual([{ song_id: identity.public_song_id, name: 'producer contract alias' }])

    const query = new URLSearchParams({
      songId: identity.public_song_id,
      sheetId: identity.public_sheet_id,
      sheetType: identity.sheet_type,
      sheetDifficulty: identity.sheet_difficulty,
    })
    const publicComments = await fetch(`${getBaseUrl()}/api/v1/comments?${query}`)
    expect(publicComments.status).toBe(200)
    expect(await publicComments.json()).toEqual([])
  })
})