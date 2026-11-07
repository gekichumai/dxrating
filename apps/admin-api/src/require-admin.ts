import { ORPCError } from '@orpc/server'
import { Effect } from 'effect'
import { AccessVerifier } from './access'
import { AdminApiConfigService } from './config'

/**
 * Who is calling. Every admin write records `actor` (`human:<email>` or `agent:<name>`). People get every scope;
 * agents (L5, gekichumai/meta#50 R2.5) get only the scopes of their token.
 */
export interface Principal {
  readonly type: 'human' | 'agent'
  readonly id: string
  readonly actor: string
  readonly scopes: readonly string[]
}

export const ALL_SCOPES = '*'

export type AdminDenial = ORPCError<'UNAUTHORIZED' | 'FORBIDDEN', unknown>

const unauthorized = () => new ORPCError('UNAUTHORIZED', { message: 'Unauthorized' })
const forbidden = (message = 'Forbidden') => new ORPCError('FORBIDDEN', { message })

/**
 * The single guard of the admin API. Fails closed: no valid Access assertion is 401; an email off the allowlist, a
 * browser request from another origin, or an agent (until L5 adds tokens) is 403.
 */
export const requireAdmin = (
  headers: Headers,
): Effect.Effect<Principal, AdminDenial, AccessVerifier | AdminApiConfigService> =>
  Effect.gen(function* () {
    const config = yield* AdminApiConfigService
    const origin = headers.get('origin')
    if (origin !== null && origin !== new URL(config.ADMIN_ORIGIN).origin) return yield* Effect.fail(forbidden())

    const verifier = yield* AccessVerifier
    const identity = yield* verifier
      .verify(headers.get('cf-access-jwt-assertion'))
      .pipe(Effect.mapError(() => unauthorized()))

    if (identity.kind === 'service') return yield* Effect.fail(forbidden('Agent tokens are not enabled yet'))
    if (!config.ADMIN_HUMAN_EMAILS.includes(identity.email)) return yield* Effect.fail(forbidden())
    return { type: 'human', id: identity.email, actor: `human:${identity.email}`, scopes: [ALL_SCOPES] }
  })

export const hasScope = (principal: Principal, scope: string) =>
  principal.scopes.includes(ALL_SCOPES) || principal.scopes.includes(scope)