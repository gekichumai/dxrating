import { Context, Data, Effect, Layer } from 'effect'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { AdminApiConfigService } from './config'

export class AccessDenied extends Data.TaggedError('AccessDenied')<{
  readonly reason: string
  readonly cause?: unknown
}> {}

/**
 * An identity Cloudflare Access vouched for: a person (email, plus the Access user id `sub` and the identity provider
 * when the token names one) or a service token (common name)
 */
export type AccessIdentity =
  | {
      readonly kind: 'user'
      readonly email: string
      readonly subject?: string | undefined
      readonly identityProvider?: string | undefined
    }
  | { readonly kind: 'service'; readonly commonName: string }

/** Seconds of clock skew allowed on `exp`, `nbf` and `iat` */
export const CLOCK_TOLERANCE_SECONDS = 30

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
    // jose caches the key set for cacheMaxAge and refetches it (at most once per cooldown) when a token names a key
    // it has not seen, so a key rotation needs no restart. A key set that cannot be fetched denies the request.
    const keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {
      timeoutDuration: 5_000,
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000,
    })
    return { verify: verifyAccessAssertion(keys, issuer, audience) }
  }),
)

/**
 * Checks the signature (RS256) against `keys`, the issuer, the audience and the token's lifetime (`exp` required,
 * `nbf` when present, with a small clock tolerance), then reads the identity. Any failure, including key set
 * unavailable, is AccessDenied.
 */
export const verifyAccessAssertion =
  (keys: JWTVerifyGetKey, issuer: string, audience: string) =>
  (assertion: string | null): Effect.Effect<AccessIdentity, AccessDenied> =>
    assertion
      ? Effect.tryPromise({
          try: () =>
            jwtVerify(assertion, keys, {
              issuer,
              audience,
              algorithms: ['RS256'],
              clockTolerance: CLOCK_TOLERANCE_SECONDS,
              requiredClaims: ['exp'],
            }),
          catch: (cause) => new AccessDenied({ reason: 'Invalid Access assertion', cause }),
        }).pipe(Effect.flatMap(({ payload }) => identityFromClaims(payload)))
      : Effect.fail(new AccessDenied({ reason: 'Missing Access assertion' }))

export const identityFromClaims = (claims: Record<string, unknown>): Effect.Effect<AccessIdentity, AccessDenied> => {
  if (typeof claims.email === 'string' && claims.email.length > 0) {
    return Effect.succeed({
      kind: 'user',
      email: claims.email.toLowerCase(),
      subject: typeof claims.sub === 'string' && claims.sub.length > 0 ? claims.sub : undefined,
      identityProvider: identityProviderOf(claims.idp),
    })
  }
  if (typeof claims.common_name === 'string' && claims.common_name.length > 0) {
    return Effect.succeed({ kind: 'service', commonName: claims.common_name })
  }
  return Effect.fail(new AccessDenied({ reason: 'Access assertion names no identity' }))
}

/** Access names the identity provider as `idp: { id, type }` when it includes one; a plain string is kept as is */
const identityProviderOf = (idp: unknown): string | undefined => {
  if (typeof idp === 'string' && idp.length > 0) return idp
  if (typeof idp !== 'object' || idp === null) return undefined
  const { type, id } = idp as Record<string, unknown>
  const parts = [type, id].filter((part): part is string => typeof part === 'string' && part.length > 0)
  return parts.length > 0 ? parts.join(':') : undefined
}

/** Tests: maps an assertion string straight to an identity; anything else (and no assertion) is denied */
export const accessVerifierTestLayer = (identities: Record<string, AccessIdentity>) =>
  Layer.succeed(AccessVerifier, {
    verify: (assertion) => {
      const identity = assertion === null ? undefined : identities[assertion]
      return identity ? Effect.succeed(identity) : Effect.fail(new AccessDenied({ reason: 'Unknown test assertion' }))
    },
  })