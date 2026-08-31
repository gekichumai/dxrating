import { describe, expect, it } from 'vitest'
import {
  API_CATALOG_CONTENT_TYPE,
  API_CATALOG_PATH,
  applyAgentDiscoveryHeaders,
  buildAgentDiscoveryLinkHeader,
  buildApiCatalog,
  buildApiCatalogJson,
} from '../agent-discovery'

describe('agent discovery', () => {
  it('builds registered RFC 8288 Link relations for agent discovery', () => {
    const linkHeader = buildAgentDiscoveryLinkHeader()

    expect(linkHeader).toContain(`<${API_CATALOG_PATH}>; rel="api-catalog"; type="application/linkset+json"`)
    expect(linkHeader).toContain(
      '<https://miruku.dxrating.net/spec.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
    )
    expect(linkHeader).toContain('<https://miruku.dxrating.net/docs>; rel="service-doc"; type="text/html"')
    expect(linkHeader).toContain('</developers>; rel="service-doc"; type="text/html"')
    expect(linkHeader).toContain('</llms.txt>; rel="describedby"; type="text/markdown"')
  })

  it('applies Link headers to final page responses as well as the homepage redirect', () => {
    const homepageHeaders = new Headers()
    const searchHeaders = new Headers()

    applyAgentDiscoveryHeaders(homepageHeaders)
    applyAgentDiscoveryHeaders(searchHeaders)

    expect(homepageHeaders.get('Link')).toBe(buildAgentDiscoveryLinkHeader())
    expect(searchHeaders.get('Link')).toBe(buildAgentDiscoveryLinkHeader())
  })

  it('does not duplicate existing Link values', () => {
    const headers = new Headers()

    applyAgentDiscoveryHeaders(headers)
    applyAgentDiscoveryHeaders(headers)

    expect(headers.get('Link')).toBe(buildAgentDiscoveryLinkHeader())
  })

  it('builds an RFC 9727 linkset API catalog', () => {
    const catalog = buildApiCatalog()

    expect(API_CATALOG_CONTENT_TYPE).toContain('application/linkset+json')
    expect(API_CATALOG_CONTENT_TYPE).toContain('https://www.rfc-editor.org/info/rfc9727')
    expect(catalog.linkset[0]).toEqual({
      anchor: `https://dxrating.net${API_CATALOG_PATH}`,
      item: [{ href: 'https://miruku.dxrating.net/api/v1' }],
    })
    expect(catalog.linkset[1]).toMatchObject({
      anchor: 'https://miruku.dxrating.net/api/v1',
      'service-desc': [{ href: 'https://miruku.dxrating.net/spec.json' }],
      'service-doc': [{ href: 'https://dxrating.net/developers' }, { href: 'https://miruku.dxrating.net/docs' }],
      describedby: [
        { href: 'https://dxrating.net/llms.txt', type: 'text/markdown' },
        { href: 'https://dxrating.net/sitemap.xml', type: 'application/xml' },
      ],
    })
    expect(JSON.parse(buildApiCatalogJson())).toEqual(catalog)
  })
})