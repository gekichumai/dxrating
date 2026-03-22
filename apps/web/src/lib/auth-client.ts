import { createAuthClient } from 'better-auth/react'
import { oneTapClient, lastLoginMethodClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_BACKEND_URL,
  plugins: [
    oneTapClient({
      clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    }),
    passkeyClient(),
    lastLoginMethodClient({
      cookieName: 'dxrating.last_used_login_method',
    }),
  ],
})