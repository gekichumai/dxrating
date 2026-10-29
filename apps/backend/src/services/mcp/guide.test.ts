import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { buildMcpCatalog } from './catalog'
import { APP_DOCS, CHAT_APPS, CODING_TOOLS, GUIDE_TEXTS } from './guide-text'
import { GUIDE_CSP, GUIDE_TOOLS, guideLanguage, guideResponse, isMcpHost, renderGuide } from './guide'
import { handleMcpRequest } from './http'
import { MCP_PUBLIC_URL } from './listing'
import { createMcpServer } from './server'
import { publishedCatalog } from './test-fixture'

const request = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
  new Request(`https://mcp.dxrating.net${path}`, { method, headers: { host: 'mcp.dxrating.net', ...headers } })

describe('guide', () => {
  it('renders every language, with no placeholder left', () => {
    const { pages, llms } = renderGuide()
    expect([...pages.keys()]).toEqual(['en', 'ja', 'zh-Hans', 'zh-Hant'])
    for (const [lang, page] of pages) {
      for (const body of [page.html, page.markdown]) {
        expect(body, lang).not.toMatch(/\{[a-z][a-z0-9.-]*\}/)
        expect(body, lang).toContain(MCP_PUBLIC_URL)
        for (const tool of GUIDE_TOOLS) expect(body, lang).toContain(tool)
      }
      expect(page.html).toContain(`<html lang="${lang}">`)
    }
    expect(llms).toContain('If you are an AI agent asked to connect this server')
  })

  it('lists the tools of the server, and every app in every language', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await createMcpServer(buildMcpCatalog('1', publishedCatalog)).connect(serverTransport)
    const client = new Client({ name: 'test', version: '1.0.0' })
    await client.connect(clientTransport)
    const { tools } = await client.listTools()
    await client.close()
    expect(GUIDE_TOOLS).toEqual(tools.map((tool) => tool.name))
    for (const text of GUIDE_TEXTS) {
      expect(Object.keys(text.tools), text.lang).toEqual(GUIDE_TOOLS)
      expect(Object.keys(text.apps).sort(), text.lang).toEqual([...CHAT_APPS, ...CODING_TOOLS].sort())
    }
    expect(Object.keys(APP_DOCS).sort()).toEqual([...CHAT_APPS, ...CODING_TOOLS].sort())
  })

  it('gives JSON snippets that parse, and one-click links with the endpoint', () => {
    const html = renderGuide().pages.get('en')!.html
    for (const [, code] of html.matchAll(/<pre><code class="language-json">([^<]*)<\/code><\/pre>/g)) {
      const json = code.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&')
      expect(() => JSON.parse(json)).not.toThrow()
    }
    const endpoint = encodeURIComponent(MCP_PUBLIC_URL)
    expect(html).toContain(`connectorUrl=${endpoint}`)
    const cursor = html.match(/cursor\.com\/en\/install-mcp\?name=dxrating&amp;config=([^"]+)/)![1]
    expect(JSON.parse(Buffer.from(decodeURIComponent(cursor), 'base64').toString())).toEqual({ url: MCP_PUBLIC_URL })
  })

  it('picks the language of ?lang, else of Accept-Language', () => {
    expect(guideLanguage('ja', 'en')).toBe('ja')
    expect(guideLanguage('zh-hant', null)).toBe('zh-Hant')
    expect(guideLanguage(null, 'zh-TW,zh;q=0.9')).toBe('zh-Hant')
    expect(guideLanguage(null, 'zh-CN,en;q=0.8')).toBe('zh-Hans')
    expect(guideLanguage(null, 'ko;q=1, ja;q=0.5, en;q=0.6')).toBe('en')
    expect(guideLanguage('xx', 'fr')).toBe('en')
  })
})

describe('guide responses', () => {
  it('answers its host only, at its paths', () => {
    expect(
      guideResponse(new Request('https://miruku.dxrating.net/', { headers: { host: 'miruku.dxrating.net' } })),
    ).toBeUndefined()
    expect(guideResponse(request('/docs'))).toBeUndefined()
    expect(isMcpHost(new Headers({ host: 'miruku.dxrating.net', 'x-forwarded-host': 'mcp.dxrating.net' }))).toBe(true)
    expect(isMcpHost(new Headers({ host: 'MCP.dxrating.net:443' }))).toBe(true)
  })

  it('serves HTML to browsers and Markdown to agents', async () => {
    const html = guideResponse(request('/', { accept: 'text/html,*/*', 'accept-language': 'ja' }))!
    expect(html.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(html.headers.get('content-language')).toBe('ja')
    expect(html.headers.get('content-security-policy')).toBe(GUIDE_CSP)
    expect(html.headers.get('vary')).toBe('Accept, Accept-Language')
    expect(await html.text()).toContain('DXRating MCP サーバー')

    const markdown = guideResponse(request('/?lang=zh-Hans', { accept: 'text/markdown' }))!
    expect(markdown.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
    expect(await markdown.text()).toMatch(/^# DXRating MCP 服务器/)

    const index = guideResponse(request('/index.md?lang=zh-Hant'))!
    expect(index.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(await index.text()).toMatch(/^# DXRating MCP 伺服器/)

    const llms = guideResponse(request('/llms.txt'))!
    expect(llms.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(await llms.text()).toContain('> Read-only remote MCP server')

    const robots = await guideResponse(request('/robots.txt'))!.text()
    expect(robots).toContain('Disallow: /mcp\n')
    expect(robots).toContain('Allow: /mcp/server-card\n')

    expect(await guideResponse(request('/', {}, 'HEAD'))!.text()).toBe('')
  })

  it('sends an MCP client given the guide on to the endpoint', async () => {
    const response = guideResponse(request('/', { 'content-type': 'application/json' }, 'POST'))!
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(MCP_PUBLIC_URL)
    expect((await response.json()).error.message).toContain(MCP_PUBLIC_URL)
  })

  it('sends a browser opening the endpoint to the guide', async () => {
    const response = await handleMcpRequest(
      new Request(MCP_PUBLIC_URL, { headers: { accept: 'text/html' } }),
      undefined,
    )
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://mcp.dxrating.net/')
  })
})