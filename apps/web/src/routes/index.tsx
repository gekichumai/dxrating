import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    // Redirect to last-used tab or default to /search
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('tab-selection')
        const tab = saved ? JSON.parse(saved) : 'search'
        if (tab === 'rating' || tab === 'search') {
          throw redirect({ to: `/${tab}` })
        }
      } catch (e) {
        if (e instanceof Response || (e && typeof e === 'object' && 'to' in e)) throw e
      }
    }
    throw redirect({ to: '/search' })
  },
})
