import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { publishedCatalog, UMIYURI } from '../services/mcp/test-fixture'
import { getBaseUrl, setupTestServer, teardownTestServer } from './setup'

// The tables of the producer the MCP catalog loader reads (see services/dxdata.ts)
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

const mcp = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${getBaseUrl()}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify(body),
  })

describe('MCP endpoint', () => {
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

  it('initializes', async () => {
    const res = await mcp({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result.serverInfo).toMatchObject({ name: 'net.dxrating/dxrating', title: 'DXRating' })
    expect(body.result.instructions).toContain('search_songs')
  })

  it('searches the published catalog', async () => {
    const res = await mcp(
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_songs', arguments: { query: '海底谭' } } },
      { 'Mcp-Protocol-Version': '2025-06-18' },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result.isError).toBeFalsy()
    expect(body.result.structuredContent.songs[0]).toMatchObject({ songId: UMIYURI, title: 'ウミユリ海底譚' })
  })

  it('lets browser clients of any origin call it, without credentials', async () => {
    const res = await fetch(`${getBaseUrl()}/mcp`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://inspector.example',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type, mcp-protocol-version',
      },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-credentials')).toBeNull()
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('mcp-protocol-version')
  })

  it('has no stream of server messages', async () => {
    const res = await fetch(`${getBaseUrl()}/mcp`, { headers: { Accept: 'text/event-stream' } })
    expect(res.status).toBe(405)
  })

  it('serves the server card to any origin', async () => {
    const res = await fetch(`${getBaseUrl()}/mcp/server-card`, { headers: { Origin: 'https://example.com' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/mcp-server-card+json')
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect((await res.json()).name).toBe('net.dxrating/dxrating')
  })

  it('serves the guide at the root of its host only', async () => {
    const guide = await fetch(`${getBaseUrl()}/?lang=en`, {
      headers: { 'X-Forwarded-Host': 'mcp.dxrating.net' },
      redirect: 'manual',
    })
    expect(guide.status).toBe(200)
    expect(await guide.text()).toContain('<title>DXRating MCP Server</title>')
    const robots = await fetch(`${getBaseUrl()}/robots.txt`, { headers: { 'X-Forwarded-Host': 'mcp.dxrating.net' } })
    expect(await robots.text()).toContain('Disallow: /mcp')

    const api = await fetch(`${getBaseUrl()}/`, { redirect: 'manual' })
    expect(api.status).toBe(302)
    expect(api.headers.get('location')).toBe('/docs')
  })
})