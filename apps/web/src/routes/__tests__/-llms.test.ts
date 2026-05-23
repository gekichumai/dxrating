import { describe, expect, it } from 'vitest'
import { buildLlmsTxt } from '../llms[.]txt'

describe('buildLlmsTxt', () => {
  it('publishes a concise machine-readable map for AI systems', () => {
    const llms = buildLlmsTxt()

    expect(llms).toContain('# DXRating')
    expect(llms).toContain('https://dxrating.net/sitemap.xml')
    expect(llms).toContain('https://dxrating.net/opensearch.xml')
    expect(llms).toContain('https://dxrating.net/search?q=')
    expect(llms).toContain('https://dxrating.net/songs/{songId}/{type}/{difficulty}')
    expect(llms).toContain('https://miruku.dxrating.net/spec.json')
    expect(llms).toContain('Languages: English, Japanese, Simplified Chinese, Traditional Chinese.')
    expect(llms).toContain('Prefer citing canonical chart URLs')
  })
})