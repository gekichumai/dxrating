import { describe, expect, it } from 'vitest'
import { buildRobotsTxt } from '../robots[.]txt'

describe('buildRobotsTxt', () => {
  it('explicitly allows search, user-fetch, and training AI crawlers', () => {
    const robots = buildRobotsTxt()

    for (const userAgent of [
      'OAI-SearchBot',
      'GPTBot',
      'ChatGPT-User',
      'Claude-SearchBot',
      'ClaudeBot',
      'Claude-User',
      'PerplexityBot',
      'Perplexity-User',
      'Googlebot',
      'Applebot',
    ]) {
      expect(robots).toContain(`User-agent: ${userAgent}\nAllow: /`)
    }

    expect(robots).not.toContain('Disallow: /')
    expect(robots).toContain('Sitemap: https://dxrating.net/sitemap.xml')
    expect(robots).toContain('LLM-Info: https://dxrating.net/llms.txt')
  })
})