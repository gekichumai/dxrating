
import { createORPCClient } from '@orpc/client'
import { appContract } from './contract'
import { authClient } from './auth-client'

export const orpc = createORPCClient(appContract, {
  baseURL: import.meta.env.VITE_BACKEND_URL + '/api',
  fetch: async (url, init) => {
    // Add auth headers or handle credentials if needed
    // BetterAuth cookies should handle session automatically if same-origin or CORS configured correctly
    return fetch(url, {
        ...init,
        credentials: 'include' // Important for sharing cookies
    })
  }
})
