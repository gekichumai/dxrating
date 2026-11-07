import { Context, Data, Effect, Layer } from 'effect'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { AdminApiConfigService } from './config'

export class AccessDenied extends Data.TaggedError('AccessDenied')<{
  readonly reason: string
  readonly cause?: unknown
}> {}

/** An identity Cloudflare Access vouched for: a person (email) or a service token (common name) */
export type AccessIdentity =
  | { readonly kind: 'user'; readonly email: string }
  | { readonly kind: 'service'; readonly commonName: string }

/**
 * Verifies the `Cf-Access-Jwt-Assertion` header Cloudflare Access adds to every request it lets through. The live
 * layer checks the signature against the team's keys, the issuer and the application's audience. Tests and local
 * development provide another layer; no layer accepts a request without an assertion.
 */
export class AccessVerifier extends Context.Service<
  AccessVerifier,
  { readonly verify: (assertion: string | null) => Effect.Effect<AccessIdentity, AccessDenied> }
>()('dxrating-admin/AccessVerifier') {}

export const AccessVerifierLive = Layer.effect(
  AccessVerifier,
  Effect.gen(function* () {
    const config = yield* AdminApiConfigService
    if (config.ADMIN_DEV_ACCESS_EMAIL) {
      const email = config.ADMIN_DEV_ACCESS_EMAIL.toLowerCase()
      return { verify: () => Effect.succeed({ kind: 'user' as const, email }) }
    }
    const team = config.ADMIN_ACCESS_TEAM_DOMAIN
    const audience = config.ADMIN_ACCESS_AUD
    if (!team || !audience) {
      return { verify: () => Effect.fail(new AccessDenied({ reason: 'Access is not configured' })) }
    }
    const issuer = `https://${team}`
    return {
      verify: verifyAccessAssertion(createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)), issuer, audience),
    }
  }),
)

/** Checks the signature against `keys`, the issuer and the audience, then reads the identity */
export const verifyAccessAssertion =
  (keys: JWTVerifyGetKey, issuer: string, audience: string) =>
  (assertion: string | null): Effect.Effect<AccessIdentity, AccessDenied> =>
    assertion
      ? Effect.tryPromise({
          try: () => jwtVerify(assertion, keys, { issuer, audience, algorithms: ['RS256'] }),
          catch: (cause) => new AccessDenied({ reason: 'Invalid Access assertion', cause }),
        }).pipe(Effect.flatMap(({ payload }) => identityFromClaims(payload)))
      : Effect.fail(new AccessDenied({ reason: 'Missing Access assertion' }))

export const identityFromClaims = (claims: Record<string, unknown>): Effect.Effect<AccessIdentity, AccessDenied> => {
  if (typeof claims.email === 'string' && claims.email.length > 0) {
    return Effect.succeed({ kind: 'user', email: claims.email.toLowerCase() })
  }
  if (typeof claims.common_name === 'string' && claims.common_name.length > 0) {
    return Effect.succeed({ kind: 'service', commonName: claims.common_name })
  }
  return Effect.fail(new AccessDenied({ reason: 'Access assertion names no identity' }))
}

/** Tests: maps an assertion string straight to an identity; anything else (and no assertion) is denied */
export const accessVerifierTestLayer = (identities: Record<string, AccessIdentity>) =>
  Layer.succeed(AccessVerifier, {
    verify: (assertion) => {
      const identity = assertion === null ? undefined : identities[assertion]
      return identity ? Effect.succeed(identity) : Effect.fail(new AccessDenied({ reason: 'Unknown test assertion' }))
    },
  })