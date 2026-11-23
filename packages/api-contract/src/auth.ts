/**
 * Better Auth endpoint (under `/api/auth`) where an account without a password, such as one created with a passkey,
 * sets its first password. Better Auth's own `setPassword` is server-only; the backend's `set-password` plugin exposes
 * it with a fresh-session check.
 */
export const SET_PASSWORD_AUTH_PATH = '/account/set-password'