import { describe, expect, it } from 'vitest'
import { scrubBreadcrumb, scrubEvent, scrubSpan, scrubUrl } from './sentryScrub'

const callback = 'https://dxrating.net/io/import/lxns/oauth_callback?code=synthetic-code&state=synthetic-state'

describe('Sentry scrubbing of OAuth callback parameters', () => {
  it('filters code and state from a worker request event (the shape @sentry/cloudflare emits)', () => {
    const event = scrubEvent({
      request: { url: callback, query_string: 'code=synthetic-code&state=synthetic-state' },
      transaction: 'GET /io/import/lxns/oauth_callback?code=synthetic-code&state=synthetic-state',
    })
    const serialized = JSON.stringify(event)
    expect(serialized).not.toContain('synthetic-code')
    expect(serialized).not.toContain('synthetic-state')
    expect(event.transaction).toBe('GET /io/import/lxns/oauth_callback?code=%5BFiltered%5D&state=%5BFiltered%5D')
    expect(event.request?.url).toBe(
      'https://dxrating.net/io/import/lxns/oauth_callback?code=%5BFiltered%5D&state=%5BFiltered%5D',
    )
  })

  it('filters object and tuple query strings and navigation breadcrumbs', () => {
    const event = scrubEvent({
      request: { query_string: { code: 'synthetic-code', state: 'synthetic-state', locale: 'ja' } },
      breadcrumbs: [{ data: { from: '/rating', to: '/io/import/lxns/oauth_callback?code=synthetic-code&state=s' } }],
    })
    expect(event.request?.query_string).toEqual({ code: '[Filtered]', state: '[Filtered]', locale: 'ja' })
    expect(JSON.stringify(event)).not.toContain('synthetic-code')
    expect(scrubEvent({ request: { query_string: [['code', 'synthetic-code']] as Array<[string, string]> } })).toEqual({
      request: { query_string: [['code', '[Filtered]']] },
    })
    expect(scrubBreadcrumb({ data: { url: `${callback}#x` } }).data?.url).not.toContain('synthetic')
  })

  it('filters trace attributes and spans (url.full, url.query, http.target)', () => {
    const event = scrubEvent({
      contexts: {
        trace: {
          data: {
            'url.full': callback,
            'url.query': '?code=synthetic-code&state=synthetic-state',
            'http.target': '/io/import/lxns/oauth_callback?code=synthetic-code',
            'http.method': 'GET',
          },
        },
      },
      spans: [{ description: `GET ${callback}`, data: { 'url.full': callback } }],
    })
    expect(JSON.stringify(event)).not.toMatch(/synthetic-(code|state)/)
    expect(event.contexts?.trace?.data?.['http.method']).toBe('GET')
    expect(scrubSpan({ description: `GET ${callback}` }).description).toMatch(/^GET https:\/\/dxrating\.net\/io/)
  })

  it('leaves other URLs alone', () => {
    expect(scrubUrl('/songs/abc?type=dx')).toBe('/songs/abc?type=dx')
    expect(scrubUrl('https://dxrating.net/rating')).toBe('https://dxrating.net/rating')
  })
})