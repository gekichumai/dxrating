import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  ssr: false,
  head: () => ({
    links: [{ rel: 'canonical', href: 'https://dxrating.net' }],
  }),
  beforeLoad: ({ location }) => {
    const suffix = `${location.searchStr}${location.hash}`
    throw redirect({ href: `/search${suffix}` })
  },
})