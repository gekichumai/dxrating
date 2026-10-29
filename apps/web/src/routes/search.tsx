import { createFileRoute, redirect } from '@tanstack/react-router'

// The chart search moved to the home page. Old /search links (bookmarks, OpenSearch clients, the iOS app's shared
// links) keep working through a permanent redirect that carries the query and hash along.
export const Route = createFileRoute('/search')({
  beforeLoad: ({ location }) => {
    throw redirect({ href: `/${location.searchStr}${location.hash}`, statusCode: 301 })
  },
})