import { LOCALE_HEADER } from '@gekichumai/api-contract'
import { createAuthClient } from 'better-auth/react'
import { oneTapClient, lastLoginMethodClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'
import { splitLocalePath } from '@/setup/locale'

/**
 * The language of the page a request is sent from: its URL prefix, which is what the page renders in. Read when the
 * request goes out, not when this module loads, since the visitor can switch language in place. The language cookie
 * and Accept-Language can name another language, so the backend reads this first for its error messages.
 */
export const authRequestLocale = () =>
  typeof window === 'undefined' ? undefined : splitLocalePath(window.location.pathname).locale

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_BACKEND_URL,
  fetchOptions: {
    onRequest: (context) => {
      const locale = authRequestLocale()
      if (locale) context.headers.set(LOCALE_HEADER, locale)
    },
  },
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