import { createFileRoute, redirect } from '@tanstack/react-router'

// The chart search moved to the home page. Old /search links (bookmarks, OpenSearch clients, the iOS app's shared
// links) keep working through a permanent redirect that carries the query and hash along.
export const Route = createFileRoute('/search')({
  beforeLoad: ({ location }) => {
    // The parsed location's hash excludes the leading `#`.
    const hash = location.hash ? `#${location.hash.replace(/^#/, '')}` : ''
    throw redirect({ href: `/${location.searchStr}${hash}`, statusCode: 301 })
  },
})