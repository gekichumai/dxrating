import { BlockList, isIP } from 'node:net'
import { domainToASCII } from 'node:url'
import { Clock, Data, Effect } from 'effect'
import {
  base64url,
  decodeJwt,
  decodeProtectedHeader,
  importJWK,
  jwtVerify,
  type JWK,
  type JWTPayload,
  type JWTVerifyResult,
} from 'jose'

/**
 * Verifies the token Chrome's Email Verification Protocol (EVP) puts in a sign-up form (gekichumai/meta#80): proof,
 * from the address's mail provider, that the visitor controls an email address, without sending any mail.
 *
 * Written against:
 *
 * - the browser side, WICG "Email Verification API", Draft Community Group Report of 26 June 2026
 *   (https://wicg.github.io/email-verification/), §2 (the `email-verification-token` autofill field and its `nonce`)
 *   and §4 (verifier processing: the token's address must equal the submitted one, case aside);
 * - the protocol, draft-hardt-email-verification-02 of 25 August 2026, which the WICG report cites as [EVP-Protocol]:
 *   §3 issuer discovery (DNS `_email-verification.<domain>` TXT `iss=<host>`, issuer identifier `https://<host>`,
 *   metadata at `<issuer>/.well-known/email-verification` whose `issuer` must equal it), §5 the EVT (header `typ`
 *   `evt+jwt`, `kid`; claims `iss`, `iat`, `cnf.jwk`, `email`, `email_verified: true`), §6 key binding (the presented
 *   token is `<EVT>~<KB-JWT>`; KB-JWT `typ` `kb+jwt`, `alg` that of `cnf.jwk`, claims `aud` = the RP's origin, `nonce`,
 *   `iat`, `sd_hash` = base64url SHA-256 of the EVT with its trailing `~`).
 *
 * Where the drafts and what ships disagree, this follows what ships, as long as it is no weaker. Checked against Gmail
 * (accounts.google.com) on 2026-11-24:
 *
 * - its metadata names `EdDSA`, which draft -02 forbids in favour of the fully specified `Ed25519`. Both are accepted
 *   and mean the same thing here: jose only takes Ed25519 keys for either.
 * - its JWKS (on another host, verifiablecredentials-pa.googleapis.com) has no `kid` on any key, while the draft
 *   requires one in the EVT header. When the issuer's keys carry no `kid` at all, each usable key is tried; when they
 *   do, the header's `kid` must name one of them.
 * - neither draft gives the EVT or the KB-JWT a lifetime ("an acceptable time window"); the WICG report also asks
 *   verifiers to check `exp`. Both `iat`s must be within {@link MAX_TOKEN_AGE_SECONDS} (no older than the form's
 *   nonce can be) and no more than {@link CLOCK_SKEW_SECONDS} in the future, and an `exp`, where present, must not
 *   have passed.
 *
 * The verifier never throws and never sends mail. Every failure is a {@link EvpRejectionReason}; the caller falls back
 * to the mailed link. Nothing here logs the token or the address.
 */

/** Accepted clock difference between us, the issuer, and the visitor's browser */
export const CLOCK_SKEW_SECONDS = 60
/** The oldest an EVT or KB-JWT may be: the form's nonce lives at most this long too (nonce.ts) */
export const MAX_TOKEN_AGE_SECONDS = 30 * 60
/** How long an issuer's metadata and keys are reused */
export const ISSUER_CACHE_TTL_MS = 10 * 60 * 1000
/** A key not in a cached JWKS refetches it, at most this often per issuer (key rotation) */
export const JWKS_REFRESH_COOLDOWN_MS = 60 * 1000
/** One request for metadata or keys: time and size limits */
export const ISSUER_FETCH_TIMEOUT_MS = 5_000
export const ISSUER_FETCH_MAX_BYTES = 64 * 1024
/** At most this many keys in an issuer's JWKS are looked at */
const MAX_JWKS_KEYS = 20
const MAX_CACHED_ISSUERS = 100
/**
 * A domain whose TXT lookup failed, or an issuer whose metadata or keys couldn't be loaded, isn't tried again for this
 * long: anyone can mint a token naming their own domain, so a slow or broken one must not cost a lookup per request.
 */
export const FAILED_LOOKUP_TTL_MS = 60 * 1000
const MAX_FAILED_LOOKUPS = 1000
/** The whole token, as the form posts it; Gmail's are about 1 KB */
export const MAX_TOKEN_LENGTH = 8 * 1024

/**
 * EVT signature algorithms: the fully specified ones of draft -02 (RFC 9864) that jose supports, and `EdDSA`, which
 * Gmail uses for the same Ed25519 keys. `none`, MACs and RSA are never accepted.
 */
export const SUPPORTED_ALGORITHMS = ['Ed25519', 'EdDSA', 'ES256', 'ES384'] as const
type SupportedAlgorithm = (typeof SUPPORTED_ALGORITHMS)[number]
const isSupportedAlgorithm = (alg: unknown): alg is SupportedAlgorithm =>
  typeof alg === 'string' && (SUPPORTED_ALGORITHMS as readonly string[]).includes(alg)
/** `Ed25519` and the polymorphic `EdDSA` name the same signature over an Ed25519 key */
const sameAlgorithm = (a: string, b: string) =>
  a === b || ((a === 'Ed25519' || a === 'EdDSA') && (b === 'Ed25519' || b === 'EdDSA'))

export type EvpRejectionReason =
  /** Not `<EVT>~<KB-JWT>`, or a part isn't a JWT with the claims it needs */
  | 'malformed'
  /** An `alg` that isn't in {@link SUPPORTED_ALGORITHMS}, or the KB-JWT's isn't `cnf.jwk`'s */
  | 'unsupported_algorithm'
  /** The KB-JWT is for another site */
  | 'audience_mismatch'
  /** The KB-JWT is for another form (its nonce isn't the one the form was given) */
  | 'nonce_mismatch'
  /** The form's nonce is not one we issued, or it expired (nonce.ts) */
  | 'nonce_invalid'
  /** The form's nonce was already used */
  | 'nonce_replayed'
  /** An `iat` older than {@link MAX_TOKEN_AGE_SECONDS}, or an `exp` that has passed */
  | 'expired'
  /** An `iat` in the future */
  | 'issued_in_future'
  /** The KB-JWT doesn't hash the EVT it came with */
  | 'sd_hash_mismatch'
  /** The browser's key didn't sign the KB-JWT */
  | 'key_binding_signature_invalid'
  /** The token is for another address than the one submitted */
  | 'email_mismatch'
  /** `email_verified` isn't `true` */
  | 'email_not_verified'
  /** The address's domain names no issuer, or not exactly one (DNS) */
  | 'issuer_not_found'
  /** The EVT's `iss` is not the issuer the address's domain names */
  | 'issuer_mismatch'
  /** The issuer's metadata or keys could not be fetched (network, status, redirect, size, time) */
  | 'issuer_unreachable'
  /** The issuer's metadata or JWKS is not what the draft describes, or names another issuer */
  | 'issuer_metadata_invalid'
  /** No key of the issuer has the EVT's `kid` */
  | 'unknown_key'
  /** No key of the issuer verifies the EVT */
  | 'issuer_signature_invalid'

export class EvpRejected extends Data.TaggedError('EvpRejected')<{ readonly reason: EvpRejectionReason }> {}

const reject = (reason: EvpRejectionReason) => Effect.fail(new EvpRejected({ reason }))

/** What the form submitted, and what the token must say for it to count */
export interface EvpVerificationInput {
  /** The value Chrome filled into the `email-verification-token` field: `<EVT>~<KB-JWT>` */
  readonly token: string
  /** The address the form signed up with */
  readonly email: string
  /** Our origin, as the page that held the form had it (`https://dxrating.net`) */
  readonly audience: string
  /** The nonce the form's token field carried */
  readonly nonce: string
}

export interface EvpVerified {
  /** The address as the issuer wrote it */
  readonly email: string
  /** The issuer identifier (`https://accounts.google.com`) */
  readonly issuer: string
}

/**
 * The verifier's outside world, injectable for tests. The live one (services/email-verification-protocol.ts) is Node's
 * DNS and `fetch`; tests use a fixture issuer (src/test/evp-fixture-issuer.ts).
 */
export interface EvpTransport {
  /** TXT records at a name: each record's strings, as `dns.promises.resolveTxt` gives them */
  readonly resolveTxt: (name: string, signal?: AbortSignal) => Promise<string[][]>
  /** Every address a host name resolves to (for refusing to fetch from private networks) */
  readonly lookup: (hostname: string, signal?: AbortSignal) => Promise<readonly string[]>
  /** GETs `url` from one of `addresses`, the host's addresses the verifier checked, and no other */
  readonly fetch: (url: string, init: RequestInit, addresses: readonly string[]) => Promise<Response>
}

class TransportFailure extends Data.TaggedError('TransportFailure')<{ readonly cause: unknown }> {}

// ---------------------------------------------------------------------------------------------------------------------
// Token structure

interface ParsedToken {
  /** The issuer-signed JWT, without the `~` */
  readonly evt: string
  readonly kb: string
  readonly evtHeader: { readonly alg: SupportedAlgorithm; readonly kid: string | undefined }
  readonly evtClaims: JWTPayload & {
    readonly iss: string
    readonly iat: number
    readonly email: string
    readonly email_verified: unknown
    readonly cnf: { readonly jwk: JWK }
  }
  readonly kbAlg: SupportedAlgorithm
  readonly kbClaims: JWTPayload & {
    readonly aud: unknown
    readonly nonce: unknown
    readonly iat: number
    readonly sd_hash: unknown
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Header and claims, unverified; anything that isn't a JWT is `undefined` */
const decode = (jwt: string) => {
  try {
    return { header: decodeProtectedHeader(jwt), claims: decodeJwt(jwt) }
  } catch {
    return undefined
  }
}

/** A public key the browser could have made: Ed25519, or a NIST curve for ES256/ES384, and never a private part */
const isBrowserPublicKey = (jwk: unknown): jwk is JWK =>
  isRecord(jwk) &&
  !('d' in jwk) &&
  ((jwk.kty === 'OKP' && jwk.crv === 'Ed25519' && typeof jwk.x === 'string') ||
    (jwk.kty === 'EC' &&
      (jwk.crv === 'P-256' || jwk.crv === 'P-384') &&
      typeof jwk.x === 'string' &&
      typeof jwk.y === 'string'))

/** Draft -02 §6.2: `<EVT>~<KB-JWT>`, the EVT keeping the `~` SD-JWT puts after it; no disclosures */
export const parseToken = (token: string): ParsedToken | undefined => {
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return undefined
  const parts = token.split('~')
  if (parts.length !== 2) return undefined
  const [evt, kb] = parts as [string, string]
  const evtDecoded = decode(evt)
  const kbDecoded = decode(kb)
  if (!evtDecoded || !kbDecoded) return undefined
  const { header: evtHeader, claims: evtClaims } = evtDecoded
  const { header: kbHeader, claims: kbClaims } = kbDecoded
  if (evtHeader.typ !== 'evt+jwt' || kbHeader.typ !== 'kb+jwt') return undefined
  if (evtHeader.kid !== undefined && typeof evtHeader.kid !== 'string') return undefined
  if (
    typeof evtClaims.iss !== 'string' ||
    typeof evtClaims.iat !== 'number' ||
    typeof evtClaims.email !== 'string' ||
    !isRecord(evtClaims.cnf) ||
    !isBrowserPublicKey(evtClaims.cnf.jwk)
  ) {
    return undefined
  }
  if (typeof kbClaims.iat !== 'number' || !('aud' in kbClaims) || !('nonce' in kbClaims)) return undefined
  // An `alg` we don't support is told apart from a broken token
  if (!isSupportedAlgorithm(evtHeader.alg) || !isSupportedAlgorithm(kbHeader.alg)) return undefined
  return {
    evt,
    kb,
    evtHeader: { alg: evtHeader.alg, kid: evtHeader.kid },
    evtClaims: evtClaims as ParsedToken['evtClaims'],
    kbAlg: kbHeader.alg,
    kbClaims: kbClaims as ParsedToken['kbClaims'],
  }
}

/** `sd_hash`: base64url SHA-256 of the EVT including its trailing `~` (draft -02 §6.4; SD-JWT §4.3.1) */
export const sdHashOf = async (evt: string) =>
  base64url.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${evt}~`))))

// ---------------------------------------------------------------------------------------------------------------------
// Issuer discovery

/** The domain of an address, ASCII (IDNA) and lower case, for DNS; `undefined` if it has none */
export const emailDomain = (email: string) => {
  const at = email.lastIndexOf('@')
  if (at <= 0 || at === email.length - 1) return undefined
  const ascii = domainToASCII(email.slice(at + 1))
  return ascii === '' ? undefined : ascii.toLowerCase()
}

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

/**
 * Draft -02 §3.1–3.2: there must be exactly one TXT record at `_email-verification.<domain>`, `iss=<host>`; the issuer
 * identifier is `https://<host>`, compared byte for byte. A record split into several strings is joined first (RFC
 * 7208 §3.3 style).
 */
export const issuerFromTxtRecords = (records: readonly (readonly string[])[]) => {
  if (records.length !== 1) return undefined
  const record = records[0]!.join('')
  if (!record.startsWith('iss=')) return undefined
  const host = record.slice('iss='.length)
  if (!HOSTNAME.test(host) || isIP(host) !== 0) return undefined
  return `https://${host}`
}

// Never fetched from: an issuer's metadata comes from a name anyone can point DNS at
const privateAddresses = (() => {
  const list = new BlockList()
  for (const [network, prefix] of [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ] as const) {
    list.addSubnet(network, prefix, 'ipv4')
  }
  for (const [network, prefix] of [
    ['::', 128],
    ['::1', 128],
    ['64:ff9b::', 96],
    ['100::', 64],
    ['2001:db8::', 32],
    ['fc00::', 7],
    ['fe80::', 10],
    ['ff00::', 8],
  ] as const) {
    list.addSubnet(network, prefix, 'ipv6')
  }
  return list
})()

export const isPublicAddress = (address: string) => {
  const family = isIP(address)
  if (family === 0) return false
  return !privateAddresses.check(address, family === 4 ? 'ipv4' : 'ipv6')
}

// ---------------------------------------------------------------------------------------------------------------------
// The verifier

interface IssuerKeys {
  readonly signingAlgorithms: readonly string[] | undefined
  readonly keys: readonly JWK[]
  readonly jwksUri: string
  readonly fetchedAt: number
}

export interface EvpVerifier {
  /** Verifies a token, or fails with why not ({@link EvpRejected}); nothing else ever fails or throws */
  readonly verify: (input: EvpVerificationInput) => Effect.Effect<EvpVerified, EvpRejected>
}

export const makeEvpVerifier = (transport: EvpTransport): EvpVerifier => {
  const cache = new Map<string, IssuerKeys>()
  /** `txt:<domain>` or `issuer:<issuer>` → when the failure was seen, and why */
  const failures = new Map<string, { readonly at: number; readonly reason: EvpRejectionReason }>()

  const recentFailure = (key: string, now: number) => {
    const failure = failures.get(key)
    if (!failure) return undefined
    if (now - failure.at < FAILED_LOOKUP_TTL_MS) return failure.reason
    failures.delete(key)
    return undefined
  }

  const rememberFailure = (key: string, reason: EvpRejectionReason) =>
    Effect.gen(function* () {
      const at = yield* Clock.currentTimeMillis
      failures.delete(key)
      failures.set(key, { at, reason })
      if (failures.size > MAX_FAILED_LOOKUPS) failures.delete(failures.keys().next().value!)
    })

  /** GET an issuer's JSON: https on the default port only, public addresses only, no redirects, size and time limits */
  const fetchJson = (url: string) =>
    Effect.gen(function* () {
      const parsed = URL.canParse(url) ? new URL(url) : undefined
      if (!parsed || parsed.protocol !== 'https:' || parsed.port !== '' || parsed.username || parsed.password) {
        return yield* reject('issuer_metadata_invalid')
      }
      const hostname = parsed.hostname
      if (isIP(hostname.replace(/^\[|\]$/g, '')) !== 0) return yield* reject('issuer_metadata_invalid')
      const body = yield* Effect.tryPromise({
        try: async (signal) => {
          const deadline = AbortSignal.any([signal, AbortSignal.timeout(ISSUER_FETCH_TIMEOUT_MS)])
          const addresses = await transport.lookup(hostname, deadline)
          if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
            throw new Error('Issuer host does not resolve to public addresses only')
          }
          const response = await transport.fetch(
            parsed.toString(),
            { method: 'GET', redirect: 'manual', headers: { Accept: 'application/json' }, signal: deadline },
            addresses,
          )
          // A redirect (`manual` answers 3xx, or an opaque redirect with status 0) is not followed
          if (response.status !== 200) throw new Error(`Issuer answered ${response.status}`)
          const declared = Number(response.headers.get('content-length') ?? '0')
          if (declared > ISSUER_FETCH_MAX_BYTES) throw new Error('Issuer response too large')
          const reader = response.body?.getReader()
          if (!reader) throw new Error('Issuer response has no body')
          const chunks: Uint8Array[] = []
          let size = 0
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            size += value.byteLength
            if (size > ISSUER_FETCH_MAX_BYTES) {
              await reader.cancel()
              throw new Error('Issuer response too large')
            }
            chunks.push(value)
          }
          return Buffer.concat(chunks).toString('utf8')
        },
        catch: (cause) => new TransportFailure({ cause }),
      }).pipe(Effect.mapError(() => new EvpRejected({ reason: 'issuer_unreachable' })))
      const json = yield* Effect.try({
        try: (): unknown => JSON.parse(body),
        catch: (cause) => new TransportFailure({ cause }),
      }).pipe(Effect.mapError(() => new EvpRejected({ reason: 'issuer_metadata_invalid' })))
      return json
    })

  /** Draft -02 §3.3: metadata whose `issuer` is the identifier it was fetched under, then its `jwks_uri` */
  const loadIssuerKeys = (issuer: string) =>
    Effect.gen(function* () {
      const metadata = yield* fetchJson(`${issuer}/.well-known/email-verification`)
      if (!isRecord(metadata) || metadata.issuer !== issuer || typeof metadata.jwks_uri !== 'string') {
        return yield* reject('issuer_metadata_invalid')
      }
      const algorithms = metadata.signing_alg_values_supported
      if (algorithms !== undefined && (!Array.isArray(algorithms) || !algorithms.every((a) => typeof a === 'string'))) {
        return yield* reject('issuer_metadata_invalid')
      }
      const jwks = yield* fetchJson(metadata.jwks_uri)
      if (!isRecord(jwks) || !Array.isArray(jwks.keys)) return yield* reject('issuer_metadata_invalid')
      const keys = (jwks.keys as unknown[]).filter((key): key is JWK => isRecord(key) && !('d' in key))
      const fetchedAt = yield* Clock.currentTimeMillis
      const loaded: IssuerKeys = {
        signingAlgorithms: algorithms as string[] | undefined,
        keys: keys.slice(0, MAX_JWKS_KEYS),
        jwksUri: metadata.jwks_uri,
        fetchedAt,
      }
      cache.delete(issuer)
      cache.set(issuer, loaded)
      if (cache.size > MAX_CACHED_ISSUERS) cache.delete(cache.keys().next().value!)
      return loaded
    })

  const issuerKeys = (issuer: string, { refresh }: { refresh: boolean }) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const cached = cache.get(issuer)
      if (cached && now - cached.fetchedAt < ISSUER_CACHE_TTL_MS) {
        if (!refresh || now - cached.fetchedAt < JWKS_REFRESH_COOLDOWN_MS) return cached
      }
      const failed = recentFailure(`issuer:${issuer}`, now)
      if (failed) return yield* reject(failed)
      return yield* loadIssuerKeys(issuer).pipe(
        Effect.tapError(({ reason }) => rememberFailure(`issuer:${issuer}`, reason)),
      )
    })

  /**
   * The issuer's keys that could have signed the EVT. Keys carrying a `kid` are matched by it; a JWKS without any
   * `kid` (Gmail's) offers every key usable with the algorithm.
   */
  const candidateKeys = (keys: readonly JWK[], kid: string | undefined, alg: SupportedAlgorithm) => {
    const usable = keys.filter(
      (key) =>
        (key.alg === undefined || sameAlgorithm(key.alg, alg)) &&
        (key.use === undefined || key.use === 'sig') &&
        (alg === 'Ed25519' || alg === 'EdDSA'
          ? key.kty === 'OKP' && key.crv === 'Ed25519'
          : key.kty === 'EC' && key.crv === (alg === 'ES256' ? 'P-256' : 'P-384')),
    )
    if (keys.some((key) => typeof key.kid === 'string')) {
      return kid === undefined ? [] : usable.filter((key) => key.kid === kid)
    }
    return usable
  }

  /** Verifies a JWS with one key; `undefined` if the signature doesn't check out */
  const verifyWith = (jwt: string, jwk: JWK, alg: SupportedAlgorithm, typ: string, now: number) =>
    Effect.tryPromise({
      try: async (): Promise<JWTVerifyResult | undefined> => {
        const key = await importJWK({ ...jwk, alg }, alg)
        return await jwtVerify(jwt, key, {
          algorithms: [alg],
          typ,
          currentDate: new Date(now),
          clockTolerance: CLOCK_SKEW_SECONDS,
        })
      },
      catch: (cause) => new TransportFailure({ cause }),
    }).pipe(Effect.orElseSucceed(() => undefined))

  const checkTimes = (claims: JWTPayload, nowSeconds: number) =>
    Effect.gen(function* () {
      const iat = claims.iat!
      if (iat > nowSeconds + CLOCK_SKEW_SECONDS) return yield* reject('issued_in_future')
      if (iat < nowSeconds - MAX_TOKEN_AGE_SECONDS - CLOCK_SKEW_SECONDS) return yield* reject('expired')
      if (claims.exp !== undefined) {
        if (typeof claims.exp !== 'number') return yield* reject('malformed')
        if (claims.exp <= nowSeconds - CLOCK_SKEW_SECONDS) return yield* reject('expired')
      }
    })

  const verify = (input: EvpVerificationInput) =>
    Effect.gen(function* () {
      const token = parseToken(input.token.trim())
      if (!token) {
        // Tell an algorithm we don't take from a token that isn't one at all
        const [evt, kb] = input.token.trim().split('~')
        const evtAlg = evt ? decode(evt)?.header.alg : undefined
        const kbAlg = kb ? decode(kb)?.header.alg : undefined
        const unsupported = [evtAlg, kbAlg].some((alg) => alg !== undefined && !isSupportedAlgorithm(alg))
        return yield* reject(unsupported ? 'unsupported_algorithm' : 'malformed')
      }
      const { evt, kb, evtHeader, evtClaims, kbAlg, kbClaims } = token
      const nowMs = yield* Clock.currentTimeMillis
      const nowSeconds = Math.floor(nowMs / 1000)

      // Everything that needs no network first. This turns away replayed and stale tokens, tokens for another site or
      // form, and broken ones before any lookup. It is no defence against a deliberate forgery: the KB-JWT is checked
      // against `cnf.jwk` from the EVT, which isn't verified yet, so anyone can mint a token that passes all of it and
      // names their own domain. What bounds the lookups that follow is the rate limit, the resolver's timeouts, the
      // public-addresses-only fetch, and the failed-lookup cache (FAILED_LOOKUP_TTL_MS).

      // WICG §4: the verified address must equal the submitted one, case aside
      if (evtClaims.email.toLowerCase() !== input.email.trim().toLowerCase()) return yield* reject('email_mismatch')
      if (evtClaims.email_verified !== true) return yield* reject('email_not_verified')

      // Draft -02 §6.5: the KB-JWT
      const cnfJwk = evtClaims.cnf.jwk
      if (typeof cnfJwk.alg === 'string' ? !sameAlgorithm(cnfJwk.alg, kbAlg) : false) {
        return yield* reject('unsupported_algorithm')
      }
      if (kbClaims.aud !== input.audience) return yield* reject('audience_mismatch')
      if (typeof kbClaims.nonce !== 'string' || kbClaims.nonce !== input.nonce) return yield* reject('nonce_mismatch')
      yield* checkTimes(kbClaims, nowSeconds)
      const expectedHash = yield* Effect.promise(() => sdHashOf(evt))
      if (kbClaims.sd_hash !== expectedHash) return yield* reject('sd_hash_mismatch')
      const boundKey = { ...cnfJwk }
      delete boundKey.alg
      if (!(yield* verifyWith(kb, boundKey, kbAlg, 'kb+jwt', nowMs))) {
        return yield* reject('key_binding_signature_invalid')
      }

      // Draft -02 §5.3: the EVT
      yield* checkTimes(evtClaims, nowSeconds)
      const domain = emailDomain(evtClaims.email)
      if (!domain) return yield* reject('malformed')
      const txtFailure = recentFailure(`txt:${domain}`, nowMs)
      if (txtFailure) return yield* reject(txtFailure)
      const records = yield* Effect.tryPromise({
        try: (signal) => transport.resolveTxt(`_email-verification.${domain}`, signal),
        catch: (cause) => new TransportFailure({ cause }),
      }).pipe(
        Effect.mapError(() => new EvpRejected({ reason: 'issuer_not_found' })),
        Effect.tapError(({ reason }) => rememberFailure(`txt:${domain}`, reason)),
      )
      const issuer = issuerFromTxtRecords(records)
      if (!issuer) return yield* reject('issuer_not_found')
      if (evtClaims.iss !== issuer) return yield* reject('issuer_mismatch')

      const tryKeys = (keys: IssuerKeys) =>
        Effect.gen(function* () {
          if (keys.signingAlgorithms && !keys.signingAlgorithms.some((alg) => sameAlgorithm(alg, evtHeader.alg))) {
            return { outcome: 'unsupported_algorithm' as const }
          }
          const candidates = candidateKeys(keys.keys, evtHeader.kid, evtHeader.alg)
          if (candidates.length === 0) return { outcome: 'unknown_key' as const }
          for (const key of candidates) {
            const verified = yield* verifyWith(evt, key, evtHeader.alg, 'evt+jwt', nowMs)
            if (verified) return { outcome: 'verified' as const }
          }
          return { outcome: 'issuer_signature_invalid' as const }
        })

      let attempt = yield* tryKeys(yield* issuerKeys(issuer, { refresh: false }))
      // A key we haven't seen may be a new one: fetch the keys again (not more than once a minute)
      if (attempt.outcome === 'unknown_key') attempt = yield* tryKeys(yield* issuerKeys(issuer, { refresh: true }))
      if (attempt.outcome !== 'verified') return yield* reject(attempt.outcome)

      return { email: evtClaims.email, issuer } satisfies EvpVerified
    })

  return { verify }
}