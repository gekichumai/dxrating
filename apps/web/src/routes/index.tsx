import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  ssr: false,
  beforeLoad: () => {
    const saved =
      typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('tab-selection') ?? '"search"') : 'search'
    const tab = saved === 'rating' ? 'rating' : 'search'
    throw redirect({ to: `/${tab}` })
  },
})