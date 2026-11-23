import { Effect, Layer } from 'effect'
import { exportJWK, generateKeyPair, SignJWT, type JWK, type JWTPayload, type CryptoKey } from 'jose'
import { makeEvpVerifier, sdHashOf, type EvpTransport } from '../lib/email-verification-protocol/verifier'
import type * as EvpServiceModule from '../services/email-verification-protocol'

/**
 * A fixture Email Verification Protocol issuer (gekichumai/meta#80): its keys, its DNS delegation, its metadata and
 * JWKS, all in memory, and a browser that mints `<EVT>~<KB-JWT>` tokens with it. Unit tests build a verifier over
 * {@link FixtureIssuer.transport}; integration tests swap the live verifier for one over {@link fixtureIssuer} before
 * the application loads:
 *
 *   vi.mock('../services/email-verification-protocol', async (importOriginal) =>
 *     (await import('./evp-fixture-issuer')).withFixtureIssuer(await importOriginal()),
 *   )
 *
 * Nothing in production can reach it: the live service always uses real DNS and HTTPS.
 */

export const FIXTURE_EMAIL_DOMAIN = 'mail.example'
export const FIXTURE_ISSUER_HOST = 'issuer.example'
export const FIXTURE_ISSUER = `https://${FIXTURE_ISSUER_HOST}`
export const FIXTURE_METADATA_URL = `${FIXTURE_ISSUER}/.well-known/email-verification`
export const FIXTURE_JWKS_URL = 'https://keys.issuer.example/jwks'
export const FIXTURE_KID = 'fixture-2026'

type KeyPair = { readonly publicKey: CryptoKey; readonly privateKey: CryptoKey }

export interface MintOptions {
  readonly email: string
  readonly audience: string
  readonly nonce: string
  /** Seconds since the epoch; defaults to now */
  readonly now?: number
  readonly evtHeader?: Record<string, unknown>
  readonly evtClaims?: Record<string, unknown>
  readonly kbHeader?: Record<string, unknown>
  readonly kbClaims?: Record<string, unknown>
  /** Signs the EVT with another key than the issuer's */
  readonly evtSigner?: CryptoKey
  /** Signs the KB-JWT with another key than the one the EVT binds */
  readonly kbSigner?: CryptoKey
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init })

export class FixtureIssuer {
  /** TXT records by name */
  readonly dns = new Map<string, string[][]>()
  /** Responses by URL (built per request) */
  readonly routes = new Map<string, () => Response>()
  /** Every URL fetched, in order */
  readonly fetched: string[] = []
  /** Addresses host names resolve to; any other host resolves to a public address */
  readonly addresses = new Map<string, string[]>()

  private constructor(
    readonly issuerKeys: KeyPair,
    readonly issuerJwk: JWK,
  ) {}

  static async create() {
    const issuerKeys = await generateKeyPair('Ed25519', { extractable: true })
    const issuerJwk = { ...(await exportJWK(issuerKeys.publicKey)), kid: FIXTURE_KID, alg: 'Ed25519', use: 'sig' }
    const fixture = new FixtureIssuer(issuerKeys, issuerJwk)
    fixture.reset()
    return fixture
  }

  /** The delegation, metadata and keys of a well-behaved issuer, and nothing fetched yet */
  reset() {
    this.dns.clear()
    this.routes.clear()
    this.addresses.clear()
    this.fetched.length = 0
    this.dns.set(`_email-verification.${FIXTURE_EMAIL_DOMAIN}`, [[`iss=${FIXTURE_ISSUER_HOST}`]])
    this.routes.set(FIXTURE_METADATA_URL, () =>
      json({
        issuer: FIXTURE_ISSUER,
        issuance_endpoint: `${FIXTURE_ISSUER}/email-verification/issuance`,
        jwks_uri: FIXTURE_JWKS_URL,
        signing_alg_values_supported: ['Ed25519'],
      }),
    )
    this.routes.set(FIXTURE_JWKS_URL, () => json({ keys: [this.issuerJwk] }))
  }

  readonly transport: EvpTransport = {
    resolveTxt: async (name) => {
      const records = this.dns.get(name)
      if (!records) throw Object.assign(new Error(`queryTxt ENOTFOUND ${name}`), { code: 'ENOTFOUND' })
      return records
    },
    lookup: async (hostname) => this.addresses.get(hostname) ?? ['93.184.216.34'],
    fetch: async (url) => {
      this.fetched.push(url)
      const route = this.routes.get(url)
      return route ? route() : new Response('not found', { status: 404 })
    },
  }

  /** A token as Chrome would fill it in: an EVT from this issuer for `email`, bound to `audience` and `nonce` */
  async mint(options: MintOptions) {
    const now = options.now ?? Math.floor(Date.now() / 1000)
    const browserKeys = await generateKeyPair('Ed25519', { extractable: true })
    const browserJwk = { ...(await exportJWK(browserKeys.publicKey)), alg: 'Ed25519' }
    const evtClaims: JWTPayload = {
      iss: FIXTURE_ISSUER,
      iat: now,
      cnf: { jwk: browserJwk },
      email: options.email,
      email_verified: true,
      ...options.evtClaims,
    }
    const evt = await new SignJWT(evtClaims)
      .setProtectedHeader({ alg: 'Ed25519', kid: FIXTURE_KID, typ: 'evt+jwt', ...options.evtHeader } as never)
      .sign(options.evtSigner ?? this.issuerKeys.privateKey)
    const kb = await new SignJWT({
      aud: options.audience,
      nonce: options.nonce,
      iat: now,
      sd_hash: await sdHashOf(evt),
      ...options.kbClaims,
    })
      .setProtectedHeader({ alg: 'Ed25519', typ: 'kb+jwt', ...options.kbHeader } as never)
      .sign(options.kbSigner ?? browserKeys.privateKey)
    return `${evt}~${kb}`
  }

  /** A fresh Ed25519 key that isn't the issuer's or the browser's */
  static async strangerKey() {
    return (await generateKeyPair('Ed25519')).privateKey
  }
}

/** The fixture issuer integration tests share with the verifier they swap in */
export const fixtureIssuer = await FixtureIssuer.create()

/** The service module with its live layer verifying against {@link fixtureIssuer} */
export const withFixtureIssuer = (original: typeof EvpServiceModule): typeof EvpServiceModule => ({
  ...original,
  EmailVerificationProtocolLive: Layer.effect(
    original.EmailVerificationProtocol,
    Effect.sync(() => makeEvpVerifier(fixtureIssuer.transport)),
  ) as typeof original.EmailVerificationProtocolLive,
})