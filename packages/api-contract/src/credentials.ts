import { defineMeta } from '@orpc/contract'

/** `sega`: a SEGA ID and password, so `id` and `sid` are credentials too. `secret`: any other credential. */
export type CredentialKind = 'sega' | 'secret'

/**
 * Marks a procedure whose request carries credentials its input fields do not name (a handler that uses stored
 * OAuth tokens), or SEGA credentials. The backend keeps the request data of every credential route out of logs and
 * telemetry; a procedure whose input has a credential field (`password`, `code`, `state`, `token`, ...) is one
 * without this mark.
 */
export const [credentials, getCredentials] = defineMeta('credentials', (incoming: CredentialKind) => incoming)