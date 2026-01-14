
import { createAuthClient } from "better-auth/react"
import { oneTapClient, passkeyClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
    baseURL: import.meta.env.VITE_BETTER_AUTH_URL,
    plugins: [
        passkeyClient(),
        oneTapClient({
            clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        }),
    ]
})
