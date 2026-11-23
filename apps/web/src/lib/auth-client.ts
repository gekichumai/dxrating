import {
  EMAIL_VERIFICATION_NONCE_AUTH_PATH,
  EMAIL_VERIFICATION_VERIFY_AUTH_PATH,
  SET_PASSWORD_AUTH_PATH,
} from '@gekichumai/api-contract'
import type { BetterAuthClientPlugin } from 'better-auth/client'
import { createAuthClient } from 'better-auth/react'
import { oneTapClient, lastLoginMethodClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'
import { splitLocalePath } from '@/setup/locale'

/**
 * The language of the page a request is sent from: its URL prefix, which is what the page renders in. Read when the
 * request goes out, not when this module loads, since the visitor can switch language in place. The language cookie
 * and the browser's Accept-Language can name another language, so each request's Accept-Language is set to this,
 * which the backend reads first for its error messages. Accept-Language is CORS-safelisted, so the backend's preflight
 * needn't allow anything new (the two deploy separately).
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

/**
 * The backend's Email Verification Protocol plugin (apps/backend/src/lib/email-verification-protocol/plugin.ts): a
 * sign-up form's nonce, and verifying a signed-in account's address with the token Chrome filled in. Sign-up with a
 * password sends the token in its own body instead (LoginForm).
 */
const emailVerificationProtocolClient = () =>
  ({
    id: 'dxrating-email-verification-protocol',
    getActions: ($fetch) => ({
      emailVerificationProtocol: {
        nonce: () =>
          $fetch<{ nonce: string; expiresAt: string }>(EMAIL_VERIFICATION_NONCE_AUTH_PATH, { method: 'GET' }),
        verify: (body: { token: string; nonce: string }) =>
          $fetch<{ verified: boolean }>(EMAIL_VERIFICATION_VERIFY_AUTH_PATH, { method: 'POST', body }),
      },
    }),
  }) satisfies BetterAuthClientPlugin

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_BACKEND_URL,
  fetchOptions: {
    onRequest: (context) => {
      const locale = authRequestLocale()
      if (locale) context.headers.set('Accept-Language', locale)
    },
  },
  plugins: [
    oneTapClient({
      clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    }),
    passkeyClient(),
    setPasswordClient(),
    emailVerificationProtocolClient(),
    lastLoginMethodClient({
      cookieName: 'dxrating.last_used_login_method',
    }),
  ],
})