import { LOCALE_HEADER, SET_PASSWORD_AUTH_PATH } from '@gekichumai/api-contract'
import type { BetterAuthClientPlugin } from 'better-auth/client'
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

/**
 * The backend's `set-password` plugin (apps/backend/src/lib/set-password.ts): an account without a password (made with
 * a passkey, Google, GitHub or Apple) sets its first one. Needs a fresh session; answers `PASSWORD_ALREADY_SET` once
 * the account has a password, which `changePassword` then changes.
 */
const setPasswordClient = () =>
  ({
    id: 'dxrating-set-password',
    getActions: ($fetch) => ({
      setInitialPassword: (body: { newPassword: string }) =>
        $fetch<{ status: boolean }, { code?: string; message?: string }>(SET_PASSWORD_AUTH_PATH, {
          method: 'POST',
          body,
        }),
    }),
  }) satisfies BetterAuthClientPlugin

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
    setPasswordClient(),
    lastLoginMethodClient({
      cookieName: 'dxrating.last_used_login_method',
    }),
  ],
})