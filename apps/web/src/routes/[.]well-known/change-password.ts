import { createFileRoute } from '@tanstack/react-router'

const CHANGE_PASSWORD_PATH = '/account/security'

export function createChangePasswordRedirect(request: Request) {
  return new Response(null, {
    status: 302,
    headers: { Location: new URL(CHANGE_PASSWORD_PATH, request.url).toString() },
  })
}

export const Route = createFileRoute('/.well-known/change-password')({
  server: {
    handlers: {
      GET: async ({ request }) => createChangePasswordRedirect(request),
      HEAD: async ({ request }) => createChangePasswordRedirect(request),
    },
  },
})