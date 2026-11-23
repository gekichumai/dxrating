/**
 * Better Auth endpoint (under `/api/auth`) where an account without a password, such as one created with a passkey,
 * sets its first password. Better Auth's own `setPassword` is server-only; the backend's `set-password` plugin exposes
 * it with a fresh-session check.
 */
export const SET_PASSWORD_AUTH_PATH = '/account/set-password'
/**
 * Chrome's Email Verification Protocol (gekichumai/meta#80). A sign-up form asks for a nonce here (GET; answers
 * `{ nonce, expiresAt }`) and puts it on its `autocomplete="email-verification-token"` field.
 */
export const EMAIL_VERIFICATION_NONCE_AUTH_PATH = '/email-verification-protocol/nonce'
/**
 * A signed-in account proves its address with a token from the browser (POST `{ token, nonce }`, answers
 * `{ verified }`); for accounts made without a password, whose sign-up request can't carry the token.
 */
export const EMAIL_VERIFICATION_VERIFY_AUTH_PATH = '/email-verification-protocol/verify'
/**
 * Extra `/sign-up/email` body fields: the token Chrome filled in and the nonce of the form it came from. Better Auth
 * ignores body fields it doesn't know, so a backend without the protocol signs up as before.
 */
export const EMAIL_VERIFICATION_TOKEN_FIELD = 'emailVerificationToken'
export const EMAIL_VERIFICATION_NONCE_FIELD = 'emailVerificationNonce'