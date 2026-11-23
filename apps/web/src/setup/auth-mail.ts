/**
 * Whether the backend sends account email (verification links, password resets; gekichumai/meta#80). The backend
 * turns mail on with `RESEND_API_KEY`; the web can't see that, so the build says it: the `AUTH_MAIL_ENABLED`
 * repository variable, which release.yml passes as `VITE_AUTH_MAIL_ENABLED`. Set it to `true` once the backend has its
 * key. Unset, the web offers no "Forgot password?" and no verification resend, which the backend would refuse.
 *
 * A build-time constant, so the server render and the first client render agree (SSR, html-cache.ts). Read when
 * called, so tests can stub it.
 */
export const isAuthMailEnabled = () => import.meta.env.VITE_AUTH_MAIL_ENABLED === 'true'