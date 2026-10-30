import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildMcpCatalog } from './catalog'
import { APP_DOCS, CHAT_APPS, CODING_TOOLS, GUIDE_TEXTS } from './guide-text'
import { GUIDE_CSP, GUIDE_TOOLS, guideLanguage, guideResponse, isMcpHost, renderGuide } from './guide'
import { handleMcpRequest } from './http'
import { MCP_PUBLIC_URL } from './listing'
import { createMcpServer } from './server'
import { publishedCatalog } from './test-fixture'

const unescape = (s: string) =>
  s
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')

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
      expect(page.html).toContain(`<html lang="${lang}" `)
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
    const json = [...html.matchAll(/<div class="code code-json" data-c="([^"]*)">/g)].map(([, c]) => unescape(c))
    expect(json.length).toBeGreaterThan(5)
    for (const code of json) expect(() => JSON.parse(code)).not.toThrow()
    const endpoint = encodeURIComponent(`${MCP_PUBLIC_URL}?via=guide-claude`)
    expect(html).toContain(`connectorUrl=${endpoint}`)
    const cursor = html.match(/cursor\.com\/en\/install-mcp\?name=dxrating&amp;config=([^"]+)/)![1]
    expect(JSON.parse(Buffer.from(decodeURIComponent(cursor), 'base64').toString())).toEqual({
      url: `${MCP_PUBLIC_URL}?via=guide-cursor`,
    })
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

describe('guide page', () => {
  const pages = [...renderGuide().pages]
  const sha256 = (s: string) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`

  it('allows its inline style and script by their hashes, and nothing else', () => {
    for (const [lang, { html }] of pages) {
      const style = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)]
      const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
      expect(style.length, lang).toBe(1)
      expect(script.length, lang).toBe(1)
      expect(GUIDE_CSP, lang).toContain(`style-src ${sha256(style[0][1])};`)
      expect(GUIDE_CSP, lang).toContain(`script-src ${sha256(script[0][1])};`)
      expect(html.match(/<script/g)?.length, lang).toBe(1)
      expect(html.match(/<style/g)?.length, lang).toBe(1)
      expect(html, lang).not.toMatch(/rel="stylesheet"|@import|\son[a-z]+=|style="/)
    }
    for (const directive of [
      "default-src 'none';",
      'font-src https://shama.dxrating.net;',
      'img-src https://shama.dxrating.net;',
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ]) {
      expect(GUIDE_CSP).toContain(directive)
    }
  })

  it('loads nothing but the icon and the fonts of dxrating.net', () => {
    for (const [lang, { html }] of pages) {
      for (const [, src] of html.matchAll(/\ssrc="([^"]*)"/g))
        expect(src, lang).toMatch(/^https:\/\/shama\.dxrating\.net\//)
      const urls = [...html.matchAll(/url\(([^)]*)\)/g)].map(([, u]) => u)
      expect(urls, lang).toEqual([
        'https://shama.dxrating.net/fonts/Torus-Regular.woff2',
        'https://shama.dxrating.net/fonts/Torus-SemiBold.woff2',
      ])
      for (const [, href] of html.matchAll(/<use href="([^"]*)"/g)) {
        expect(html, lang).toContain(`<symbol id="${href.slice(1)}"`)
      }
    }
  })

  it('links to anchors it has, each id once, a tab for every app', () => {
    for (const [lang, { html }] of pages) {
      const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id)
      expect(new Set(ids).size, lang).toBe(ids.length)
      for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) expect(ids, `${lang} #${id}`).toContain(id)
      const tabs = [...html.matchAll(/<a class="tab" href="#([^"]+)"/g)].map(([, id]) => id)
      const panels = [...html.matchAll(/<section class="app-p" id="([^"]+)"/g)].map(([, id]) => id)
      expect(tabs, lang).toEqual([...CHAT_APPS, ...CODING_TOOLS, 'other'])
      expect(panels, lang).toEqual(tabs)
      for (const id of ['agent', 'install', 'try', 'tools', 'data', 'limits', 'privacy', 'troubleshooting', 'links']) {
        expect(ids, lang).toContain(id)
      }
    }
  })

  it('links its logo and name to the website, in the same tab, with a name in its language', () => {
    for (const [lang, { html }] of pages) {
      const home = GUIDE_TEXTS.find((t) => t.lang === lang)!.ui.home
      expect(home, lang).toContain('DXRating')
      expect(html, lang).toMatch(
        new RegExp(
          `<a class="home" href="https://dxrating\\.net/" aria-label="${home}"><img [^>]*><span>DXRating</span></a><span class="chip">MCP</span>`,
        ),
      )
      expect(html, lang).not.toContain('target=')
    }
  })

  it('has a copy button for every text to copy, which copies it as plain text', () => {
    for (const [lang, { html }] of pages) {
      const texts = [...html.matchAll(/data-c="([^"]*)"/g)].map(([, c]) => unescape(c))
      expect(html.match(/<button type="button" class="cp[ "]/g)?.length, lang).toBe(texts.length)
      expect(texts.length, lang).toBeGreaterThan(20)
      for (const text of texts) {
        expect(text, lang).not.toBe('')
        expect(text, lang).not.toMatch(/[<>`]|\*\*/)
      }
      expect(texts, lang).toContain(MCP_PUBLIC_URL)
      const prompt = GUIDE_TEXTS.find((t) => t.lang === lang)!.agentPrompt
      expect(
        texts.some((t) => t.startsWith(prompt.slice(0, 30))),
        lang,
      ).toBe(true)
    }
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
    expect(index.headers.get('vary')).toBeNull()
    expect(await index.text()).toMatch(/^# DXRating MCP 伺服器/)
    // without ?lang the language comes from Accept-Language, so shared caches must not keep one for all
    for (const [acceptLanguage, title] of [
      ['ja', /^# DXRating MCP サーバー/],
      ['en', /^# DXRating MCP Server/],
    ] as const) {
      const negotiated = guideResponse(request('/index.md', { 'accept-language': acceptLanguage }))!
      expect(negotiated.headers.get('vary')).toBe('Accept-Language')
      expect(negotiated.headers.get('cache-control')).toBe('private, max-age=300')
      expect(await negotiated.text()).toMatch(title)
    }

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