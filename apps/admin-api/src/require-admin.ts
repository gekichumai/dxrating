import { ORPCError } from '@orpc/server'
import { Clock, Effect } from 'effect'
import { DESTRUCTIVE_SCOPES, findAgentToken } from './agent-tokens'
import { RateLimiter } from './rate-limit'
import { AccessVerifier } from './access'
import { AdminApiConfigService } from './config'

/**
 * Who is calling. Every admin write records `actor` (`human:<email>` or `agent:<name>`) on the row and the full
 * principal in the audit log (audit.ts). People get every scope; agents (L5, gekichumai/meta#50 R2.5) get only the
 * scopes of their token.
 */
export interface Principal {
  readonly type: 'human' | 'agent'
  readonly id: string
  readonly actor: string
  readonly scopes: readonly string[]
  /** What the verified Access token said about the caller, for the audit log; never sent to the client */
  readonly access: {
    readonly email?: string | undefined
    readonly subject?: string | undefined
    readonly identityProvider?: string | undefined
    readonly commonName?: string | undefined
  }
}

export const ALL_SCOPES = '*'

export type AdminDenial = ORPCError<'UNAUTHORIZED' | 'FORBIDDEN' | 'TOO_MANY_REQUESTS', unknown>

const unauthorized = () => new ORPCError('UNAUTHORIZED', { message: 'Unauthorized' })
const forbidden = (message = 'Forbidden') => new ORPCError('FORBIDDEN', { message })

/**
 * The single guard of the admin API. Fails closed:
 * - no valid Access assertion is 401 (access.ts checks signature, issuer, audience and lifetime, and fails closed
 *   when the team's keys cannot be fetched);
 * - a browser request from another origin is 403;
 * - a person with a valid Access token for this application is an admin: the Access policy is the only gate for
 *   humans (owner's decision, 2026-11-08). ADMIN_HUMAN_EMAILS is no longer read;
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
      return {
        type: 'agent',
        id: entry.principal,
        actor: `agent:${entry.principal}`,
        scopes: [...entry.scopes],
        access: { commonName: identity.commonName },
      }
    }
    return {
      type: 'human',
      id: identity.email,
      actor: `human:${identity.email}`,
      scopes: [ALL_SCOPES],
      access: { email: identity.email, subject: identity.subject, identityProvider: identity.identityProvider },
    }
  })

export const hasScope = (principal: Principal, scope: string) =>
  principal.scopes.includes(ALL_SCOPES) || principal.scopes.includes(scope)

/** Every admin procedure states the scope it needs: `yield* requireScope(principal, 'announcements:write')` */
export const requireScope = (principal: Principal, scope: string): Effect.Effect<void, AdminDenial> =>
  hasScope(principal, scope) ? Effect.void : Effect.fail(forbidden(`Missing scope ${scope}`))