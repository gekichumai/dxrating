import { Effect } from 'effect'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  FIXTURE_EMAIL_DOMAIN,
  FIXTURE_ISSUER,
  FIXTURE_ISSUER_HOST,
  FIXTURE_JWKS_URL,
  FIXTURE_METADATA_URL,
  FixtureIssuer,
  type MintOptions,
} from '../../test/evp-fixture-issuer'
import { checkNonce, issueNonce, NONCE_TTL_SECONDS } from './nonce'
import {
  ISSUER_FETCH_MAX_BYTES,
  MAX_TOKEN_AGE_SECONDS,
  emailDomain,
  isPublicAddress,
  issuerFromTxtRecords,
  makeEvpVerifier,
  sdHashOf,
  type EvpVerificationInput,
} from './verifier'

const AUDIENCE = 'https://dxrating.net'
const NONCE = 'v1.form-nonce'
const EMAIL = `player@${FIXTURE_EMAIL_DOMAIN}`

const issuer = await FixtureIssuer.create()
let verifier = makeEvpVerifier(issuer.transport)

beforeEach(() => {
  issuer.reset()
  // A new verifier each time: no metadata cached from another test
  verifier = makeEvpVerifier(issuer.transport)
})

const outcome = (input: EvpVerificationInput) =>
  Effect.runPromise(
    verifier.verify(input).pipe(
      Effect.map((verified) => ({ ok: true as const, ...verified })),
      Effect.catchTag('EvpRejected', ({ reason }) => Effect.succeed({ ok: false as const, reason })),
    ),
  )

const mintAndVerify = async (options: Partial<MintOptions> = {}, input: Partial<EvpVerificationInput> = {}) =>
  outcome({
    token: await issuer.mint({ email: EMAIL, audience: AUDIENCE, nonce: NONCE, ...options }),
    email: EMAIL,
    audience: AUDIENCE,
    nonce: NONCE,
    ...input,
  })

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

describe('Email Verification Protocol verifier', () => {
  it('accepts a token from the delegated issuer for the submitted address, origin and nonce', async () => {
    expect(await mintAndVerify()).toEqual({ ok: true, email: EMAIL, issuer: FIXTURE_ISSUER })
    expect(issuer.fetched).toEqual([FIXTURE_METADATA_URL, FIXTURE_JWKS_URL])
  })

  it('compares addresses case-insensitively (WICG §4)', async () => {
    expect(await mintAndVerify({ email: 'Player@Mail.Example' }, { email: EMAIL })).toMatchObject({ ok: true })
  })

  it('caches the metadata and keys', async () => {
    await mintAndVerify()
    await mintAndVerify()
    expect(issuer.fetched).toHaveLength(2)
  })

  it('rejects a token for another address', async () => {
    expect(await mintAndVerify({ email: `someone@${FIXTURE_EMAIL_DOMAIN}` })).toEqual({
      ok: false,
      reason: 'email_mismatch',
    })
  })

  it('rejects an address the issuer did not call verified', async () => {
    expect(await mintAndVerify({ evtClaims: { email_verified: false } })).toEqual({
      ok: false,
      reason: 'email_not_verified',
    })
  })

  it('rejects a token bound to another site', async () => {
    expect(await mintAndVerify({ audience: 'https://evil.example' })).toEqual({
      ok: false,
      reason: 'audience_mismatch',
    })
  })

  it('rejects a token bound to another form', async () => {
    expect(await mintAndVerify({ nonce: 'v1.another-form' })).toEqual({ ok: false, reason: 'nonce_mismatch' })
  })

  it('rejects old tokens, expired ones, and ones from the future', async () => {
    const now = Math.floor(Date.now() / 1000)
    const old = now - MAX_TOKEN_AGE_SECONDS - 120
    expect(await mintAndVerify({ now: old })).toEqual({ ok: false, reason: 'expired' })
    expect(await mintAndVerify({ evtClaims: { iat: old } })).toEqual({ ok: false, reason: 'expired' })
    expect(await mintAndVerify({ evtClaims: { exp: now - 300 } })).toEqual({ ok: false, reason: 'expired' })
    expect(await mintAndVerify({ kbClaims: { exp: now - 300 } })).toEqual({ ok: false, reason: 'expired' })
    expect(await mintAndVerify({ now: now + 600 })).toEqual({ ok: false, reason: 'issued_in_future' })
    // Within the clock skew either way
    expect(await mintAndVerify({ now: now + 30 })).toMatchObject({ ok: true })
  })

  it("rejects an EVT the issuer didn't sign", async () => {
    expect(await mintAndVerify({ evtSigner: await FixtureIssuer.strangerKey() })).toEqual({
      ok: false,
      reason: 'issuer_signature_invalid',
    })
  })

  it("rejects a KB-JWT the bound key didn't sign", async () => {
    expect(await mintAndVerify({ kbSigner: await FixtureIssuer.strangerKey() })).toEqual({
      ok: false,
      reason: 'key_binding_signature_invalid',
    })
    // ...before asking the issuer anything
    expect(issuer.fetched).toEqual([])
  })

  it('rejects a KB-JWT that hashes another EVT', async () => {
    expect(await mintAndVerify({ kbClaims: { sd_hash: await sdHashOf('another.evt.value') } })).toEqual({
      ok: false,
      reason: 'sd_hash_mismatch',
    })
  })

  it('rejects an issuer the address domain did not delegate to', async () => {
    issuer.dns.set(`_email-verification.${FIXTURE_EMAIL_DOMAIN}`, [['iss=other-issuer.example']])
    expect(await mintAndVerify()).toEqual({ ok: false, reason: 'issuer_mismatch' })
    expect(issuer.fetched).toEqual([])
  })

  it('rejects an address whose domain names no issuer, or more than one', async () => {
    issuer.dns.clear()
    expect(await mintAndVerify()).toEqual({ ok: false, reason: 'issuer_not_found' })
    verifier = makeEvpVerifier(issuer.transport)
    issuer.dns.set(`_email-verification.${FIXTURE_EMAIL_DOMAIN}`, [['iss=issuer.example'], ['iss=issuer.example']])
    expect(await mintAndVerify()).toEqual({ ok: false, reason: 'issuer_not_found' })
  })

  it('does not look a failed domain or issuer up again for a while', async () => {
    let txtLookups = 0
    verifier = makeEvpVerifier({
      ...issuer.transport,
      resolveTxt: (name, signal) => {
        txtLookups += 1
        return issuer.transport.resolveTxt(name, signal)
      },
    })
    issuer.dns.clear()
    expect(await mintAndVerify()).toEqual({ ok: false, reason: 'issuer_not_found' })
    issuer.reset()
    expect(await mintAndVerify()).toEqual({ ok: false, reason: 'issuer_not_found' })
    expect(txtLookups).toBe(1)

    verifier = makeEvpVerifier(issuer.transport)
    issuer.routes.set(FIXTURE_METADATA_URL, () => new Response('down', { status: 503 }))
    expect(await mintAndVerify()).toEqual({ ok: false, reason: 'issuer_unreachable' })
    issuer.reset()
    expect(await mintAndVerify()).toEqual({ ok: false, reason: 'issuer_unreachable' })
    expect(issuer.fetched).toEqual([])
  })

  it('passes the checked addresses on to the fetch, and lets an abort reach the lookups', async () => {
    const seen: { readonly url: string; readonly addresses: readonly string[] }[] = []
    const signals: (AbortSignal | undefined)[] = []
    verifier = makeEvpVerifier({
      resolveTxt: (name, signal) => {
        signals.push(signal)
        return issuer.transport.resolveTxt(name, signal)
      },
      lookup: (hostname, signal) => {
        signals.push(signal)
        return issuer.transport.lookup(hostname, signal)
      },
      fetch: (url, init, addresses) => {
        seen.push({ url, addresses })
        return issuer.transport.fetch(url, init, addresses)
      },
    })
    issuer.addresses.set(FIXTURE_ISSUER_HOST, ['93.184.216.34', '2607:f8b0:4005:80b::200e'])
    expect(await mintAndVerify()).toMatchObject({ ok: true })
    expect(seen[0]).toEqual({ url: FIXTURE_METADATA_URL, addresses: ['93.184.216.34', '2607:f8b0:4005:80b::200e'] })
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true)
  })

  it('rejects metadata that names another issuer', async () => {
    issuer.routes.set(FIXTURE_METADATA_URL, () =>
      json({ issuer: 'https://other-issuer.example', issuance_endpoint: 'x', jwks_uri: FIXTURE_JWKS_URL }),
    )
    expect(await mintAndVerify()).toEqual({ ok: false, reason: 'issuer_metadata_invalid' })
  })

  it('rejects a kid the issuer has no key for, after fetching the keys again', async () => {
    expect(await mintAndVerify({ evtHeader: { kid: 'rotated-away' } })).toEqual({ ok: false, reason: 'unknown_key' })
    expect(issuer.fetched).toEqual([FIXTURE_METADATA_URL, FIXTURE_JWKS_URL])
  })

  it('picks up a rotated key after the refetch cooldown', async () => {
    expect(await mintAndVerify()).toMatchObject({ ok: true })
    const rotated = await generateKeyPair('Ed25519', { extractable: true })
    const jwk = { ...(await exportJWK(rotated.publicKey)), kid: 'next', alg: 'Ed25519' }
    issuer.routes.set(FIXTURE_JWKS_URL, () => json({ keys: [issuer.issuerJwk, jwk] }))
    // Within the cooldown the cached keys are used; a new verifier stands in for "a minute later"
    expect(await mintAndVerify({ evtHeader: { kid: 'next' }, evtSigner: rotated.privateKey })).toEqual({
      ok: false,
      reason: 'unknown_key',
    })
    verifier = makeEvpVerifier(issuer.transport)
    expect(await mintAndVerify({ evtHeader: { kid: 'next' }, evtSigner: rotated.privateKey })).toMatchObject({
      ok: true,
    })
  })

  it("takes Gmail's form: EdDSA, and a JWKS whose keys carry no kid", async () => {
    const { kid: _kid, ...withoutKid } = issuer.issuerJwk
    const other = { ...(await exportJWK((await generateKeyPair('Ed25519')).publicKey)), alg: 'EdDSA' }
    issuer.routes.set(FIXTURE_JWKS_URL, () => json({ keys: [other, { ...withoutKid, alg: 'EdDSA' }] }))
    issuer.routes.set(FIXTURE_METADATA_URL, () =>
      json({
        issuer: FIXTURE_ISSUER,
        issuance_endpoint: 'x',
        jwks_uri: FIXTURE_JWKS_URL,
        signing_alg_values_supported: ['EdDSA'],
      }),
    )
    expect(await mintAndVerify({ evtHeader: { alg: 'EdDSA', kid: '2024-08-19' } })).toMatchObject({ ok: true })
  })

  it('refuses algorithms outside the list, and an EVT alg the issuer does not use', async () => {
    const [evt, kb] = (await issuer.mint({ email: EMAIL, audience: AUDIENCE, nonce: NONCE })).split('~')
    const unsigned = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'evt+jwt' })).toString('base64url')}.${evt!.split('.')[1]}.`
    expect(await outcome({ token: `${unsigned}~${kb}`, email: EMAIL, audience: AUDIENCE, nonce: NONCE })).toEqual({
      ok: false,
      reason: 'unsupported_algorithm',
    })
    const hmac = await new SignJWT({ iss: FIXTURE_ISSUER })
      .setProtectedHeader({ alg: 'HS256', typ: 'evt+jwt' })
      .sign(new Uint8Array(32))
    expect(await outcome({ token: `${hmac}~${kb}`, email: EMAIL, audience: AUDIENCE, nonce: NONCE })).toEqual({
      ok: false,
      reason: 'unsupported_algorithm',
    })
    issuer.routes.set(FIXTURE_METADATA_URL, () =>
      json({
        issuer: FIXTURE_ISSUER,
        issuance_endpoint: 'x',
        jwks_uri: FIXTURE_JWKS_URL,
        signing_alg_values_supported: ['ES256'],
      }),
    )
    expect(await mintAndVerify()).toEqual({ ok: false, reason: 'unsupported_algorithm' })
  })

  it('rejects malformed tokens', async () => {
    const token = await issuer.mint({ email: EMAIL, audience: AUDIENCE, nonce: NONCE })
    const [evt, kb] = token.split('~') as [string, string]
    for (const malformed of [
      '',
      'not-a-token',
      evt,
      `${evt}~`,
      `${evt}~disclosure~${kb}`,
      `${kb}~${evt}`,
      'a.b.c~d.e.f',
    ]) {
      expect(await outcome({ token: malformed, email: EMAIL, audience: AUDIENCE, nonce: NONCE })).toEqual({
        ok: false,
        reason: 'malformed',
      })
    }
    expect(await mintAndVerify({ evtHeader: { typ: 'JWT' } })).toEqual({ ok: false, reason: 'malformed' })
    expect(await mintAndVerify({ evtClaims: { cnf: { jwk: { kty: 'oct', k: 'AAAA' } } } })).toEqual({
      ok: false,
      reason: 'malformed',
    })
  })

  it('fetches only over HTTPS, without redirects, from public addresses, and within the size limit', async () => {
    issuer.routes.set(FIXTURE_METADATA_URL, () =>
      json({ issuer: FIXTURE_ISSUER, issuance_endpoint: 'x', jwks_uri: 'http://keys.issuer.example/jwks' }),
    )
    expect(await mintAndVerify()).toEqual({ ok: false, reason: 'issuer_metadata_invalid' })

    issuer.reset()
    verifier = makeEvpVerifier(issuer.transport)
    issuer.routes.set(
      FIXTURE_METADATA_URL,
      () => new Response(null, { status: 302, headers: { Location: 'https://elsewhere.example/' } }),
    )
    expect(await mintAndVerify()).toEqual({ ok: false, reason: 'issuer_unreachable' })

    issuer.reset()
    verifier = makeEvpVerifier(issuer.transport)
    issuer.addresses.set(FIXTURE_ISSUER_HOST, ['10.0.0.5'])
    expect(await mintAndVerify()).toEqual({ ok: false, reason: 'issuer_unreachable' })
    expect(issuer.fetched).toEqual([])

    issuer.reset()
    verifier = makeEvpVerifier(issuer.transport)
    issuer.routes.set(FIXTURE_JWKS_URL, () => new Response('x'.repeat(ISSUER_FETCH_MAX_BYTES + 1), { status: 200 }))
    expect(await mintAndVerify()).toEqual({ ok: false, reason: 'issuer_unreachable' })
  })
})

describe('issuer discovery helpers', () => {
  it('reads exactly one iss= record (draft -02 §3.1)', () => {
    expect(issuerFromTxtRecords([['iss=accounts.google.com']])).toBe('https://accounts.google.com')
    expect(issuerFromTxtRecords([['iss=accounts.', 'google.com']])).toBe('https://accounts.google.com')
    expect(issuerFromTxtRecords([])).toBeUndefined()
    expect(issuerFromTxtRecords([['v=spf1 -all']])).toBeUndefined()
    expect(issuerFromTxtRecords([['iss=https://accounts.google.com']])).toBeUndefined()
    expect(issuerFromTxtRecords([['iss=127.0.0.1']])).toBeUndefined()
    expect(issuerFromTxtRecords([['iss=a.example'], ['iss=b.example']])).toBeUndefined()
  })

  it('takes the domain after the last @, in ASCII', () => {
    expect(emailDomain('a@Gmail.COM')).toBe('gmail.com')
    expect(emailDomain('a@bücher.example')).toBe('xn--bcher-kva.example')
    expect(emailDomain('no-domain@')).toBeUndefined()
  })

  it('tells public addresses from private ones', () => {
    expect(isPublicAddress('142.250.72.14')).toBe(true)
    expect(isPublicAddress('2607:f8b0:4005:80b::200e')).toBe(true)
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '192.168.1.1',
      '169.254.169.254',
      '::1',
      'fd00::1',
      '::ffff:10.0.0.1',
    ]) {
      expect(isPublicAddress(address)).toBe(false)
    }
  })
})

describe('form nonces', () => {
  const secret = 'test-secret'
  const now = Date.UTC(2026, 10, 24)

  it('accepts its own nonce until it expires', () => {
    const { nonce, expiresAt } = issueNonce(secret, now)
    expect(nonce).toMatch(/^v1\.[\w-]{22}\.[0-9a-z]+\.[\w-]{43}$/)
    expect(checkNonce(secret, nonce, now)).toEqual({ valid: true, expiresAt })
    expect(checkNonce(secret, nonce, now + NONCE_TTL_SECONDS * 1000)).toEqual({ valid: false })
  })

  it('refuses a nonce signed with another secret, or altered', () => {
    const { nonce } = issueNonce(secret, now)
    expect(checkNonce('another-secret', nonce, now)).toEqual({ valid: false })
    const [version, random, expiry, signature] = nonce.split('.')
    const later = (Number.parseInt(expiry!, 36) + 3600).toString(36)
    expect(checkNonce(secret, `${version}.${random}.${later}.${signature}`, now)).toEqual({ valid: false })
    expect(checkNonce(secret, 'v1.form-nonce', now)).toEqual({ valid: false })
    expect(checkNonce(secret, '', now)).toEqual({ valid: false })
  })

  it('makes a different nonce each time', () => {
    expect(issueNonce(secret, now).nonce).not.toBe(issueNonce(secret, now).nonce)
  })
})