import { ORPCError } from '@orpc/server'
import { Clock, Effect } from 'effect'
import { DESTRUCTIVE_SCOPES, findAgentToken } from './agent-tokens'
import { RateLimiter } from './rate-limit'
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

export type AdminDenial = ORPCError<'UNAUTHORIZED' | 'FORBIDDEN' | 'TOO_MANY_REQUESTS', unknown>

const unauthorized = () => new ORPCError('UNAUTHORIZED', { message: 'Unauthorized' })
const forbidden = (message = 'Forbidden') => new ORPCError('FORBIDDEN', { message })

/**
 * The single guard of the admin API. Fails closed:
 * - no valid Access assertion is 401;
 * - a browser request from another origin, or an Access user off ADMIN_HUMAN_EMAILS, is 403;
 * - an Access service token (an agent) also needs `Authorization: Bearer dxa_…` matching an unexpired entry of
 *   ADMIN_AGENT_TOKENS (and that entry's `accessCommonName`, when set): otherwise 401 without a bearer, 403 with a
 *   wrong, expired or mismatched one. Agents are rate limited per principal (429).
 * A bearer token never stands in for Access: a request without an Access assertion is refused first.
 */
export const requireAdmin = (
  headers: Headers,
): Effect.Effect<Principal, AdminDenial, AccessVerifier | AdminApiConfigService | RateLimiter> =>
  Effect.gen(function* () {
    const config = yield* AdminApiConfigService
    const origin = headers.get('origin')
    if (origin !== null && origin !== new URL(config.ADMIN_ORIGIN).origin) return yield* Effect.fail(forbidden())

    const verifier = yield* AccessVerifier
    const identity = yield* verifier
      .verify(headers.get('cf-access-jwt-assertion'))
      .pipe(Effect.mapError(() => unauthorized()))

    if (identity.kind === 'service') {
      const bearer = /^Bearer (\S+)$/.exec(headers.get('authorization') ?? '')?.[1]
      if (!bearer) return yield* Effect.fail(unauthorized())
      const entry = findAgentToken(config.ADMIN_AGENT_TOKENS, bearer)
      const now = yield* Clock.currentTimeMillis
      if (
        !entry ||
        Date.parse(entry.expiresAt) <= now ||
        (entry.accessCommonName !== undefined && entry.accessCommonName !== identity.commonName)
      ) {
        return yield* Effect.fail(forbidden())
      }
      const limiter = yield* RateLimiter
      const destructive = entry.scopes.some((scope) => DESTRUCTIVE_SCOPES.includes(scope))
      const limit = destructive
        ? Math.max(1, Math.floor(config.ADMIN_AGENT_RATE_LIMIT / 5))
        : config.ADMIN_AGENT_RATE_LIMIT
      if (!(yield* limiter.take(`agent:${entry.principal}`, limit))) {
        return yield* Effect.fail(new ORPCError('TOO_MANY_REQUESTS', { message: 'Rate limited' }))
      }
      return { type: 'agent', id: entry.principal, actor: `agent:${entry.principal}`, scopes: [...entry.scopes] }
    }
    if (!config.ADMIN_HUMAN_EMAILS.includes(identity.email)) return yield* Effect.fail(forbidden())
    return { type: 'human', id: identity.email, actor: `human:${identity.email}`, scopes: [ALL_SCOPES] }
  })

export const hasScope = (principal: Principal, scope: string) =>
  principal.scopes.includes(ALL_SCOPES) || principal.scopes.includes(scope)

/** Every admin procedure states the scope it needs: `yield* requireScope(principal, 'announcements:write')` */
export const requireScope = (principal: Principal, scope: string): Effect.Effect<void, AdminDenial> =>
  hasScope(principal, scope) ? Effect.void : Effect.fail(forbidden(`Missing scope ${scope}`))