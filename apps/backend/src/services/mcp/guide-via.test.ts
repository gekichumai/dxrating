import { describe, expect, it, vi } from 'vitest'
import { buildGuideViewEvent, createMcpAnalytics, isPrefetchOrBot, sanitizeVia } from './analytics'
import { GUIDE_TEXTS } from './guide-text'
import { fillSnippet, guideEndpointUrl, guideResponse, guideView, oneClickUrl, sanitizeGuideVia } from './guide'
import { MCP_PUBLIC_URL } from './listing'

const unescape = (s: string) =>
  s
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')

const get = (path: string, headers: Record<string, string> = {}) =>
  guideResponse(new Request(`https://mcp.dxrating.net${path}`, { headers: { host: 'mcp.dxrating.net', ...headers } }))!

const ORIGIN = 'dxrating-home'
const TAGGED = `${MCP_PUBLIC_URL}?via=${ORIGIN}.guide`

/** Every MCP endpoint URL a text holds, with its via */
const endpointVias = (s: string) =>
  [...s.matchAll(/https:\/\/mcp\.dxrating\.net\/mcp(?:\?via=([a-z0-9_.-]+))?(?![a-z0-9/-])/g)].map((m) => m[1] ?? '')

describe('guide ?via=', () => {
  it('sanitizes the origin', () => {
    expect(sanitizeGuideVia('dxrating-home')).toBe('dxrating-home')
    expect(sanitizeGuideVia('DXRating-Home')).toBe('dxrating-home')
    expect(sanitizeGuideVia('a'.repeat(40))).toBe('a'.repeat(40))
    for (const bad of ['a'.repeat(41), 'a.b', 'a_b', '<x>', 'a b', '"', '', null, undefined]) {
      expect(sanitizeGuideVia(bad)).toBeUndefined()
    }
  })

  it('makes vias /mcp keeps as they are', () => {
    const longest = oneClickUrl('cherry-studio', 'a'.repeat(40))
    const via = new URL(longest).searchParams.get('via')!
    expect(sanitizeVia(via)).toBe(via)
    expect(sanitizeVia(new URL(guideEndpointUrl('a'.repeat(40))).searchParams.get('via'))).toBe(
      `${'a'.repeat(40)}.guide`,
    )
  })

  it('propagates the origin into every endpoint URL of the HTML', async () => {
    for (const t of GUIDE_TEXTS) {
      const html = await get(`/?via=${ORIGIN}&lang=${t.lang}`).text()
      const vias = endpointVias(unescape(html))
      expect(vias.length).toBeGreaterThan(10)
      for (const v of vias) expect(v === `${ORIGIN}.guide` || v.startsWith(`${ORIGIN}.guide-`)).toBe(true)
      expect(html).toContain(`<div class="field" data-c="${TAGGED}"><code>${TAGGED}</code>`)
      // the agent prompt
      expect(unescape(html.match(/<pre class="prompt"><code>([^<]*)</)![1])).toContain(TAGGED)
      // shell commands quote the URL
      expect(unescape(html)).toContain(`claude mcp add --transport http --scope user dxrating '${TAGGED}'`)
      expect(html).toContain(`?lang=ja&amp;via=${ORIGIN}`)
    }
  })

  it('propagates the origin into the Markdown and llms.txt', async () => {
    for (const path of [`/index.md?lang=en&via=${ORIGIN}`, `/llms.txt?via=${ORIGIN}`, `/?via=${ORIGIN}`]) {
      const md = await get(path, { accept: 'text/markdown' }).text()
      const vias = endpointVias(md)
      expect(vias.length).toBeGreaterThan(5)
      for (const v of vias) expect(v === `${ORIGIN}.guide` || v.startsWith(`${ORIGIN}.guide-`)).toBe(true)
      expect(md).toContain(`\`${TAGGED}\``)
    }
  })

  it('decodes the one-click links to the tagged endpoint', async () => {
    const html = unescape(await get(`/?via=${ORIGIN}`).text())
    const href = (prefix: string) => html.match(new RegExp(`href="(${prefix.replace(/[.?]/g, '\\$&')}[^"]+)"`))![1]
    const claude = new URL(href('https://claude.ai/customize/connectors?'))
    expect(claude.searchParams.get('connectorUrl')).toBe(`${MCP_PUBLIC_URL}?via=${ORIGIN}.guide-claude`)
    const cursor = new URL(href('https://cursor.com/en/install-mcp?'))
    expect(JSON.parse(Buffer.from(cursor.searchParams.get('config')!, 'base64').toString())).toEqual({
      url: `${MCP_PUBLIC_URL}?via=${ORIGIN}.guide-cursor`,
    })
    const vscode = new URL(href('https://vscode.dev/redirect/mcp/install?'))
    expect(JSON.parse(vscode.searchParams.get('config')!)).toEqual({
      type: 'http',
      url: `${MCP_PUBLIC_URL}?via=${ORIGIN}.guide-vscode`,
    })
    const cherry = new URL(href('cherrystudio://mcp/install?'))
    expect(JSON.parse(Buffer.from(cherry.searchParams.get('servers')!, 'base64').toString())).toEqual({
      mcpServers: { dxrating: { type: 'streamableHttp', url: `${MCP_PUBLIC_URL}?via=${ORIGIN}.guide-cherry-studio` } },
    })
    for (const u of [claude.searchParams.get('connectorUrl')!]) {
      const parsed = new URL(u)
      expect(`${parsed.origin}${parsed.pathname}`).toBe(MCP_PUBLIC_URL)
    }
  })

  it('ignores an invalid via', async () => {
    const plain = await get('/?lang=en').text()
    for (const bad of ['a.b', '<script>', 'x'.repeat(41), 'a%20b']) {
      expect(await get(`/?lang=en&via=${encodeURIComponent(bad)}`).text()).toBe(plain)
    }
    expect(endpointVias(unescape(plain)).every((v) => v === '' || /^guide-[a-z-]+$/.test(v))).toBe(true)
    expect(plain).toContain(`<div class="field" data-c="${MCP_PUBLIC_URL}"><code>${MCP_PUBLIC_URL}</code>`)
  })

  it('keeps the hashed CSP and the private cache', () => {
    const tagged = get(`/?via=${ORIGIN}`)
    const plain = get('/')
    expect(tagged.headers.get('content-security-policy')).toBe(plain.headers.get('content-security-policy'))
    expect(tagged.headers.get('cache-control')).toBe('private, max-age=300')
  })

  it('fills shell snippets with a quoted URL only when it has a query', () => {
    expect(fillSnippet('x {url-sh} {url}', MCP_PUBLIC_URL)).toBe(`x ${MCP_PUBLIC_URL} ${MCP_PUBLIC_URL}`)
    expect(fillSnippet('x {url-sh}', TAGGED)).toBe(`x '${TAGGED}'`)
  })

  it('describes views', () => {
    const view = (path: string, init: RequestInit = {}) =>
      guideView(
        new Request(`https://mcp.dxrating.net${path}`, {
          ...init,
          headers: { host: 'mcp.dxrating.net', ...init.headers },
        }),
      )
    expect(view(`/?via=${ORIGIN}&lang=ja`)).toEqual({ format: 'html', lang: 'ja', via: ORIGIN })
    expect(view('/llms.txt?via=bad.via')).toEqual({ format: 'llms', lang: 'en', via: undefined })
    expect(view('/', { headers: { accept: 'text/markdown' } })?.format).toBe('markdown')
    expect(view('/robots.txt')).toBeUndefined()
    expect(view('/', { method: 'HEAD' })).toBeUndefined()
  })
})

describe('mcp_guide_viewed', () => {
  const headers = new Headers({ 'user-agent': 'Mozilla/5.0 Safari', 'cf-ipcountry': 'JP' })
  const context = { headers, clientAddress: '203.0.113.9', via: ORIGIN, lang: 'ja', format: 'html', deployment: 'test' }

  it('holds the origin, language and country, and no address', () => {
    const event = buildGuideViewEvent(context, 'secret', new Date('2026-10-30T00:00:00Z'))
    expect(event.event).toBe('mcp_guide_viewed')
    expect(event.properties).toMatchObject({
      via: ORIGIN,
      lang: 'ja',
      country: 'JP',
      platform: 'mcp',
      deployment: 'test',
      $ip: null,
      $geoip_disable: true,
      $process_person_profile: false,
    })
    expect(JSON.stringify(event)).not.toContain('203.0.113')
    expect(event.distinct_id).toMatch(/^[0-9a-f]{32}$/)
  })

  it('is sent under the sampling and the daily cap', async () => {
    const fetch = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => new Response('{}'))
    const analytics = createMcpAnalytics({ apiKey: 'k', fetch, secret: 's', dailyCap: 1, deployment: 'production' })
    analytics.captureGuideView(context)
    analytics.captureGuideView(context)
    await analytics.shutdown()
    const body = JSON.parse(String(fetch.mock.calls[0]![1]!.body))
    expect(body.batch).toHaveLength(1)
    expect(body.batch[0].properties.deployment).toBe('production')
    expect(analytics.stats.dropped).toBe(1)
    const sampled = createMcpAnalytics({ apiKey: 'k', fetch, sampleRate: 0.5, random: () => 0.9 })
    sampled.captureGuideView(context)
    await sampled.shutdown()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('skips prefetches and crawlers', () => {
    expect(isPrefetchOrBot(new Headers({ 'sec-purpose': 'prefetch' }))).toBe(true)
    expect(isPrefetchOrBot(new Headers({ 'user-agent': 'Googlebot/2.1' }))).toBe(true)
    expect(isPrefetchOrBot(headers)).toBe(false)
  })
})