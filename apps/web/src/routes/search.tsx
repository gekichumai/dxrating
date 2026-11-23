import { createFileRoute, redirect } from '@tanstack/react-router'
import { localizePath, splitLocalePath } from '@/setup/locale'

// The chart search moved to the home page. Old /search links (bookmarks, OpenSearch clients, the iOS app's shared
// links) keep working through a permanent redirect that carries the query, hash and language along.
export const Route = createFileRoute('/search')({
  beforeLoad: ({ location }) => {
    // The parsed location's hash excludes the leading `#`.
    const hash = location.hash ? `#${location.hash.replace(/^#/, '')}` : ''
    // A redirect with an href skips the router's output rewrite, so the language prefix of the public URL
    // (`/ja/search`) is added here
    const { locale } = splitLocalePath(new URL(location.publicHref ?? '/', 'https://dxrating.net').pathname)
    throw redirect({ href: `${localizePath('/', locale)}${location.searchStr}${hash}`, statusCode: 301 })
  },
})