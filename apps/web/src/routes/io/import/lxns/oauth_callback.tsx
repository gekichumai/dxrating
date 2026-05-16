import { createFileRoute } from '@tanstack/react-router'
import { LxnsOauthCallback } from '@/pages/LxnsOauthCallback'

export const Route = createFileRoute('/io/import/lxns/oauth_callback')({
  ssr: false,
  component: LxnsOauthCallback,
})