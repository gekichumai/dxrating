import { createFileRoute } from '@tanstack/react-router'
import { API_CATALOG_CONTENT_TYPE, buildAgentDiscoveryLinkHeader, buildApiCatalogJson } from '@/setup/agent-discovery'

function buildApiCatalogHeaders() {
  return {
    'Content-Type': API_CATALOG_CONTENT_TYPE,
    'Cache-Control': 'public, max-age=86400',
    Link: buildAgentDiscoveryLinkHeader(),
  }
}

export const Route = createFileRoute('/.well-known/api-catalog')({
  server: {
    handlers: {
      GET: async () =>
        new Response(buildApiCatalogJson(), {
          headers: buildApiCatalogHeaders(),
        }),
      HEAD: async () =>
        new Response(null, {
          headers: buildApiCatalogHeaders(),
        }),
    },
  },
})