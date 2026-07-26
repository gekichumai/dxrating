import { createFileRoute } from '@tanstack/react-router'

const APP_ID = 'F25GFFJL49.net.dxrating.ios'
const APP_PATHS = [
  '/songs/*',
  '/charts/recent',
  '/charts/trending',
  '/search',
  '/rating',
  '/account',
  '/privacy-policy',
  '/io/import/lxns/oauth_callback',
  '/*/std/*',
  '/*/dx/*',
  '/*/utage/*',
]

export function buildAppleAppSiteAssociation() {
  return JSON.stringify({
    applinks: {
      apps: [],
      details: [
        {
          appID: APP_ID,
          paths: APP_PATHS,
        },
      ],
    },
    webcredentials: {
      apps: [APP_ID],
    },
  })
}

function buildAppleAppSiteAssociationHeaders() {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600',
  }
}

export const Route = createFileRoute('/.well-known/apple-app-site-association')({
  server: {
    handlers: {
      GET: async () =>
        new Response(buildAppleAppSiteAssociation(), {
          headers: buildAppleAppSiteAssociationHeaders(),
        }),
      HEAD: async () =>
        new Response(null, {
          headers: buildAppleAppSiteAssociationHeaders(),
        }),
    },
  },
})