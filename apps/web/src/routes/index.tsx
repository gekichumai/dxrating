import { createFileRoute, redirect } from '@tanstack/react-router'
import { APP_TAB_LINKS } from './-top-nav-links'

export const Route = createFileRoute('/')({
  ssr: false,
  head: () => ({
    links: [{ rel: 'canonical', href: 'https://dxrating.net' }],
  }),
  beforeLoad: ({ location }) => {
    let saved = 'search'
    if (typeof window !== 'undefined') {
      try {
        saved = JSON.parse(localStorage.getItem('tab-selection') ?? '"search"')
      } catch {
        saved = 'search'
      }
    }
    const href = APP_TAB_LINKS.find((link) => link.value === saved)?.href ?? '/search'
    const suffix = `${location.searchStr}${location.hash}`
    throw redirect({ href: `${href}${suffix}` })
  },
})