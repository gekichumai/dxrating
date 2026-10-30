import { describe, expect, it, vi } from 'vitest'
import {
  argumentProperties,
  buildMcpAnalyticsEvents,
  createMcpAnalytics,
  dailyDistinctId,
  ipPrefix,
  mcpAnalyticsFromEnv,
  mcpLogFields,
  sanitizeVia,
  scrubText,
  type McpAnalyticsContext,
} from './analytics'
import { buildMcpCatalog } from './catalog'
import { handleMcpRequest } from './http'
import { MCP_TOOL_NAMES } from './server'
import { observeMcpRequest } from './telemetry'
import { publishedCatalog } from './test-fixture'

const catalog = buildMcpCatalog('1', publishedCatalog)
const SECRET = 'test-secret'
const IP = '203.0.113.77'

const headers = new Headers({
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
  Authorization: 'Bearer top-secret-token',
  Cookie: 'session=cookie-secret',
  'CF-Connecting-IP': IP,
  'X-Forwarded-For': `${IP}, 162.158.1.2`,
  'CF-IPCountry': 'JP',
  'User-Agent': 'claude-code/2.1.0',
  'Mcp-Protocol-Version': '2025-06-18',
})

const context = (overrides: Partial<McpAnalyticsContext> = {}): McpAnalyticsContext => ({
  headers,
  clientAddress: IP,
  via: 'guide-claude',
  durationMs: 12.3,
  status: 200,
  deployment: 'production',
  ...overrides,
})

/** Runs a request through the real handler and builds its events */
async function exchange(body: unknown, now = new Date('2026-10-30T12:00:00Z')) {
  const request = new Request('https://mcp.dxrating.net/mcp?via=guide-claude', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const observed = await observeMcpRequest(request, (r) => handleMcpRequest(r, catalog))
  const events = buildMcpAnalyticsEvents(context(), observed.requestBody, observed.responseBody, SECRET, now)
  return { events, serialized: JSON.stringify(events), observed }
}

const expectNoPrivateData = (serialized: string) => {
  for (const forbidden of ['203.0.113', '162.158', 'top-secret', 'Bearer', 'cookie-secret', '"$ip":"']) {
    expect(serialized).not.toContain(forbidden)
  }
}

const call = (name: string, args: unknown, id = 1) => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
  params: { name, arguments: args },
})

describe('MCP analytics events', () => {
  it('describes an initialize', async () => {
    const { events, serialized } = await exchange({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-ai', version: '0.1.0' } },
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      event: 'mcp_initialize',
      properties: {
        platform: 'mcp',
        deployment: 'production',
        client_name: 'claude-ai',
        client_version: '0.1.0',
        client_class: 'claude',
        ua_class: expect.any(String),
        protocol_version: '2025-06-18',
        via: 'guide-claude',
        country: 'JP',
        outcome: 'ok',
        $geoip_disable: true,
        $process_person_profile: false,
        $ip: null,
      },
    })
    expect(events[0]!.properties).not.toHaveProperty('city')
    expectNoPrivateData(serialized)
  })

  it('describes a tools/list with its count', async () => {
    const { events } = await exchange({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    expect(events[0]!.event).toBe('mcp_tools_list')
    expect(events[0]!.properties.result_count).toBe(MCP_TOOL_NAMES.length)
    expect(events[0]!.properties.result_bytes).toBeGreaterThan(100)
  })

  it('describes a search with its scrubbed, truncated query', async () => {
    const query = `umiyuri me@example.com 09012345678 ${'x'.repeat(100)}`
    const { events, serialized } = await exchange(call('search_songs', { query, limit: 3 }))
    const p = events[0]!.properties
    expect(events[0]!.event).toBe('mcp_tool_called')
    expect(p.tool).toBe('search_songs')
    expect(p.arg_limit).toBe(3)
    expect(p.arg_query).toMatch(/^umiyuri \[email\] \[number\] x+$/)
    expect(Array.from(p.arg_query as string).length).toBe(64)
    expect(p.arg_query_length).toBe(Array.from(query).length)
    expect(serialized).not.toContain('example.com')
    expect(serialized).not.toContain('09012345678')
    expect(typeof p.duration_ms).toBe('number')
    expect(['ok', 'tool_error']).toContain(p.outcome)
  })

  it('sends of calculate_best50 only the number of scores', async () => {
    const scores = [
      { song: 'umiyuri', type: 'dx', difficulty: 'master', achievement: 1007543 },
      { song: 'other song', difficulty: 'expert', achievement: 998877 },
    ]
    const { events, serialized } = await exchange(call('calculate_best50', { scores, server: 'jp' }))
    expect(events[0]!.properties).toMatchObject({ tool: 'calculate_best50', arg_scores_count: 2, arg_server: 'jp' })
    for (const forbidden of ['1007543', '998877', 'achievement', 'umiyuri', 'other song']) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('keeps no achievement of calculate_rating', () => {
    expect(argumentProperties('calculate_rating', { internal_level: 13.7, achievement: 1005000 })).toEqual({
      arg_internal_level: 13.7,
      arg_has_achievement: true,
    })
  })

  it('reports an error with its code, and one event per call of a batch', async () => {
    const { events } = await exchange([
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      call('search_songs', { query: 'a' }, 2),
      { jsonrpc: '2.0', id: 3, method: 'no/such' },
      call('nope', {}, 4),
    ])
    expect(events.map((e) => e.event)).toEqual(['mcp_tools_list', 'mcp_tool_called', 'mcp_tool_called'])
    expect(events[2]!.properties.tool).toBe('other')
    expect(['rpc_error', 'tool_error']).toContain(events[2]!.properties.outcome)
    expect(new Set(events.map((e) => e.distinct_id)).size).toBe(1)
  })

  it('uses city and region only when Cloudflare sends them', () => {
    const withCity = new Headers(headers)
    withCity.set('cf-ipcity', 'Tokyo')
    withCity.set('cf-region', 'Tokyo')
    const [event] = buildMcpAnalyticsEvents(
      context({ headers: withCity }),
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      undefined,
      SECRET,
    )
    expect(event!.properties).toMatchObject({ city: 'Tokyo', region: 'Tokyo' })
  })
})

describe('MCP analytics helpers', () => {
  it('scrubs emails and long digit runs and truncates', () => {
    expect(scrubText('a.b+c@mail.example.org hi')).toBe('[email] hi')
    expect(scrubText('code 123456 and 12345')).toBe('code [number] and 12345')
    expect(Array.from(scrubText('海'.repeat(100))).length).toBe(64)
  })

  it('sanitizes via', () => {
    expect(sanitizeVia(undefined)).toBeUndefined()
    expect(sanitizeVia('')).toBeUndefined()
    expect(sanitizeVia('Guide-Claude')).toBe('guide-claude')
    expect(sanitizeVia('dxrating_home.v2')).toBe('dxrating_home.v2')
    expect(sanitizeVia('a'.repeat(33))).toBe('other')
    expect(sanitizeVia('<script>')).toBe('other')
    expect(sanitizeVia('a b')).toBe('other')
  })

  it('takes the /24 and /48 prefixes', () => {
    expect(ipPrefix('203.0.113.77')).toBe('203.0.113.0/24')
    expect(ipPrefix('2001:db8:1:2::1')).toBe('2001:db8:1::/48')
    expect(ipPrefix('2001:db8::1')).toBe('2001:db8:0::/48')
    expect(ipPrefix('garbage')).toBeUndefined()
  })

  it('keeps a distinct_id for a day and changes it the next', () => {
    const client = { ipPrefix: '203.0.113.0/24', userAgent: 'ua', clientName: 'claude-ai' }
    const morning = dailyDistinctId(SECRET, new Date('2026-10-30T00:00:01Z'), client)
    const night = dailyDistinctId(SECRET, new Date('2026-10-30T23:59:59Z'), client)
    const tomorrow = dailyDistinctId(SECRET, new Date('2026-10-31T00:00:01Z'), client)
    expect(morning).toBe(night)
    expect(tomorrow).not.toBe(morning)
    expect(dailyDistinctId('other', new Date('2026-10-30T00:00:01Z'), client)).not.toBe(morning)
    expect(
      dailyDistinctId(SECRET, new Date('2026-10-30T00:00:01Z'), { ...client, ipPrefix: '198.51.100.0/24' }),
    ).not.toBe(morning)
    expect(morning).not.toContain('203')
  })

  it('logs the full address, country and arguments for Sentry, without secret headers', () => {
    const fields = mcpLogFields({
      headers,
      clientAddress: IP,
      via: 'verify',
      requestBody: call('search_songs', { query: 'umiyuri' }),
    })
    expect(fields).toMatchObject({
      client: { address: IP, address_prefix: '203.0.113.0/24', geo: { country_iso_code: 'JP' } },
      mcp: { via: 'verify' },
      gen_ai: { tool: { call: { arguments: '{"query":"umiyuri"}' } } },
    })
    const serialized = JSON.stringify(fields)
    expect(serialized).not.toContain('top-secret')
    expect(serialized).not.toContain('cookie-secret')
  })
})

describe('MCP analytics queue', () => {
  const list = { jsonrpc: '2.0', id: 1, method: 'tools/list' }

  it('is off without a key, and in tests by default', () => {
    const fetch = vi.fn()
    const analytics = createMcpAnalytics({ apiKey: undefined, fetch })
    analytics.capture(context(), list, undefined)
    expect(analytics.enabled).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    expect(mcpAnalyticsFromEnv({ NODE_ENV: 'test' }).enabled).toBe(false)
    expect(mcpAnalyticsFromEnv({ NODE_ENV: 'production', MCP_POSTHOG_KEY: 'off' }).enabled).toBe(false)
  })

  it('sends batches to PostHog without an address or secret headers', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response('{}'))
    const analytics = createMcpAnalytics({ apiKey: 'phc_test', fetch, secret: SECRET })
    analytics.capture(context(), list, undefined)
    analytics.capture(context(), call('search_songs', { query: 'x' }), undefined)
    await analytics.shutdown()
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://us.i.posthog.com/batch/')
    const body = JSON.parse(String(init!.body))
    expect(body.api_key).toBe('phc_test')
    expect(body.batch).toHaveLength(2)
    expectNoPrivateData(String(init!.body))
    expect(JSON.stringify(init!.headers)).not.toMatch(/authorization/i)
    expect(analytics.stats.sent).toBe(2)
  })

  it('samples and caps per day', async () => {
    const fetch = vi.fn(async () => new Response('{}'))
    const sampled = createMcpAnalytics({ apiKey: 'k', fetch, sampleRate: 0.5, random: () => 0.7 })
    sampled.capture(context(), list, undefined)
    await sampled.shutdown()
    expect(fetch).not.toHaveBeenCalled()

    let now = new Date('2026-10-30T10:00:00Z')
    const capped = createMcpAnalytics({ apiKey: 'k', fetch, dailyCap: 2, now: () => now })
    for (let i = 0; i < 5; i++) capped.capture(context(), list, undefined)
    now = new Date('2026-10-31T10:00:00Z')
    capped.capture(context(), list, undefined)
    await capped.shutdown()
    const sent = fetch.mock.calls.flatMap(
      (c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)).batch,
    )
    expect(sent).toHaveLength(3)
    expect(capped.stats.dropped).toBe(3)
  })

  it('never fails or delays a response when PostHog fails or hangs', async () => {
    const hanging = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('timeout'))),
        ),
    )
    const analytics = createMcpAnalytics({ apiKey: 'k', fetch: hanging, timeoutMs: 20, flushAt: 1 })
    const started = performance.now()
    analytics.capture(context(), list, undefined) // flushAt 1: sends in the background
    expect(performance.now() - started).toBeLessThan(15)
    await analytics.shutdown()
    expect(analytics.stats.failed).toBe(1)

    const throwing = createMcpAnalytics({
      apiKey: 'k',
      fetch: () => {
        throw new Error('boom')
      },
    })
    expect(() => throwing.capture(context(), list, undefined)).not.toThrow()
    await expect(throwing.shutdown()).resolves.toBeUndefined()
    expect(() => throwing.capture(context(), 'not json at all', undefined)).not.toThrow()
  })
})