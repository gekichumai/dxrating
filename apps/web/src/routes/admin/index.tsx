import { createFileRoute } from '@tanstack/react-router'
import { AdminHomePage } from '@/components/admin/AdminHomePage'

// Admin pages (gekichumai/meta#50): client-rendered only, never indexed, and not on the HTML cache allowlist.
// The backend's `requireAdmin` guards every admin call; this page only hides itself from everyone else.
export const Route = createFileRoute('/admin/')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Admin · DXRating' }, { name: 'robots', content: 'noindex, nofollow' }] }),
  component: AdminHomePage,
})