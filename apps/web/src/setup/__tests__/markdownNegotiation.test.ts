import { describe, expect, it } from 'vitest'
import { acceptsMarkdown, normalizeMarkdownAcceptForHtmlRender } from '../markdownNegotiation'

describe('markdown negotiation', () => {
  it('detects text/markdown in the Accept header', () => {
    const request = new Request('https://dxrating.net/search', {
      headers: { Accept: 'application/json;q=0.8, text/markdown; charset=utf-8' },
    })

    expect(acceptsMarkdown(request)).toBe(true)
  })

  it('normalizes GET markdown requests to HTML for SSR rendering', () => {
    const request = new Request('https://dxrating.net/search', {
      headers: { Accept: 'text/markdown' },
    })

    const normalized = normalizeMarkdownAcceptForHtmlRender(request)

    expect(normalized.headers.get('Accept')).toContain('text/html')
  })

  it('does not normalize non-markdown requests', () => {
    const request = new Request('https://dxrating.net/search', {
      headers: { Accept: 'text/html' },
    })

    expect(normalizeMarkdownAcceptForHtmlRender(request)).toBe(request)
  })

  it('does not normalize non-document methods', () => {
    const request = new Request('https://dxrating.net/search', {
      method: 'POST',
      headers: { Accept: 'text/markdown' },
    })

    expect(normalizeMarkdownAcceptForHtmlRender(request)).toBe(request)
  })
})
