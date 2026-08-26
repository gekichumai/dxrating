import { createHash, timingSafeEqual } from 'node:crypto'
import { createRemoteJWKSet, customFetch, jwtVerify, type FetchImplementation, type JWTVerifyGetKey } from 'jose'
import { isLoopbackHostname } from '../origin-policy.js'

export const ADMIN_ACCESS_ASSERTION_HEADER = 'cf-access-jwt-assertion' as const
export const ADMIN_ACCESS_TEST_BYPASS_HEADER = 'x-dxrating-admin-access-test' as const

export const ADMIN_ACCESS_JWKS_CACHE_MAX_AGE_MS = 10 * 60 * 1000
export const ADMIN_ACCESS_JWKS_COOLDOWN_MS = 5 * 1000
export const ADMIN_ACCESS_JWKS_TIMEOUT_MS = 5 * 1000

const ADMIN_ACCESS_CLOCK_TOLERANCE_SECONDS = 30
const ADMIN_ACCESS_MAX_TOKEN_LENGTH = 16 * 1024
const CLOUDFLARE_ACCESS_JWKS_PATH = '/cdn-cgi/access/certs'

export type AdminAccessConfiguration =
  | {
      readonly mode: 'cloudflare'
      readonly issuer: string
      readonly audiences: readonly string[]
    }
  | {
      readonly mode: 'test_bypass'
      readonly bypassSecret: string
    }

export type AdminAccessProof = {
  readonly assertion?: string
  readonly testBypass?: string
  readonly requestUrl?: string
}

export const ADMIN_ACCESS_DENIAL_CATEGORIES = [
  'MISSING',
  'MALFORMED',
  'OVERSIZED',
  'EXPIRED',
  'NOT_YET_VALID',
  'WRONG_ISSUER',
  'WRONG_AUDIENCE',
  'INVALID_SIGNATURE',
  'UNKNOWN_KEY',
  'JWKS_UNAVAILABLE',
  'INVALID_SHAPE',
  'TEST_BYPASS_REJECTED',
] as const

export type AdminAccessDenialCategory = (typeof ADMIN_ACCESS_DENIAL_CATEGORIES)[number]

export type AdminAccessVerificationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly category: AdminAccessDenialCategory }

export type AdminAccessVerifier = {
  verify: (proof: AdminAccessProof) => Promise<AdminAccessVerificationResult>
}

type AdminAccessVerifierOptions = {
  readonly fetch?: FetchImplementation
  readonly cacheMaxAgeMs?: number
  readonly cooldownMs?: number
  readonly timeoutMs?: number
}

class AdminAccessJwksUnavailableError extends Error {
  constructor() {
    super('Administrator Access signing keys are unavailable')
    this.name = 'AdminAccessJwksUnavailableError'
  }
}

const getSafeErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') return undefined
  const code = Reflect.get(error, 'code')
  return typeof code === 'string' ? code : undefined
}

const getSafeFailedClaim = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') return undefined
  const claim = Reflect.get(error, 'claim')
  return typeof claim === 'string' ? claim : undefined
}

const getSafeFailureReason = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') return undefined
  const reason = Reflect.get(error, 'reason')
  return typeof reason === 'string' ? reason : undefined
}

const classifyVerificationFailure = (error: unknown): AdminAccessDenialCategory => {
  if (error instanceof AdminAccessJwksUnavailableError) return 'JWKS_UNAVAILABLE'

  const code = getSafeErrorCode(error)
  const claim = getSafeFailedClaim(error)
  const reason = getSafeFailureReason(error)
  if (code === 'ERR_JWT_EXPIRED') return 'EXPIRED'
  if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') {
    if (reason === 'missing' || reason === 'invalid') return 'INVALID_SHAPE'
    if (claim === 'iss') return 'WRONG_ISSUER'
    if (claim === 'aud') return 'WRONG_AUDIENCE'
    if (claim === 'nbf' || claim === 'iat') return 'NOT_YET_VALID'
    return 'INVALID_SHAPE'
  }
  if (code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') return 'INVALID_SIGNATURE'
  if (code === 'ERR_JWKS_NO_MATCHING_KEY') return 'UNKNOWN_KEY'
  if (
    code === 'ERR_JWKS_TIMEOUT' ||
    code === 'ERR_JWKS_INVALID' ||
    code === 'ERR_JWKS_MULTIPLE_MATCHING_KEYS' ||
    code === 'ERR_JOSE_GENERIC'
  ) {
    return 'JWKS_UNAVAILABLE'
  }
  return 'MALFORMED'
}

const constantTimeMatches = (provided: string, expected: string): boolean => {
  const providedDigest = createHash('sha256').update(provided).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()
  return timingSafeEqual(providedDigest, expectedDigest)
}

const isLoopbackRequestUrl = (requestUrl: string | undefined): boolean => {
  if (!requestUrl) return false

  try {
    const parsed = new URL(requestUrl)
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      !parsed.username &&
      !parsed.password &&
      isLoopbackHostname(parsed.hostname)
    )
  } catch {
    return false
  }
}

const hasValidVerifiedShape = (protectedHeader: Record<string, unknown>, payload: Record<string, unknown>): boolean => {
  const { kid } = protectedHeader
  const { aud, exp, iat, iss, nbf, sub, type } = payload
  const audiences = typeof aud === 'string' ? [aud] : aud
  const now = Math.floor(Date.now() / 1000)

  return (
    typeof kid === 'string' &&
    kid.length > 0 &&
    kid.length <= 256 &&
    typeof iss === 'string' &&
    Array.isArray(audiences) &&
    audiences.length > 0 &&
    audiences.length <= 20 &&
    audiences.every((audience) => typeof audience === 'string') &&
    typeof sub === 'string' &&
    sub.length > 0 &&
    sub.length <= 512 &&
    type === 'app' &&
    Number.isInteger(iat) &&
    Number.isInteger(nbf) &&
    Number.isInteger(exp) &&
    (iat as number) <= now + ADMIN_ACCESS_CLOCK_TOLERANCE_SECONDS &&
    (nbf as number) <= (exp as number) &&
    (iat as number) <= (exp as number)
  )
}

const createSafeRemoteJwks = (issuer: string, options: AdminAccessVerifierOptions): JWTVerifyGetKey => {
  const fetchImplementation: FetchImplementation = options.fetch ?? ((url, init) => fetch(url, init))
  const safeFetch: FetchImplementation = async (url, init) => {
    try {
      return await fetchImplementation(url, init)
    } catch {
      throw new AdminAccessJwksUnavailableError()
    }
  }

  return createRemoteJWKSet(new URL(CLOUDFLARE_ACCESS_JWKS_PATH, `${issuer}/`), {
    cacheMaxAge: options.cacheMaxAgeMs ?? ADMIN_ACCESS_JWKS_CACHE_MAX_AGE_MS,
    cooldownDuration: options.cooldownMs ?? ADMIN_ACCESS_JWKS_COOLDOWN_MS,
    timeoutDuration: options.timeoutMs ?? ADMIN_ACCESS_JWKS_TIMEOUT_MS,
    [customFetch]: safeFetch,
  })
}

export const createAdminAccessVerifier = (
  configuration: AdminAccessConfiguration,
  options: AdminAccessVerifierOptions = {},
): AdminAccessVerifier => {
  if (configuration.mode === 'test_bypass') {
    return {
      verify: async ({ assertion, testBypass, requestUrl }) => {
        if (assertion !== undefined || testBypass === undefined) {
          return { ok: false, category: assertion === undefined ? 'MISSING' : 'TEST_BYPASS_REJECTED' }
        }
        if (!isLoopbackRequestUrl(requestUrl)) return { ok: false, category: 'TEST_BYPASS_REJECTED' }
        if (!constantTimeMatches(testBypass, configuration.bypassSecret)) {
          return { ok: false, category: 'TEST_BYPASS_REJECTED' }
        }
        return { ok: true }
      },
    }
  }

  const remoteJwks = createSafeRemoteJwks(configuration.issuer, options)
  return {
    verify: async ({ assertion, testBypass }) => {
      if (testBypass !== undefined) return { ok: false, category: 'TEST_BYPASS_REJECTED' }
      if (assertion === undefined) return { ok: false, category: 'MISSING' }
      if (assertion.length > ADMIN_ACCESS_MAX_TOKEN_LENGTH) return { ok: false, category: 'OVERSIZED' }

      try {
        const { payload, protectedHeader } = await jwtVerify(assertion, remoteJwks, {
          algorithms: ['RS256'],
          audience: [...configuration.audiences],
          issuer: configuration.issuer,
          typ: 'JWT',
          requiredClaims: ['exp', 'iat', 'nbf', 'sub', 'type'],
          clockTolerance: ADMIN_ACCESS_CLOCK_TOLERANCE_SECONDS,
        })
        if (!hasValidVerifiedShape(protectedHeader, payload)) {
          return { ok: false, category: 'INVALID_SHAPE' }
        }
        return { ok: true }
      } catch (error) {
        return { ok: false, category: classifyVerificationFailure(error) }
      }
    },
  }
}

export const consumeAdminAccessProof = (headers: Headers): AdminAccessProof => {
  const assertion = headers.get(ADMIN_ACCESS_ASSERTION_HEADER) ?? undefined
  const testBypass = headers.get(ADMIN_ACCESS_TEST_BYPASS_HEADER) ?? undefined
  headers.delete(ADMIN_ACCESS_ASSERTION_HEADER)
  headers.delete(ADMIN_ACCESS_TEST_BYPASS_HEADER)
  return { assertion, testBypass }
}