export const API_CATALOG_PATH = '/.well-known/api-catalog'
export const API_CATALOG_CONTENT_TYPE =
  'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"; charset=utf-8'

export const AGENT_DISCOVERY_RELATIONS = [
  { href: API_CATALOG_PATH, rel: 'api-catalog', type: 'application/linkset+json' },
  {
    href: 'https://miruku.dxrating.net/spec.json',
    rel: 'service-desc',
    type: 'application/vnd.oai.openapi+json',
  },
  { href: 'https://miruku.dxrating.net/docs', rel: 'service-doc', type: 'text/html' },
  { href: '/developers', rel: 'service-doc', type: 'text/html' },
  { href: '/llms.txt', rel: 'describedby', type: 'text/markdown' },
] as const

export const AGENT_DISCOVERY_LINKS = AGENT_DISCOVERY_RELATIONS.map(
  ({ href, rel, type }) => `<${href}>; rel="${rel}"; type="${type}"`,
)

export function buildAgentDiscoveryLinkHeader() {
  return AGENT_DISCOVERY_LINKS.join(', ')
}

export function applyAgentDiscoveryHeaders(headers: Headers) {
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
            href: 'https://dxrating.net/developers',
            type: 'text/html',
          },
          {
            href: 'https://miruku.dxrating.net/docs',
            type: 'text/html',
          },
        ],
        describedby: [
          {
            href: 'https://dxrating.net/llms.txt',
            type: 'text/markdown',
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