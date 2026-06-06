export const API_CATALOG_PATH = '/.well-known/api-catalog'
export const API_CATALOG_CONTENT_TYPE =
  'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"; charset=utf-8'

export const AGENT_DISCOVERY_LINKS = [
  `<${API_CATALOG_PATH}>; rel="api-catalog"; type="application/linkset+json"`,
  '<https://miruku.dxrating.net/spec.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
  '<https://miruku.dxrating.net/docs>; rel="service-doc"; type="text/html"',
  '</llms.txt>; rel="describedby"; type="text/plain"',
]

export function buildAgentDiscoveryLinkHeader() {
  return AGENT_DISCOVERY_LINKS.join(', ')
}

export function isHomepageRequest(request: Request) {
  return new URL(request.url).pathname === '/'
}

export function applyHomepageAgentDiscoveryHeaders(headers: Headers, request: Request) {
  if (!isHomepageRequest(request)) return

  appendLinkHeader(headers, AGENT_DISCOVERY_LINKS)
}

export function buildApiCatalog() {
  return {
    linkset: [
      {
        anchor: `https://dxrating.net${API_CATALOG_PATH}`,
        item: [{ href: 'https://miruku.dxrating.net/api/v1' }],
      },
      {
        anchor: 'https://miruku.dxrating.net/api/v1',
        'service-desc': [
          {
            href: 'https://miruku.dxrating.net/spec.json',
            type: 'application/vnd.oai.openapi+json',
          },
        ],
        'service-doc': [
          {
            href: 'https://miruku.dxrating.net/docs',
            type: 'text/html',
          },
        ],
        describedby: [
          {
            href: 'https://dxrating.net/llms.txt',
            type: 'text/plain',
          },
          {
            href: 'https://dxrating.net/sitemap.xml',
            type: 'application/xml',
          },
        ],
        status: [
          {
            href: 'https://miruku.dxrating.net/health',
            type: 'application/json',
          },
        ],
      },
    ],
  }
}

export function buildApiCatalogJson() {
  return `${JSON.stringify(buildApiCatalog(), null, 2)}\n`
}

function appendLinkHeader(headers: Headers, links: string[]) {
  const existingLinkHeader = headers.get('Link') ?? ''

  for (const link of links) {
    if (!existingLinkHeader.includes(link)) {
      headers.append('Link', link)
    }
  }
}