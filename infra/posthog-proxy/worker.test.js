// Run with: node --test infra/posthog-proxy/worker.test.js
import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { gzipSync } from 'node:zlib'

import worker from './worker.js'

const TOKEN = 'phc_Hw7FM2D1vSwummp0D3O13Z6biV6udw5bKIcq4BJQxH7'
const URL_BATCH = 'https://razu.dxrating.net/batch/'
const MiB = 1024 * 1024

let forwarded
const realFetch = globalThis.fetch
const RealDecompressionStream = globalThis.DecompressionStream
let decodedBytes

beforeEach(() => {
  forwarded = []
  decodedBytes = 0
  globalThis.fetch = async (url, request) => {
    forwarded.push({ url, body: new Uint8Array(await request.arrayBuffer()), headers: request.headers })
    return new Response('ok')
  }
  // Counts how many decompressed bytes the worker actually pulls.
  globalThis.DecompressionStream = function CountingDecompressionStream(format) {
    const inner = new RealDecompressionStream(format)
    const counter = new TransformStream({
      transform(chunk, controller) {
        decodedBytes += chunk.byteLength
        controller.enqueue(chunk)
      },
    })
    return { writable: inner.writable, readable: inner.readable.pipeThrough(counter) }
  }
})

afterEach(() => {
  globalThis.fetch = realFetch
  globalThis.DecompressionStream = RealDecompressionStream
})

function post(body, headers = {}) {
  const init = { method: 'POST', headers, body }
  if (body instanceof ReadableStream) init.duplex = 'half'
  return new Request(URL_BATCH, init)
}

test('allow-listed origin is forwarded', async () => {
  const res = await worker.fetch(post('{}', { origin: 'https://dxrating.net' }), {}, {})
  assert.equal(res.status, 200)
  assert.equal(forwarded.length, 1)
})

test('foreign origin is rejected even with the right token', async () => {
  const res = await worker.fetch(post(JSON.stringify({ api_key: TOKEN }), { origin: 'https://evil.example' }), {}, {})
  assert.equal(res.status, 403)
  assert.equal(forwarded.length, 0)
})

test('no-Origin JSON with the token is forwarded byte-identical', async () => {
  const body = JSON.stringify({ api_key: TOKEN, batch: [] })
  const res = await worker.fetch(post(body, { 'content-type': 'application/json' }), {}, {})
  assert.equal(res.status, 200)
  assert.equal(new TextDecoder().decode(forwarded[0].body), body)
})

test('no-Origin gzip JSON with the token is forwarded with encoded bytes and headers intact', async () => {
  const gz = gzipSync(JSON.stringify({ api_key: TOKEN, batch: [] }))
  const res = await worker.fetch(post(gz, { 'content-encoding': 'gzip', 'content-type': 'application/json' }), {}, {})
  assert.equal(res.status, 200)
  assert.deepEqual(forwarded[0].body, new Uint8Array(gz))
  assert.equal(forwarded[0].headers.get('content-encoding'), 'gzip')
})

test('no-Origin posthog-ios gzip batch is forwarded unchanged', async () => {
  // Shape posthog-ios sends to /batch/: gzip JSON with api_key, batch and sent_at.
  const events = Array.from({ length: 50 }, (_, i) => ({
    event: 'screen_viewed',
    distinct_id: 'demo-device',
    timestamp: '2026-11-06T00:00:00.000Z',
    uuid: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    properties: { $lib: 'posthog-ios', $lib_version: '3.0.0', $screen_name: 'RatingCalculator', $os: 'iOS' },
  }))
  const gz = gzipSync(JSON.stringify({ api_key: TOKEN, batch: events, sent_at: '2026-11-06T00:00:01.000Z' }))
  const headers = { 'content-encoding': 'gzip', 'content-type': 'application/json', 'user-agent': 'posthog-ios/3.0.0' }
  const res = await worker.fetch(post(gz, headers), {}, {})
  assert.equal(res.status, 200)
  assert.equal(forwarded.length, 1)
  assert.equal(forwarded[0].url, 'https://us.i.posthog.com/batch/')
  assert.deepEqual(forwarded[0].body, new Uint8Array(gz))
  for (const [name, value] of Object.entries(headers)) assert.equal(forwarded[0].headers.get(name), value)
})

test('no-Origin form body with the token is forwarded', async () => {
  const body = 'data=' + encodeURIComponent(btoa(JSON.stringify({ token: TOKEN })))
  const res = await worker.fetch(post(body, { 'content-type': 'application/x-www-form-urlencoded' }), {}, {})
  assert.equal(res.status, 200)
})

test('no-Origin wrong token, garbage, bad gzip, GET and empty body are rejected', async () => {
  const cases = [
    post(JSON.stringify({ api_key: 'wrong' })),
    post('not json'),
    post(new Uint8Array([1, 2, 3]), { 'content-encoding': 'gzip' }),
    new Request(URL_BATCH),
    post(''),
  ]
  for (const req of cases) {
    const res = await worker.fetch(req, {}, {})
    assert.equal(res.status, 403)
  }
  assert.equal(forwarded.length, 0)
})

test('gzip bomb with an invalid token stops decompressing at the decoded limit', async () => {
  // ~64 KiB on the wire, 64 MiB once expanded.
  const json = JSON.stringify({ api_key: 'wrong' })
  const bomb = gzipSync(Buffer.concat([Buffer.from(json), Buffer.alloc(64 * MiB - json.length, ' ')]), { level: 9 })
  assert.ok(bomb.byteLength < 1 * MiB)

  const res = await worker.fetch(post(bomb, { 'content-encoding': 'gzip' }), {}, {})
  assert.equal(res.status, 403)
  assert.equal(forwarded.length, 0)
  assert.ok(decodedBytes <= 5 * MiB, `decompressed ${decodedBytes} bytes`)
})

test('gzip bomb carrying the right token is still rejected once it expands past the limit', async () => {
  const json = JSON.stringify({ api_key: TOKEN })
  const bomb = gzipSync(Buffer.concat([Buffer.from(json), Buffer.alloc(16 * MiB, ' ')]), { level: 9 })
  const res = await worker.fetch(post(bomb, { 'content-encoding': 'gzip' }), {}, {})
  assert.equal(res.status, 403)
  assert.equal(forwarded.length, 0)
})

test('oversized streaming body is cancelled after the encoded limit', async () => {
  let pulled = 0
  let cancelled = false
  const chunk = new Uint8Array(64 * 1024).fill(0x20)
  const endless = new ReadableStream({
    pull(controller) {
      pulled += chunk.byteLength
      controller.enqueue(chunk)
    },
    cancel() {
      cancelled = true
    },
  })
  const res = await worker.fetch(post(endless), {}, {})
  assert.equal(res.status, 403)
  assert.equal(forwarded.length, 0)
  assert.ok(cancelled, 'stream was not cancelled')
  assert.ok(pulled <= 2 * MiB, `pulled ${pulled} bytes`)
})

test('declared Content-Length over the limit is rejected without reading', async () => {
  let pulled = 0
  const stream = new ReadableStream({
    pull(controller) {
      pulled += 1
      controller.enqueue(new Uint8Array(1))
      controller.close()
    },
  })
  const res = await worker.fetch(post(stream, { 'content-length': String(4 * MiB) }), {}, {})
  assert.equal(res.status, 403)
  assert.equal(forwarded.length, 0)
  assert.ok(pulled <= 1)
})