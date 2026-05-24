import { createFileRoute, redirect } from '@tanstack/react-router'
import { resolveAppTab } from './-appTabs'

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
    const tab = resolveAppTab(saved)
    const suffix = `${location.searchStr}${location.hash}`
    throw redirect({ href: `/${tab}${suffix}` })
  },
})